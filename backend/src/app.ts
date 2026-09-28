import express, { Application } from "express";
import cors from "cors";
import { env } from "./config/env";
import { isOriginAllowed } from "./utils/cors";
import healthRouter from "./routes/health.routes";
import authRouter from "./routes/auth.routes";
import userRouter from "./routes/user.routes";
import conversationRouter from "./routes/conversation.routes";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { errorHandler } from "./middleware/errorHandler";

export const createApp = (): Application => {
  const app = express();

  // Configure CORS
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy violation: origin ${origin} not allowed`), false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Body parser
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Request logger (in development)
  if (env.NODE_ENV === "development") {
    app.use((req, _res, next) => {
      console.log(`[REQ] ${req.method} ${req.path}`);
      next();
    });
  }

  // Mount routes
  app.use("/api", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/users", userRouter);
  app.use("/api/conversations", conversationRouter);

  // Catch-all 404 handler
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
};
