export const routeCatalog = [
  { method: "GET", path: "/auth/oauth/:provider/start", auth: false, summary: "Start an OAuth2 sign-in. Google is enabled; other providers stay open." },
  { method: "GET", path: "/auth/oauth/:provider/callback", auth: false, summary: "OAuth2 redirect URI." },
  { method: "POST", path: "/auth/logout", auth: false, summary: "Clear the session cookie." },
  { method: "GET", path: "/auth/me", auth: true, summary: "Current user, role, and workspaces." },
  { method: "GET", path: "/users/me", auth: true, summary: "Same account payload as /auth/me." },
  { method: "GET", path: "/workspaces", auth: true, summary: "Workspaces the user belongs to." },
  { method: "POST", path: "/workspaces", auth: true, summary: "Create a workspace. Body accepts metadata." },
  { method: "PATCH", path: "/workspaces/:id", auth: true, summary: "Rename a workspace or replace metadata." },
  { method: "POST", path: "/workspaces/:id/activate", auth: true, summary: "Switch the active workspace." },
  { method: "GET", path: "/workspaces/:id/members", auth: true, summary: "List members." },
  { method: "POST", path: "/workspaces/:id/members", auth: true, summary: "Add a member who has already signed in." },
  { method: "DELETE", path: "/workspaces/:id/members/:userId", auth: true, summary: "Remove a member." },
  { method: "GET", path: "/projects", auth: true, summary: "List research projects." },
  { method: "POST", path: "/projects", auth: true, summary: "Create a project. Body accepts metadata." },
  { method: "GET", path: "/projects/:id", auth: true, summary: "Read a project." },
  { method: "PATCH", path: "/projects/:id", auth: true, summary: "Update a project." },
  { method: "DELETE", path: "/projects/:id", auth: true, summary: "Delete a project and its files." },
  { method: "POST", path: "/projects/:id/files", auth: true, summary: "Upload a source file." },
  { method: "GET", path: "/projects/:id/files", auth: true, summary: "List source files." },
  { method: "GET", path: "/files/:id", auth: true, summary: "Read file processing status." },
  { method: "DELETE", path: "/files/:id", auth: true, summary: "Delete a file and its chunks." },
  { method: "POST", path: "/files/:id/ingest", auth: true, summary: "Re-run extraction, chunking, and embedding." },
  { method: "POST", path: "/projects/:id/search", auth: true, summary: "Hybrid search and retrieval over project files." },
  { method: "POST", path: "/tasks", auth: true, summary: "Queue a research run. Body accepts options and metadata." },
  { method: "GET", path: "/projects/:id/tasks", auth: true, summary: "List tasks for a project." },
  { method: "GET", path: "/tasks/:id", auth: true, summary: "Read task state." },
  { method: "POST", path: "/tasks/:id/run", auth: true, summary: "Reserved for re-run behavior. Returns the task if it is still active." },
  { method: "POST", path: "/tasks/:id/cancel", auth: true, summary: "Cancel a queued or running task." },
  { method: "GET", path: "/results/:id", auth: true, summary: "Read a research result." },
  { method: "GET", path: "/results/:id/export", auth: true, summary: "Export JSON or CSV. Other formats return unsupported_export_format." },
  { method: "GET", path: "/usage", auth: true, summary: "Current period usage and entitlement." },
  { method: "GET", path: "/usage/history", auth: true, summary: "Recent usage events." },
  { method: "GET", path: "/billing", auth: true, summary: "Plan, usage, and checkout readiness." },
  { method: "POST", path: "/billing/checkout", auth: true, summary: "Create a Stripe Checkout session." },
  { method: "POST", path: "/billing/portal", auth: true, summary: "Open the Stripe customer portal." },
  { method: "POST", path: "/billing/webhook", auth: false, summary: "Stripe webhook. Signature verified." },
  { method: "GET", path: "/health", auth: false, summary: "Liveness." },
  { method: "GET", path: "/ready", auth: false, summary: "Readiness, including MongoDB." },
] as const;

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routeCatalog) {
    const key = `/api/v1${route.path}`;
    paths[key] ??= {};
    paths[key][route.method.toLowerCase()] = {
      summary: route.summary,
      security: route.auth ? [{ cookieAuth: [] }] : [],
      responses: { "200": { description: "Success" }, "4XX": { description: "Stable error envelope" } },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Quarry Research API",
      version: "0.1.0",
      description: "Versioned REST surface. Resource bodies accept metadata, and research tasks accept options, so fields can be added without a new version.",
    },
    paths,
  };
}
