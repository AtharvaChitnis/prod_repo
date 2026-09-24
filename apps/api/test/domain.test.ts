import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectivePlan, periodKey, withinLimit } from "../src/modules/billing/entitlements.js";
import { capText, chunkText } from "../src/modules/files/chunk.js";
import { bindSources, parseResearchResult } from "../src/modules/ai/result.js";
import { cosine, keywordScore, rankChunks } from "../src/modules/retrieval/rank.js";
import { safeReturnTo } from "../src/modules/auth/returnTo.js";

describe("entitlements", () => {
  it("keeps a past-due paid plan and drops cancelled plans to free", () => {
    assert.equal(effectivePlan("past_due", "pro"), "pro");
    assert.equal(effectivePlan("cancelled", "pro"), "free");
    assert.equal(effectivePlan("active", "nope"), "free");
  });

  it("uses a UTC month key and a strict less-than limit", () => {
    assert.equal(periodKey(new Date("2026-09-24T23:00:00Z")), "2026-09");
    assert.equal(withinLimit(9, 10), true);
    assert.equal(withinLimit(10, 10), false);
  });
});

describe("chunking", () => {
  it("overlaps windows and stops at the chunk cap", () => {
    const chunks = chunkText("a".repeat(5000), 2400, 300, 2);
    assert.equal(chunks.length, 2);
    assert.equal(capText("hello", 10).truncated, false);
    assert.equal(capText("hello world", 5).text, "hello");
  });
});

describe("retrieval ranking", () => {
  it("ranks the semantically closer chunk first", () => {
    const ranked = rankChunks("quarterly revenue", [1, 0], [
      { chunkId: "a", fileId: "f", sourceLabel: "a.txt", text: "unrelated weather", embedding: [0, 1] },
      { chunkId: "b", fileId: "f", sourceLabel: "b.txt", text: "quarterly revenue grew", embedding: [1, 0] },
    ], 2);
    assert.equal(ranked[0].chunkId, "b");
    assert.ok(cosine([1, 0], [1, 0]) > 0.99);
    assert.ok(keywordScore("quarterly revenue", "quarterly revenue grew") > 0.9);
  });
});

describe("research output", () => {
  it("drops source ids the retrieval set did not return", () => {
    const parsed = parseResearchResult(JSON.stringify({
      summary: "Revenue rose.",
      findings: [{ claim: "Revenue rose", evidence: "The memo says so", sourceIds: ["kept", "injected"] }],
      gaps: ["No prior year"],
      confidence: "high",
    }));
    const bound = bindSources(parsed, new Set(["kept"]));
    assert.deepEqual(bound.findings[0].sourceIds, ["kept"]);
    assert.equal(bindSources({ ...parsed, findings: [{ ...parsed.findings[0], sourceIds: ["nope"] }] }, new Set(["kept"])).confidence, "low");
  });
});

describe("oauth return", () => {
  it("rejects a return URL on another origin", () => {
    assert.equal(
      safeReturnTo("http://localhost:5173", "https://evil.example/steal"),
      "http://localhost:5173/app/projects",
    );
    assert.equal(
      safeReturnTo("http://localhost:5173", "http://localhost:5173/app/billing"),
      "http://localhost:5173/app/billing",
    );
  });
});
