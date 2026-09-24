import { ObjectId } from "mongodb";
import type { TaskDoc } from "../../types.js";

/** Every job, ingest or research, shares this envelope so the runner can claim and finish them the same way. */
export function createTaskRecord(fields: {
  workspaceId: ObjectId;
  projectId: ObjectId;
  type: TaskDoc["type"];
  createdBy: ObjectId;
  input: Record<string, unknown>;
  usageEventId?: ObjectId;
  idempotencyKey?: string;
}): TaskDoc {
  const now = new Date();
  return {
    _id: new ObjectId(),
    workspaceId: fields.workspaceId,
    projectId: fields.projectId,
    type: fields.type,
    status: "queued",
    input: fields.input,
    progress: { step: "queued", percent: 0 },
    usageEventId: fields.usageEventId,
    idempotencyKey: fields.idempotencyKey,
    createdBy: fields.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

/** Public task shape. Storage keys and usage reservation ids stay off the response. */
export function presentTask(task: TaskDoc) {
  return {
    id: task._id.toHexString(),
    projectId: task.projectId.toHexString(),
    type: task.type,
    status: task.status,
    input: task.input,
    progress: task.progress,
    error: task.error ?? null,
    resultId: task.resultId?.toHexString() ?? null,
    metadata: task.input.metadata ?? {},
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt ?? null,
    finishedAt: task.finishedAt ?? null,
  };
}
