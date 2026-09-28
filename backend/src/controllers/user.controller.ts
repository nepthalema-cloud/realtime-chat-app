import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        ...(search
          ? {
              OR: [
                { username: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { username: "asc" },
      take: 50,
    });

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    next(error);
  }
};
