import next from "next";
import { createApp } from "./src/server/app";
import { config } from "./src/server/config";
import { prisma } from "./src/server/prisma";

function isDatabaseConnectionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return "errorCode" in error && error.errorCode === "P1001";
}

async function startServer() {
  const nextApp = next({
    dev: config.env !== "production",
    hostname: "0.0.0.0",
    port: config.port,
  });
  await nextApp.prepare();
  const nextHandler = nextApp.getRequestHandler();

  const app = await createApp();
  app.all("*", (req, res) => {
    void nextHandler(req, res);
  });

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Adzone server running at http://localhost:${config.port}`);
  });

  // A failed bind (e.g. the port is already taken) must terminate the process.
  // Otherwise a second dev server keeps running Next's compiler against the same
  // .next directory, corrupting the build and 404-ing client chunks.
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${config.port} is already in use. Another Adzone server is probably running.`,
      );
      console.error("Stop it (or set a different PORT in .env) and try again.");
    } else {
      console.error("Adzone server failed to start", error);
    }
    process.exit(1);
  });

  async function shutdown(signal: string) {
    console.log(`Received ${signal}. Closing Adzone server...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

startServer().catch(async (error) => {
  if (isDatabaseConnectionError(error)) {
    console.error("PostgreSQL is not running or not reachable at DATABASE_URL.");
    console.error("Start it with: npm run db:start");
  }
  console.error("Failed to start Adzone server", error);
  await prisma.$disconnect();
  process.exit(1);
});
