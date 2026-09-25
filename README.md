# Quarry

B2B research workspace. Teams upload source files, search and retrieve passages, and run a sourced brief through Gemini. The API, billing, and permissions stay on the server.

## Decisions in this build

- Product workflow: project → file ingest → search/retrieval → research task → sourced result
- Tenancy: workspaces with owner, admin, and member roles
- Auth: Google OAuth 2.0 authorization code with PKCE, session cookie
- Billing: Stripe Checkout, Customer Portal, and signed webhooks
- Hosting: `render.yaml` for the API and the static web app
- Files: S3-compatible storage in production, local disk in development
- Retrieval: hybrid keyword plus embedding search. Set `VECTOR_INDEX` to use an Atlas Vector Search index, with an in-process fallback

Endpoints live under `/api/v1`. `GET /api/v1` lists them. Bodies accept `metadata`, and research tasks accept `options`, so fields can be added without a new version. `GET /api/v1/openapi.json` is the same catalog in OpenAPI form.

## Local run

1. Copy `.env.example` to `.env` and set `MONGO_URI`.
2. Create a Google OAuth 2.0 **Web application** client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add `http://localhost:4000/api/v1/auth/oauth/google/callback` as an authorized redirect URI.
3. Add `GEMINI_API_KEY` for ingest, search, and research.
4. `npm install`
5. `npm run dev`
6. Open `http://localhost:5173`.

The API listens on port 4000. The web app calls it with cookies.

## Render

1. Create a Blueprint from `render.yaml`.
2. Set the secret env vars, including `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Use MongoDB Atlas for `MONGO_URI`.
3. Deploy the API and copy its public URL into `PUBLIC_API_URL` and the web service `VITE_API_URL`.
4. Set `WEB_ORIGIN` to the static site URL.
5. Add the API callback `https://<api>/api/v1/auth/oauth/google/callback` to the Google client.
6. Point Stripe webhooks at `https://<api>/api/v1/billing/webhook`.
7. Set `S3_BUCKET` and credentials. Render disk does not keep uploads.

## MongoDB pool

This is one long-running Node process with light early traffic, so the pool is conservative: `maxPoolSize` 20, `minPoolSize` 0, idle sockets close after 2 minutes, socket timeout 45 seconds. Watch Render logs for `mongo_pool_checkout_failed` and bursts of `mongo_connection_created`. If checkouts fail while Atlas CPU is low, raise `maxPoolSize`. On Atlas, also watch `connections.current`.

Optional vector index on `chunks.embedding`, filtered by `workspaceId` and `projectId`. Name it in `VECTOR_INDEX`.

## Tests

`npm test` covers entitlements, chunking, retrieval ranking, research-output validation, and OAuth return URLs.
