import { createResearchTaskSchema } from "@quarry/contracts";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import { col, isDuplicateKey, parseObjectId } from "../../db.js";
import { asyncRoute, HttpError, validate } from "../../http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { TaskDoc } from "../../types.js";
import { attachUsageTask, releaseUsage, reserveResearchRun } from "../billing/usage.js";
import { presentTask } from "../files/files.routes.js";
import { loadProject } from "../projects/projects.routes.js";
import { enqueue, removeQueued } from "./runner.js";

const taskLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId.toHexString() ?? req.ip ?? "anonymous",
});

export const taskRouter = Router();
taskRouter.use(requireAuth);

taskRouter.post("/tasks", taskLimit, validate(createResearchTaskSchema), asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.body.projectId);
  const idempotencyKey = req.get("Idempotency-Key")?.trim().slice(0, 200) || undefined;
  if (idempotencyKey) {
    const existing = await col<TaskDoc>("tasks").findOne({ workspaceId: project.workspaceId, idempotencyKey });
    if (existing) {
      res.status(200).json(presentTask(existing));
      return;
    }
  }

  const usageEventId = await reserveResearchRun(project.workspaceId);
  const now = new Date();
  const task: TaskDoc = {
    _id: new ObjectId(),
    workspaceId: project.workspaceId,
    projectId: project._id,
    type: "research",
    status: "queued",
    input: {
      question: req.body.question,
      options: req.body.options ?? {},
      metadata: req.body.metadata ?? {},
    },
    progress: { step: "queued", percent: 0 },
    usageEventId,
    idempotencyKey,
    createdBy: req.auth!.userId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await col<TaskDoc>("tasks").insertOne(task);
  } catch (error) {
    await releaseUsage(usageEventId);
    if (isDuplicateKey(error) && idempotencyKey) {
      const existing = await col<TaskDoc>("tasks").findOne({ workspaceId: project.workspaceId, idempotencyKey });
      if (existing) {
        res.status(200).json(presentTask(existing));
        return;
      }
    }
    throw error;
  }
  await attachUsageTask(usageEventId, task._id);
  enqueue(task._id);
  res.status(202).json(presentTask(task));
}));

taskRouter.get("/projects/:id/tasks", asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.params.id);
  const tasks = await col<TaskDoc>("tasks")
    .find({ workspaceId: project.workspaceId, projectId: project._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  res.json({ tasks: tasks.map(presentTask) });
}));

taskRouter.get("/tasks/:id", asyncRoute(async (req, res) => {
  res.json(presentTask(await loadTask(req.auth!.workspaceId, req.params.id)));
}));

taskRouter.post("/tasks/:id/run", asyncRoute(async (req, res) => {
  const task = await loadTask(req.auth!.workspaceId, req.params.id);
  if (task.status === "queued" || task.status === "running") {
    res.json(presentTask(task));
    return;
  }
  throw new HttpError(409, "not_runnable", "Create a new research task to run again");
}));

taskRouter.post("/tasks/:id/cancel", asyncRoute(async (req, res) => {
  const task = await loadTask(req.auth!.workspaceId, req.params.id);
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    throw new HttpError(409, "not_cancellable", "That task is already finished");
  }
  removeQueued(task._id);
  await col<TaskDoc>("tasks").updateOne(
    { _id: task._id },
    { $set: { cancelRequested: true, status: task.status === "queued" ? "cancelled" : task.status, updatedAt: new Date(), finishedAt: task.status === "queued" ? new Date() : task.finishedAt } },
  );
  if (task.status === "queued" && task.usageEventId) await releaseUsage(task.usageEventId);
  const updated = await loadTask(req.auth!.workspaceId, task._id.toHexString());
  res.json(presentTask(updated));
}));

async function loadTask(workspaceId: ObjectId, id: string): Promise<TaskDoc> {
  const taskId = parseObjectId(id);
  if (!taskId) throw new HttpError(404, "not_found", "Task not found");
  const task = await col<TaskDoc>("tasks").findOne({ _id: taskId, workspaceId });
  if (!task) throw new HttpError(404, "not_found", "Task not found");
  return task;
}
