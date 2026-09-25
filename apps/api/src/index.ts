import { createApp } from "./app.js";
import { assertBootConfig, config } from "./config.js";
import { closeMongo, connectMongo } from "./db.js";
import { log } from "./logger.js";
import { mongoErrorFields } from "./mongoError.js";
import { resumeTasks } from "./modules/tasks/runner.js";

assertBootConfig();

const app = createApp();
let server: ReturnType<typeof app.listen> | undefined;

// The port stays closed until MongoDB accepts a command. A failed index or login then exits with the server code.
connectMongo()
  .then(() => resumeTasks())
  .then(() => {
    server = app.listen(config.port, () => {
      log("info", "api_listening", { port: config.port });
    });
  })
  .catch((error: unknown) => {
    log("error", "startup_failed", {
      name: error instanceof Error ? error.name : "Error",
      ...mongoErrorFields(error),
    });
    process.exit(1);
  });

if (!config.googleClientId || !config.googleClientSecret) {
  log("warn", "oauth_not_configured", {
    detail: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Callback is PUBLIC_API_URL/api/v1/auth/oauth/google/callback",
  });
}

if (config.isProd && !config.s3.bucket) {
  log("warn", "s3_not_configured", { detail: "Uploads use local disk and will not survive restarts" });
}

async function shutdown(): Promise<void> {
  server?.close();
  await closeMongo();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
