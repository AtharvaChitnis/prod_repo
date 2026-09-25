import { config } from "../../config.js";
import { HttpError } from "../../http.js";

export type WebSource = { id: string; label: string; url: string };

export async function generateWebResearch(
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string; sources: WebSource[] }> {
  if (!config.geminiApiKey) {
    throw new HttpError(503, "ai_not_configured", "Gemini is not configured");
  }
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        tools: [{ googleSearch: {} }],
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(502, "web_research_failed", "Google web research could not be completed");
  }
  const parsed = webResearchResponse(body);
  if (!parsed.text) {
    throw new HttpError(502, "web_research_failed", "Google web research returned no response");
  }
  return parsed;
}

export function webResearchResponse(body: unknown): { text: string; sources: WebSource[] } {
  const candidate = isRecord(body) && Array.isArray(body.candidates) ? body.candidates[0] : undefined;
  const parts = isRecord(candidate) && isRecord(candidate.content) && Array.isArray(candidate.content.parts)
    ? candidate.content.parts
    : [];
  const text = parts
    .map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  const chunks = isRecord(candidate) && isRecord(candidate.groundingMetadata) && Array.isArray(candidate.groundingMetadata.groundingChunks)
    ? candidate.groundingMetadata.groundingChunks
    : [];
  const sources = chunks.flatMap((chunk, index): WebSource[] => {
    const web = isRecord(chunk) && isRecord(chunk.web) ? chunk.web : undefined;
    if (!web || typeof web.uri !== "string" || !web.uri) return [];
    return [{ id: `web-${index + 1}`, label: typeof web.title === "string" && web.title ? web.title : web.uri, url: web.uri }];
  });
  return { text, sources };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
