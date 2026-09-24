import { createApp } from "./app.js";
import { assertBootConfig, config } from "./config.js";
import { closeMongo, connectMongo } from "./db.js";
import { log } from "./logger.js";
import { resumeTasks } from "./modules/tasks/runner.js";

assertBootConfig();

const app = createApp();

const server = app.listen(config.port, () => {
  log("info", "api_listening", { port: config.port });
});

connectMongo()
  .then(() => resumeTasks())
  .catch((error: unknown) => {
    log("error", "startup_failed", { name: error instanceof Error ? error.name : "Error" });
    process.exit(1);
  });

if (config.isProd && !config.s3.bucket) {
  log("warn", "s3_not_configured", { detail: "Uploads use local disk and will not survive restarts" });
}

async function shutdown(): Promise<void> {
  server.close();
  await closeMongo();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
