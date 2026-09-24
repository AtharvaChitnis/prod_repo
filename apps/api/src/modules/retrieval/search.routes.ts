import { searchSchema } from "@quarry/contracts";
import { Router } from "express";
import { asyncRoute, validate } from "../../http.js";
import { perActorLimit } from "../../limits.js";
import { requireAuth } from "../../middleware/auth.js";
import { loadProject } from "../projects/projects.routes.js";
import { retrieve } from "./retrieve.js";

const searchLimit = perActorLimit(30);

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.post("/projects/:id/search", searchLimit, validate(searchSchema), asyncRoute(async (req, res) => {
  const project = await loadProject(req.auth!.workspaceId, req.params.id);
  const hits = await retrieve({
    workspaceId: project.workspaceId,
    projectId: project._id,
    query: req.body.query,
    limit: req.body.limit ?? 8,
  });
  res.json({
    query: req.body.query,
    metadata: req.body.metadata ?? {},
    hits: hits.map((hit) => ({
      chunkId: hit.chunkId,
      fileId: hit.fileId,
      sourceLabel: hit.sourceLabel,
      excerpt: hit.text.slice(0, 500),
      score: Number(hit.score.toFixed(4)),
    })),
  });
}));
