import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/health", async (_req: Request, res: Response) => {
  let dbStatus = "untested";

  try {
    // Attempt a light query to test DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (error) {
    dbStatus = "disconnected (check DATABASE_URL)";
  }

  res.status(200).json({
    status: "ok",
    service: "realtime-chat-server",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

export default router;
