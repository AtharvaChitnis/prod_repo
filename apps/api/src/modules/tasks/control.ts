import type { ObjectId } from "mongodb";
import { col } from "../../db.js";
import { CancelledError } from "../../http.js";
import type { TaskDoc } from "../../types.js";

export async function assertNotCancelled(taskId: ObjectId): Promise<void> {
  const task = await col<TaskDoc>("tasks").findOne(
    { _id: taskId },
    { projection: { status: 1, cancelRequested: 1 } },
  );
  if (!task || task.status === "cancelled" || task.cancelRequested) throw new CancelledError();
}
