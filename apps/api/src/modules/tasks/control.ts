import { ObjectId } from "mongodb";
import { col } from "../../db.js";
import { CancelledError } from "../../http.js";
import type { TaskDoc } from "../../types.js";

/** Workers call this between steps so a cancel request stops the job before the next model or storage call. */
export async function assertNotCancelled(taskId: ObjectId): Promise<void> {
  const task = await col<TaskDoc>("tasks").findOne(
    { _id: taskId },
    { projection: { status: 1, cancelRequested: 1 } },
  );
  if (!task || task.status === "cancelled" || task.cancelRequested) throw new CancelledError();
}

/** Only a running task accepts progress. A cancel that already flipped the status will not be overwritten. */
export async function setTaskProgress(taskId: ObjectId, step: string, percent: number): Promise<void> {
  await col<TaskDoc>("tasks").updateOne(
    { _id: taskId, status: "running" },
    { $set: { progress: { step, percent }, updatedAt: new Date() } },
  );
}
