import { createProjectSchema, patchProjectSchema } from "@quarry/contracts";
import { Router } from "express";
import { ObjectId } from "mongodb";
import { col, parseObjectId } from "../../db.js";
import { asyncRoute, HttpError, validate } from "../../http.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import type { ChunkDoc, FileDoc, ProjectDoc, ResultDoc, TaskDoc } from "../../types.js";
import { storage } from "../files/storage.js";

export const projectRouter = Router();
projectRouter.use(requireAuth);

projectRouter.get("/projects", asyncRoute(async (req, res) => {
  const projects = await col<ProjectDoc>("projects")
    .find({ workspaceId: req.auth!.workspaceId })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  res.json({ projects: projects.map(presentProject) });
}));

projectRouter.post("/projects", validate(createProjectSchema), asyncRoute(async (req, res) => {
  const now = new Date();
  const project: ProjectDoc = {
    _id: new ObjectId(),
    workspaceId: req.auth!.workspaceId,
    name: req.body.name,
    brief: req.body.brief ?? "",
    metadata: req.body.metadata,
    createdBy: req.auth!.userId,
    createdAt: now,
    updatedAt: now,
  };
  await col<ProjectDoc>("projects").insertOne(project);
  res.status(201).json(presentProject(project));
}));

projectRouter.get("/projects/:id", asyncRoute(async (req, res) => {
  res.json(presentProject(await loadProject(req.auth!.workspaceId, req.params.id)));
}));

projectRouter.patch("/projects/:id", validate(patchProjectSchema), asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.params.id);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.name) patch.name = req.body.name;
  if (typeof req.body.brief === "string") patch.brief = req.body.brief;
  if (req.body.metadata) patch.metadata = req.body.metadata;
  const updated = await col<ProjectDoc>("projects").findOneAndUpdate(
    { _id: project._id, workspaceId: req.auth!.workspaceId },
    { $set: patch },
    { returnDocument: "after" },
  );
  if (!updated) throw new HttpError(404, "not_found", "Project not found");
  res.json(presentProject(updated));
}));

projectRouter.delete("/projects/:id", requireRole(["owner", "admin"]), asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.params.id);
  const files = await col<FileDoc>("files").find({ workspaceId: project.workspaceId, projectId: project._id }).toArray();
  for (const file of files) {
    await storage().delete(file.storageKey).catch(() => undefined);
  }
  await col<ChunkDoc>("chunks").deleteMany({ workspaceId: project.workspaceId, projectId: project._id });
  await col<TaskDoc>("tasks").deleteMany({ workspaceId: project.workspaceId, projectId: project._id });
  await col<ResultDoc>("results").deleteMany({ workspaceId: project.workspaceId, projectId: project._id });
  await col<FileDoc>("files").deleteMany({ workspaceId: project.workspaceId, projectId: project._id });
  await col<ProjectDoc>("projects").deleteOne({ _id: project._id });
  res.status(204).end();
}));

export async function loadProject(workspaceId: ObjectId, id: string): Promise<ProjectDoc> {
  const projectId = parseObjectId(id);
  if (!projectId) throw new HttpError(404, "not_found", "Project not found");
  const project = await col<ProjectDoc>("projects").findOne({ _id: projectId, workspaceId });
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  return project;
}

export function presentProject(project: ProjectDoc) {
  return {
    id: project._id.toHexString(),
    name: project.name,
    brief: project.brief,
    metadata: project.metadata ?? {},
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
