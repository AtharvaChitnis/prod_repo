export function chunkText(text: string, size = 2400, overlap = 300, maxChunks = 80): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let index = 0;
  while (index < clean.length && chunks.length < maxChunks) {
    const end = Math.min(clean.length, index + size);
    const slice = clean.slice(index, end).trim();
    if (slice) chunks.push(slice);
    if (end === clean.length) break;
    index = Math.max(index + 1, end - overlap);
  }
  return chunks;
}

export function capText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}
