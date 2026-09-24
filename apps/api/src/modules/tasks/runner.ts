import { ObjectId } from "mongodb";
import { col } from "../../db.js";
import { CancelledError, HttpError } from "../../http.js";
import { log } from "../../logger.js";
import type { FileDoc, TaskDoc } from "../../types.js";
import { runResearch } from "../ai/research.js";
import { consumeUsage, releaseUsage } from "../billing/usage.js";
import { ingestFile } from "../files/ingest.js";

const queue: ObjectId[] = [];
let active = 0;
const MAX_CONCURRENT = 2;

export function enqueue(id: ObjectId): void {
  queue.push(id);
  void drain();
}

export function removeQueued(id: ObjectId): void {
  const index = queue.findIndex((item) => item.equals(id));
  if (index >= 0) queue.splice(index, 1);
}

async function drain(): Promise<void> {
  while (active < MAX_CONCURRENT && queue.length) {
    const id = queue.shift();
    if (!id) return;
    active += 1;
    void run(id).finally(() => {
      active -= 1;
      void drain();
    });
  }
}

async function run(id: ObjectId): Promise<void> {
  const claimed = await col<TaskDoc>("tasks").findOneAndUpdate(
    { _id: id, status: "queued" },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
        updatedAt: new Date(),
        progress: { step: "start", percent: 5 },
      },
    },
    { returnDocument: "after" },
  );
  if (!claimed) return;

  try {
    if (claimed.type === "ingest") await ingestFile(claimed);
    else if (claimed.type === "research") await runResearch(claimed);
    else throw new HttpError(400, "invalid_task", "Unknown task type");

    const completed = await col<TaskDoc>("tasks").updateOne(
      { _id: id, status: "running" },
      { $set: { status: "completed", progress: { step: "done", percent: 100 }, finishedAt: new Date(), updatedAt: new Date() } },
    );
    if (completed.matchedCount === 0) {
      if (claimed.usageEventId) await releaseUsage(claimed.usageEventId);
      return;
    }
    if (claimed.usageEventId) await consumeUsage(claimed.usageEventId);
  } catch (error) {
    const current = await col<TaskDoc>("tasks").findOne({ _id: id });
    if (error instanceof CancelledError || current?.status === "cancelled" || current?.cancelRequested) {
      await col<TaskDoc>("tasks").updateOne(
        { _id: id },
        { $set: { status: "cancelled", finishedAt: new Date(), updatedAt: new Date() } },
      );
      if (claimed.usageEventId) await releaseUsage(claimed.usageEventId);
      return;
    }
    const message = error instanceof HttpError ? error.message : "Task failed";
    const code = error instanceof HttpError ? error.code : "task_failed";
    await col<TaskDoc>("tasks").updateOne(
      { _id: id },
      { $set: { status: "failed", error: { code, message }, finishedAt: new Date(), updatedAt: new Date() } },
    );
    if (claimed.usageEventId) await releaseUsage(claimed.usageEventId);
    log("error", "task_failed", { taskId: id.toHexString(), code });
  }
}

export async function resumeTasks(): Promise<void> {
  const interrupted = await col<TaskDoc>("tasks").find({ status: "running" }).toArray();
  for (const task of interrupted) {
    await col<TaskDoc>("tasks").updateOne(
      { _id: task._id },
      {
        $set: {
          status: "failed",
          error: { code: "interrupted", message: "Server restarted before the job finished" },
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    if (task.usageEventId) await releaseUsage(task.usageEventId);
    if (task.type === "ingest" && typeof task.input.fileId === "string") {
      await col<FileDoc>("files").updateOne(
        { _id: new ObjectId(task.input.fileId), status: "processing" },
        { $set: { status: "failed", error: "Processing was interrupted", updatedAt: new Date() } },
      );
    }
  }
  const queued = await col<TaskDoc>("tasks").find({ status: "queued" }).toArray();
  for (const task of queued) enqueue(task._id);
}
