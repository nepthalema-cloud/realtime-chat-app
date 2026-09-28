import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  if (statusCode === 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details ? { details: err.details } : {}),
    ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
};
