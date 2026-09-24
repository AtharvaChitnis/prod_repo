import { Router } from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import { col } from "../../db.js";
import { asyncRoute, HttpError } from "../../http.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkspaceDoc } from "../../access.js";
import type { ChunkDoc, FileDoc, TaskDoc } from "../../types.js";
import { currentEntitlement } from "../billing/usage.js";
import { loadProject } from "../projects/projects.routes.js";
import { createTaskRecord, presentTask } from "../tasks/record.js";
import { enqueue } from "../tasks/runner.js";
import { safeFilename } from "./extract.js";
import { storage } from "./storage.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

export const fileRouter = Router();
fileRouter.use(requireAuth);

fileRouter.post("/projects/:id/files", upload.single("file"), asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.params.id);
  if (!req.file) throw new HttpError(400, "file_required", "Choose a file to upload");
  const named = safeFilename(req.file.originalname);
  const { entitlement } = await currentEntitlement(project.workspaceId);
  if (req.file.size > entitlement.maxFileBytes) {
    throw new HttpError(413, "file_too_large", "That file is larger than the current plan allows");
  }
  const existing = await col<FileDoc>("files").countDocuments({ workspaceId: project.workspaceId });
  if (existing >= entitlement.maxFiles) {
    throw new HttpError(402, "plan_limit", "File limit for the current plan is reached");
  }

  const now = new Date();
  const fileId = new ObjectId();
  const file: FileDoc = {
    _id: fileId,
    workspaceId: project.workspaceId,
    projectId: project._id,
    filename: named.filename,
    contentType: named.contentType,
    bytes: req.file.size,
    storageKey: `workspaces/${project.workspaceId.toHexString()}/files/${fileId.toHexString()}`,
    status: "uploaded",
    chunkCount: 0,
    truncated: false,
    createdBy: req.auth!.userId,
    createdAt: now,
    updatedAt: now,
  };
  await storage().put(file.storageKey, req.file.buffer, named.contentType);
  await col<FileDoc>("files").insertOne(file);
  const task = await queueIngest(file, req.auth!.userId);
  res.status(201).json({ file: presentFile(file), task: presentTask(task) });
}));

fileRouter.get("/projects/:id/files", asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.params.id);
  const files = await col<FileDoc>("files")
    .find({ workspaceId: project.workspaceId, projectId: project._id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ files: files.map(presentFile) });
}));

fileRouter.get("/files/:id", asyncRoute(async (req, res) => {
  res.json(presentFile(await loadFile(req.auth!.workspaceId, req.params.id)));
}));

fileRouter.delete("/files/:id", asyncRoute(async (req, res) => {
  const file = await loadFile(req.auth!.workspaceId, req.params.id);
  await storage().delete(file.storageKey).catch(() => undefined);
  await col<ChunkDoc>("chunks").deleteMany({ fileId: file._id });
  await col<FileDoc>("files").deleteOne({ _id: file._id });
  res.status(204).end();
}));

fileRouter.post("/files/:id/ingest", asyncRoute(async (req, res) => {
  const file = await loadFile(req.auth!.workspaceId, req.params.id);
  if (file.status === "processing") throw new HttpError(409, "already_processing", "That file is already being processed");
  const task = await queueIngest(file, req.auth!.userId);
  res.status(202).json({ task: presentTask(task) });
}));

async function queueIngest(file: FileDoc, userId: ObjectId): Promise<TaskDoc> {
  const task = createTaskRecord({
    workspaceId: file.workspaceId,
    projectId: file.projectId,
    type: "ingest",
    createdBy: userId,
    input: { fileId: file._id.toHexString() },
  });
  await col<TaskDoc>("tasks").insertOne(task);
  await col<FileDoc>("files").updateOne(
    { _id: file._id },
    { $set: { status: "processing", updatedAt: task.updatedAt, error: undefined } },
  );
  enqueue(task._id);
  return task;
}

function loadFile(workspaceId: ObjectId, id: string): Promise<FileDoc> {
  return requireWorkspaceDoc<FileDoc>("files", workspaceId, id, "File");
}

export function presentFile(file: FileDoc) {
  return {
    id: file._id.toHexString(),
    projectId: file.projectId.toHexString(),
    filename: file.filename,
    contentType: file.contentType,
    bytes: file.bytes,
    status: file.status,
    error: file.error ?? null,
    chunkCount: file.chunkCount,
    truncated: file.truncated,
    createdAt: file.createdAt,
  };
}
