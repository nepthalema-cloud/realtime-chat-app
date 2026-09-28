import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { SendMessageInput } from "../validators/conversation.validator";
import { getIO } from "../socket";

export const getMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversationId = req.params.id || req.params.conversationId;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 40, 1), 100);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;

    // Membership already verified by requireConversationParticipant
    // Deterministic chronological ordering using [createdAt asc, id asc]
    const messages = await prisma.message.findMany({
      where: { conversationId },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      include: {
        sender: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    });

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      messages.pop(); // Remove extra item
      nextCursor = messages[messages.length - 1].id;
    }

    res.status(200).json({
      success: true,
      messages,
      nextCursor,
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (
  req: Request<{ id?: string; conversationId?: string }, unknown, SendMessageInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversationId = (req.params.id || req.params.conversationId)!;
    const currentUserId = req.user!.id;
    const { content } = req.body;

    // Membership already verified by requireConversationParticipant
    // Persist message and atomically update conversation.updatedAt
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          senderId: currentUserId,
          content,
          status: "SENT",
        },
        include: {
          sender: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    // Broadcast realtime event via Socket.IO
    const io = getIO();
    if (io) {
      const roomName = `conversation:${conversationId}`;
      io.to(roomName).emit("message:new", message as any);

      // Notify participants in their personal user rooms
      prisma.conversationParticipant
        .findMany({ where: { conversationId }, select: { userId: true } })
        .then((participants) => {
          for (const p of participants) {
            io.to(`user:${p.userId}`).emit("message:new", message as any);
            io.to(`user:${p.userId}`).emit("conversation:update", {
              conversationId,
              lastMessage: message as any,
              updatedAt: message.createdAt.toISOString(),
            });
          }
        })
        .catch(() => null);
    }

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    next(error);
  }
};
