import { Router } from "express";
import { requireWorkspaceDoc } from "../../access.js";
import { asyncRoute, HttpError } from "../../http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { ResultDoc } from "../../types.js";

export const resultRouter = Router();
resultRouter.use(requireAuth);

resultRouter.get("/results/:id", asyncRoute(async (req, res) => {
  const result = await loadResult(req.auth!.workspaceId, req.params.id);
  res.json(presentResult(result));
}));

resultRouter.get("/results/:id/export", asyncRoute(async (req, res) => {
  const result = await loadResult(req.auth!.workspaceId, req.params.id);
  const format = typeof req.query.format === "string" ? req.query.format : "json";
  if (format === "json") {
    res.setHeader("Content-Disposition", `attachment; filename="research-${result._id.toHexString()}.json"`);
    res.json(presentResult(result));
    return;
  }
  if (format === "csv") {
    const lines = ["claim,evidence,confidence,sources"];
    for (const finding of result.payload.findings) {
      lines.push([
        csv(finding.claim),
        csv(finding.evidence),
        csv(result.payload.confidence),
        csv(finding.sourceIds.join(" ")),
      ].join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="research-${result._id.toHexString()}.csv"`);
    res.send(lines.join("\n"));
    return;
  }
  throw new HttpError(400, "unsupported_export_format", "Export format is not available yet");
}));

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function loadResult(workspaceId: import("mongodb").ObjectId, id: string): Promise<ResultDoc> {
  return requireWorkspaceDoc<ResultDoc>("results", workspaceId, id, "Result");
}

function presentResult(result: ResultDoc) {
  return {
    id: result._id.toHexString(),
    projectId: result.projectId.toHexString(),
    taskId: result.taskId.toHexString(),
    payload: result.payload,
    sources: result.sources,
    createdAt: result.createdAt,
  };
}
