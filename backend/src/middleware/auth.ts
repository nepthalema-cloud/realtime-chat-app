import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";

export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authorization header with Bearer token is required",
      });
      return;
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication token cannot be empty",
      });
      return;
    }

    let decoded: { userId: string };
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          message: "Authentication token has expired",
        });
        return;
      }
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

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
      res.status(401).json({
        success: false,
        message: "User account associated with this token no longer exists",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
