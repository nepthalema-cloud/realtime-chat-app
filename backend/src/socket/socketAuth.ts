import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";
import { SocketData } from "./types";

export const socketAuthMiddleware = async (
  socket: Socket<any, any, any, SocketData>,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    // 1. Extract token from auth payload or handshake headers
    const rawToken =
      socket.handshake.auth?.token ||
      (typeof socket.handshake.headers?.authorization === "string"
        ? socket.handshake.headers.authorization
        : null);

    if (!rawToken || typeof rawToken !== "string") {
      return next(new Error("Authentication token is required"));
    }

    // Strip "Bearer " prefix if provided
    const token = rawToken.startsWith("Bearer ")
      ? rawToken.substring(7).trim()
      : rawToken.trim();

    if (!token) {
      return next(new Error("Authentication token cannot be empty"));
    }

    // 2. Cryptographically verify JWT and expiration
    let decoded: { userId: string };
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return next(new Error("Authentication token has expired"));
      }
      return next(new Error("Invalid authentication token"));
    }

    // 3. Obtain user from database; verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return next(new Error("User account associated with this token no longer exists"));
    }

    // 4. Attach verified user identity to socket instance
    socket.data.user = user;
    next();
  } catch (error) {
    return next(new Error("Authentication failed"));
  }
};
