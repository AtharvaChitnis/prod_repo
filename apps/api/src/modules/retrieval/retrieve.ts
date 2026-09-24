import type { ObjectId } from "mongodb";
import { config } from "../../config.js";
import { col } from "../../db.js";
import type { ChunkDoc } from "../../types.js";
import { embedTexts } from "../ai/gemini.js";
import { rankChunks, type RankedChunk } from "./rank.js";
import { log } from "../../logger.js";

const IN_PROCESS_CAP = 2000;

export async function retrieve(input: {
  workspaceId: ObjectId;
  projectId: ObjectId;
  query: string;
  limit: number;
}): Promise<RankedChunk[]> {
  const [queryVector] = await embedTexts([input.query]);
  const chunks = await loadCandidates(input.workspaceId, input.projectId, queryVector, input.limit);
  return rankChunks(
    input.query,
    queryVector,
    chunks.map((chunk) => ({
      chunkId: chunk._id.toHexString(),
      fileId: chunk.fileId.toHexString(),
      sourceLabel: chunk.sourceLabel,
      text: chunk.text,
      embedding: chunk.embedding,
    })),
    input.limit,
  );
}

async function loadCandidates(
  workspaceId: ObjectId,
  projectId: ObjectId,
  queryVector: number[],
  limit: number,
): Promise<ChunkDoc[]> {
  // Atlas vector search is optional. A missing index or a local MongoDB falls back to in-process ranking.
  if (config.vectorIndex) {
    try {
      return await col<ChunkDoc>("chunks").aggregate<ChunkDoc>([
        {
          $vectorSearch: {
            index: config.vectorIndex,
            path: "embedding",
            queryVector,
            numCandidates: Math.max(100, limit * 10),
            limit: Math.max(limit, 24),
            filter: { workspaceId, projectId },
          },
        },
      ]).toArray();
    } catch (error) {
      log("warn", "vector_search_fallback", { name: error instanceof Error ? error.name : "Error" });
    }
  }
  return col<ChunkDoc>("chunks")
    .find({ workspaceId, projectId })
    .limit(IN_PROCESS_CAP)
    .toArray();
}
