import { ObjectId } from "mongodb";
import { col } from "../../db.js";

export async function audit(
  workspaceId: ObjectId | undefined,
  action: string,
  actorId?: ObjectId,
  fields: Record<string, unknown> = {},
): Promise<void> {
  await col("audit_events").insertOne({
    workspaceId,
    action,
    actorId,
    fields,
    createdAt: new Date(),
  });
}
