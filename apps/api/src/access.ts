import type { Filter, ObjectId } from "mongodb";
import { col, parseObjectId } from "./db.js";
import { HttpError } from "./http.js";

type WorkspaceRecord = { _id: ObjectId; workspaceId: ObjectId };

/**
 * Load a document only when it belongs to the caller's workspace.
 * A missing id and a cross-workspace id both return 404 so tenants cannot probe each other's records.
 */
export async function requireWorkspaceDoc<T extends WorkspaceRecord>(
  collection: string,
  workspaceId: ObjectId,
  id: string | undefined,
  noun: string,
): Promise<T> {
  const objectId = parseObjectId(id);
  if (!objectId) throw new HttpError(404, "not_found", `${noun} not found`);
  const document = await col<T>(collection).findOne({ _id: objectId, workspaceId } as Filter<T>);
  if (!document) throw new HttpError(404, "not_found", `${noun} not found`);
  return document as T;
}
