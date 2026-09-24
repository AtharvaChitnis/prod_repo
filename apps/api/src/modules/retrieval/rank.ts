export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function keywordScore(query: string, text: string): number {
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2))];
  if (!terms.length) return 0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits += 1;
  }
  return hits / terms.length;
}

/** Semantic similarity carries more weight; keyword overlap keeps exact terms from being buried. */
export function hybridScore(semantic: number, keyword: number): number {
  return 0.75 * semantic + 0.25 * keyword;
}

export type RankedChunk = {
  chunkId: string;
  fileId: string;
  sourceLabel: string;
  text: string;
  score: number;
};

export function rankChunks(
  query: string,
  queryVector: number[],
  chunks: { chunkId: string; fileId: string; sourceLabel: string; text: string; embedding: number[] }[],
  limit: number,
): RankedChunk[] {
  return chunks
    .map((chunk) => ({
      chunkId: chunk.chunkId,
      fileId: chunk.fileId,
      sourceLabel: chunk.sourceLabel,
      text: chunk.text,
      score: hybridScore(cosine(queryVector, chunk.embedding), keywordScore(query, chunk.text)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
