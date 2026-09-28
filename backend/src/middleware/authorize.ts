import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const requireConversationParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversationId = req.params.id || req.params.conversationId;
    const userId = req.user?.id;

    if (!conversationId) {
      res.status(400).json({
        success: false,
        message: "Conversation ID parameter is required",
      });
      return;
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    // First check if the conversation actually exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
      return;
    }

    // Verify authenticated user is a participant of this conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant) {
      res.status(403).json({
        success: false,
        message: "You are not authorized to access this conversation",
      });
      return;
    }

    req.conversationParticipant = participant;
    next();
  } catch (error) {
    next(error);
  }
};
