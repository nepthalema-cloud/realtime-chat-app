import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { CreateConversationInput } from "../validators/conversation.validator";
import { getIO } from "../socket";

export const createOrGetConversation = async (
  req: Request<unknown, unknown, CreateConversationInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { recipientId } = req.body;

    if (recipientId === currentUserId) {
      res.status(400).json({
        success: false,
        message: "Cannot create a conversation with yourself",
      });
      return;
    }

    // Verify recipient user exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true },
    });

    if (!recipient) {
      res.status(404).json({
        success: false,
        message: "Recipient user not found",
      });
      return;
    }

    // Check if a 1-on-1 conversation already exists between both users
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      select: { id: true },
    });

    let conversationId = existing?.id;
    let isNew = false;

    if (!conversationId) {
      // Concurrency-safe creation inside a database transaction with PostgreSQL advisory lock
      const [id1, id2] = [currentUserId, recipientId].sort();

      const result = await prisma.$transaction(
        async (tx) => {
          // Acquire transaction-scoped advisory lock on deterministic sorted user pair
          // This guarantees that concurrent requests between the same two users are serialized
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id1}), hashtext(${id2}))`;

          // Re-check for race conditions (now strictly serialized)
          const raceCheck = await tx.conversation.findFirst({
            where: {
              isGroup: false,
              AND: [
                { participants: { some: { userId: currentUserId } } },
                { participants: { some: { userId: recipientId } } },
              ],
            },
            select: { id: true },
          });

          if (raceCheck) {
            return { id: raceCheck.id, isNew: false };
          }

          const created = await tx.conversation.create({
            data: {
              isGroup: false,
              participants: {
                create: [{ userId: currentUserId }, { userId: recipientId }],
              },
            },
            select: { id: true },
          });

          return { id: created.id, isNew: true };
        },
        {
          maxWait: 10000,
          timeout: 15000,
        }
      );

      conversationId = result.id;
      isNew = result.isNew;
    }

    // Retrieve full conversation record with participants outside transaction
    const fullConversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });

    if (!fullConversation) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve conversation after creation",
      });
      return;
    }

    const otherParticipant = fullConversation.participants.find((p) => p.userId !== currentUserId)?.user;

    if (isNew) {
      const io = getIO();
      if (io) {
        io.to(`user:${recipientId}`).emit("conversation:update", {
          conversationId: fullConversation.id,
          lastMessage: null as any,
          updatedAt: fullConversation.updatedAt.toISOString(),
        });
      }
    }

    res.status(isNew ? 201 : 200).json({
      success: true,
      conversation: {
        id: fullConversation.id,
        isGroup: fullConversation.isGroup,
        otherParticipant: otherParticipant || null,
        participants: fullConversation.participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          lastReadAt: p.lastReadAt,
          user: p.user,
        })),
        lastMessage: fullConversation.messages[0] || null,
        unreadCount: 0,
        createdAt: fullConversation.createdAt,
        updatedAt: fullConversation.updatedAt,
      },
      isNew,
    });
  } catch (error) {
    next(error);
  }
};

export const getConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user!.id;

    // Fetch only conversations where current user is a participant
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId: currentUserId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            sender: {
              select: { id: true, username: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Calculate unread count and structure response
    const formatted = await Promise.all(
      conversations.map(async (conv) => {
        const myParticipant = conv.participants.find((p) => p.userId === currentUserId);
        const otherParticipant = conv.participants.find((p) => p.userId !== currentUserId)?.user;

        // Unread messages: createdAt > myParticipant.lastReadAt AND senderId != currentUserId
        const unreadCount = myParticipant
          ? await prisma.message.count({
              where: {
                conversationId: conv.id,
                senderId: { not: currentUserId },
                createdAt: { gt: myParticipant.lastReadAt },
              },
            })
          : 0;

        return {
          id: conv.id,
          isGroup: conv.isGroup,
          otherParticipant: otherParticipant || null,
          participants: conv.participants.map((p) => ({
            id: p.id,
            userId: p.userId,
            lastReadAt: p.lastReadAt,
            user: p.user,
          })),
          lastMessage: conv.messages[0] || null,
          unreadCount,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      conversations: formatted,
    });
  } catch (error) {
    next(error);
  }
};

export const getConversationById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const conversationId = req.params.id;

    // Conversation existence and participant authorization already verified by requireConversationParticipant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
      return;
    }

    const myParticipant = conversation.participants.find((p) => p.userId === currentUserId);
    const otherParticipant = conversation.participants.find((p) => p.userId !== currentUserId)?.user;

    const unreadCount = myParticipant
      ? await prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: currentUserId },
            createdAt: { gt: myParticipant.lastReadAt },
          },
        })
      : 0;

    res.status(200).json({
      success: true,
      conversation: {
        id: conversation.id,
        isGroup: conversation.isGroup,
        otherParticipant: otherParticipant || null,
        participants: conversation.participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          lastReadAt: p.lastReadAt,
          user: p.user,
        })),
        lastMessage: conversation.messages[0] || null,
        unreadCount,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const markConversationAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const conversationId = req.params.id;
    const now = new Date();

    // Atomically update reader's lastReadAt and mark messages as SEEN
    const [updated] = await prisma.$transaction([
      prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: currentUserId,
          },
        },
        data: {
          lastReadAt: now,
        },
      }),
      prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: currentUserId },
          status: "SENT",
          createdAt: { lte: now },
        },
        data: {
          status: "SEEN",
          seenAt: now,
        },
      }),
    ]);

    // Broadcast realtime read receipt
    const io = getIO();
    if (io) {
      const readPayload = {
        conversationId,
        readerId: currentUserId,
        lastReadAt: now.toISOString(),
      };
      io.to(`conversation:${conversationId}`).emit("conversation:read", readPayload);

      prisma.conversationParticipant
        .findMany({ where: { conversationId }, select: { userId: true } })
        .then((parts) => {
          parts.forEach((p) => {
            io.to(`user:${p.userId}`).emit("conversation:read", readPayload);
          });
        })
        .catch(() => null);
    }

    res.status(200).json({
      success: true,
      conversationId,
      lastReadAt: updated.lastReadAt,
    });
  } catch (error) {
    next(error);
  }
};
