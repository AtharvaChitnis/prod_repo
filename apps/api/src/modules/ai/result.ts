import { researchResultSchema, type ResearchResult } from "@quarry/contracts";

export function parseResearchResult(raw: string): ResearchResult {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return researchResultSchema.parse(JSON.parse(trimmed));
}

export function bindSources(result: ResearchResult, allowedIds: Set<string>): ResearchResult {
  const findings = result.findings.map((finding) => ({
    ...finding,
    sourceIds: finding.sourceIds.filter((id) => allowedIds.has(id)),
  }));
  const confidence = findings.every((finding) => finding.sourceIds.length === 0) ? "low" : result.confidence;
  return { ...result, findings, confidence };
}
