import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { config } from "../../config.js";
import { HttpError } from "../../http.js";

let client: GoogleGenerativeAI | undefined;

function gemini(): GoogleGenerativeAI {
  if (!config.geminiApiKey) {
    throw new HttpError(503, "ai_not_configured", "Gemini is not configured");
  }
  client ??= new GoogleGenerativeAI(config.geminiApiKey);
  return client;
}

export function embeddingModel(): GenerativeModel {
  return gemini().getGenerativeModel({ model: config.geminiEmbeddingModel });
}

export function researchModel(): GenerativeModel {
  return gemini().getGenerativeModel({
    model: config.geminiModel,
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = embeddingModel();
  const vectors = new Array<number[]>(texts.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, texts.length) }, async () => {
    while (cursor < texts.length) {
      const index = cursor;
      cursor += 1;
      const result = await model.embedContent(texts[index].slice(0, 8000));
      vectors[index] = result.embedding.values;
    }
  });
  await Promise.all(workers);
  return vectors;
}

export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new HttpError(504, "ai_timeout", "The model did not respond in time")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
