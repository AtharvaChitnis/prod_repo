import { ObjectId } from "mongodb";
import { col } from "../../db.js";
import { CancelledError, HttpError } from "../../http.js";
import type { ChunkDoc, FileDoc, TaskDoc } from "../../types.js";
import { embedTexts } from "../ai/gemini.js";
import { assertNotCancelled, setTaskProgress } from "../tasks/control.js";
import { capText, chunkText } from "./chunk.js";
import { extractText } from "./extract.js";
import { storage } from "./storage.js";

const MAX_EXTRACTED_CHARS = 400_000;

export async function ingestFile(task: TaskDoc): Promise<void> {
  const fileId = task.input.fileId;
  if (typeof fileId !== "string") throw new HttpError(400, "invalid_task", "Ingest task is missing a file");
  const id = new ObjectId(fileId);
  const file = await col<FileDoc>("files").findOne({ _id: id, workspaceId: task.workspaceId });
  if (!file) throw new HttpError(404, "not_found", "File not found");

  await col<FileDoc>("files").updateOne({ _id: file._id }, { $set: { status: "processing", updatedAt: new Date() } });
  try {
    await assertNotCancelled(task._id);
    const buffer = await storage().get(file.storageKey);
    const extracted = capText(await extractText(file.filename, buffer), MAX_EXTRACTED_CHARS);
    const pieces = chunkText(extracted.text);
    if (!pieces.length) throw new HttpError(422, "no_text", "No readable text was found in that file");

    await setTaskProgress(task._id, "embed", 40);
    await assertNotCancelled(task._id);
    const vectors = await embedTexts(pieces);
    await col<ChunkDoc>("chunks").deleteMany({ fileId: file._id });
    const now = new Date();
    await col<ChunkDoc>("chunks").insertMany(pieces.map((text, ordinal) => ({
      _id: new ObjectId(),
      workspaceId: file.workspaceId,
      projectId: file.projectId,
      fileId: file._id,
      ordinal,
      text,
      embedding: vectors[ordinal],
      sourceLabel: file.filename,
      createdAt: now,
    })));
    await col<FileDoc>("files").updateOne(
      { _id: file._id },
      { $set: { status: "ready", chunkCount: pieces.length, truncated: extracted.truncated, error: undefined, updatedAt: new Date() } },
    );
  } catch (error) {
    if (!(error instanceof CancelledError)) {
      const message = error instanceof HttpError ? error.message : "Could not read that file";
      await col<FileDoc>("files").updateOne(
        { _id: file._id },
        { $set: { status: "failed", error: message, updatedAt: new Date() } },
      );
    }
    throw error;
  }
}
