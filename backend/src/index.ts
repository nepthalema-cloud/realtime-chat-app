import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { initSocketServer } from "./socket";

const app = createApp();
const server = http.createServer(app);
const io = initSocketServer(server);

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`===============================================`);
  console.log(`🚀 Realtime Chat Server running in ${env.NODE_ENV} mode`);
  console.log(`📡 Listening on http://0.0.0.0:${env.PORT}`);
  console.log(`🩺 Health check: http://0.0.0.0:${env.PORT}/api/health`);
  console.log(`⚡ Socket.IO initialized`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
const shutdown = () => {
  console.log("\nReceived kill signal, shutting down gracefully...");
  io.close(() => {
    server.close(() => {
      console.log("Closed out remaining HTTP and Socket.IO connections.");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
