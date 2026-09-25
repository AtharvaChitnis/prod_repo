import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectivePlan, periodKey, withinLimit } from "../src/modules/billing/entitlements.js";
import { capText, chunkText } from "../src/modules/files/chunk.js";
import { bindSources, parseResearchResult } from "../src/modules/ai/result.js";
import { cosine, keywordScore, rankChunks } from "../src/modules/retrieval/rank.js";
import { safeReturnTo } from "../src/modules/auth/returnTo.js";
import { safeFilename } from "../src/modules/files/extract.js";
import { createTaskRecord, presentTask } from "../src/modules/tasks/record.js";
import { ObjectId } from "mongodb";
import { databaseName, mongoErrorFields } from "../src/mongoError.js";
import { exchangeGoogleCode, googleAuthorizationUrl, googleRedirectUri } from "../src/modules/auth/googleOAuth.js";
import { providerError, webResearchResponse } from "../src/modules/ai/web.js";

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

describe("uploads and task records", () => {
  it("rejects a path-like filename and an unsupported type", () => {
    assert.equal(safeFilename("..\\notes\\brief.md").filename, "brief.md");
    assert.throws(() => safeFilename("payload.exe"), /Upload a pdf/);
  });

  it("queues a task without exposing the usage reservation", () => {
    const task = createTaskRecord({
      workspaceId: new ObjectId(),
      projectId: new ObjectId(),
      type: "research",
      createdBy: new ObjectId(),
      usageEventId: new ObjectId(),
      input: { question: "What changed?", metadata: { source: "desk" } },
    });
    assert.equal(task.status, "queued");
    const view = presentTask(task);
    assert.equal(view.metadata && (view.metadata as { source: string }).source, "desk");
    assert.equal("usageEventId" in view, false);
  });
});

describe("mongo errors", () => {
  it("names the quarry database when the Atlas URI omits one", () => {
    assert.equal(databaseName("mongodb+srv://user:secret@cluster.example.net/?appName=Cluster0"), "quarry");
    assert.equal(databaseName("mongodb://127.0.0.1:27017/research"), "research");
  });

  it("keeps the server code and strips the connection string", () => {
    const fields = mongoErrorFields({
      code: 18,
      codeName: "AuthenticationFailed",
      message: "bad auth mongodb+srv://user:secret@cluster.example.net/quarry",
    });
    assert.equal(fields.code, 18);
    assert.equal(fields.codeName, "AuthenticationFailed");
    assert.equal(fields.message.includes("secret"), false);
    assert.match(fields.message, /mongodb:\/\/redacted/);
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

describe("Google OAuth", () => {
  it("builds the canonical callback URI when the API URL has a trailing slash", () => {
    assert.equal(googleRedirectUri("https://api.example.com/"), "https://api.example.com/api/v1/auth/oauth/google/callback");
  });

  it("builds a Google authorization URL with PKCE and a state value", () => {
    const url = new URL(googleAuthorizationUrl({
      clientId: "client-id",
      redirectUri: "https://api.example.com/api/v1/auth/oauth/google/callback",
      state: "one-time-state",
      codeChallenge: "pkce-challenge",
    }));
    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("client_id"), "client-id");
    assert.equal(url.searchParams.get("redirect_uri"), "https://api.example.com/api/v1/auth/oauth/google/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), "openid email profile");
    assert.equal(url.searchParams.get("state"), "one-time-state");
    assert.equal(url.searchParams.get("code_challenge"), "pkce-challenge");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  });

  it("exchanges the code with the matching redirect URI and returns a verified profile", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) return Response.json({ access_token: "access-token" });
      return Response.json({ sub: "google-sub", email: "Person@Example.com", email_verified: true, name: "Person" });
    };
    const profile = await exchangeGoogleCode({
      code: "auth-code",
      codeVerifier: "pkce-verifier",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://api.example.com/api/v1/auth/oauth/google/callback",
    }, fetchMock);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(calls[1].url, "https://openidconnect.googleapis.com/v1/userinfo");
    const tokenBody = new URLSearchParams(String(calls[0].init?.body));
    assert.equal(tokenBody.get("code"), "auth-code");
    assert.equal(tokenBody.get("code_verifier"), "pkce-verifier");
    assert.equal(tokenBody.get("redirect_uri"), "https://api.example.com/api/v1/auth/oauth/google/callback");
    assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer access-token");
    assert.deepEqual(profile, {
      sub: "google-sub",
      email: "person@example.com",
      email_verified: true,
      name: "Person",
      picture: undefined,
    });
  });

  it("rejects unverified Google email addresses", async () => {
    const fetchMock: typeof fetch = async (_input, init) => {
      if (init?.method === "POST") return Response.json({ access_token: "access-token" });
      return Response.json({ sub: "google-sub", email: "person@example.com", email_verified: false });
    };
    await assert.rejects(exchangeGoogleCode({
      code: "auth-code",
      codeVerifier: "pkce-verifier",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://api.example.com/api/v1/auth/oauth/google/callback",
    }, fetchMock), /verified email/);
  });
});

describe("web research", () => {
  it("turns provider quota exhaustion into an actionable API error", () => {
    const error = providerError(429, { error: { message: "quota exceeded" } });
    assert.equal(error.code, "ai_quota_exhausted");
    assert.match(error.message, /quota is exhausted/i);
  });

  it("keeps grounded web sources returned by Gemini", () => {
    const response = webResearchResponse({
      candidates: [{
        content: { parts: [{ text: '{"summary":"Current market overview","findings":[],"gaps":[],"confidence":"low"}' }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://example.com/report", title: "Market report" } },
            { web: { uri: "https://example.org/news" } },
          ],
        },
      }],
    });
    assert.match(response.text, /Current market overview/);
    assert.deepEqual(response.sources, [
      { id: "web-1", label: "Market report", url: "https://example.com/report" },
      { id: "web-2", label: "https://example.org/news", url: "https://example.org/news" },
    ]);
  });
});
