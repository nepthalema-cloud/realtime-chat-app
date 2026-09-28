import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinConversationPayload,
  LeaveConversationPayload,
  SendMessagePayload,
} from "./types";

export const registerChatHandlers = (
  io: Server<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>
): void => {
  const currentUser = socket.data.user;

  // 1. Join Conversation Room
  socket.on("conversation:join", async (payload: JoinConversationPayload, ack) => {
    try {
      const { conversationId } = payload || {};

      if (!conversationId || typeof conversationId !== "string") {
        const errorMsg = "Invalid conversation ID";
        socket.emit("error", { message: errorMsg });
        if (typeof ack === "function") ack({ success: false, error: errorMsg });
        return;
      }

      // Verify conversation participant authorization against PostgreSQL
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId: currentUser.id,
          },
        },
      });

      if (!participant) {
        const errorMsg = "You are not authorized to join this conversation";
        socket.emit("error", { message: errorMsg });
        if (typeof ack === "function") ack({ success: false, error: errorMsg });
        return;
      }

      // Join room idempotently
      const roomName = `conversation:${conversationId}`;
      socket.join(roomName);

      if (typeof ack === "function") {
        ack({ success: true, message: `Joined ${roomName}` });
      }
    } catch (error) {
      const errorMsg = "Failed to join conversation";
      socket.emit("error", { message: errorMsg });
      if (typeof ack === "function") ack({ success: false, error: errorMsg });
    }
  });

  // 2. Leave Conversation Room
  socket.on("conversation:leave", (payload: LeaveConversationPayload, ack) => {
    const { conversationId } = payload || {};
    if (conversationId && typeof conversationId === "string") {
      socket.leave(`conversation:${conversationId}`);
    }
    if (typeof ack === "function") {
      ack({ success: true, message: "Left conversation" });
    }
  });

  // 3. Send Realtime Message
  socket.on("message:send", async (payload: SendMessagePayload, ack) => {
    try {
      const { conversationId, content } = payload || {};

      // Validate payload format
      if (!conversationId || typeof conversationId !== "string") {
        const errorMsg = "Conversation ID is required";
        socket.emit("error", { message: errorMsg });
        if (typeof ack === "function") ack({ success: false, error: errorMsg });
        return;
      }

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        const errorMsg = "Message content cannot be empty";
        socket.emit("error", { message: errorMsg });
        if (typeof ack === "function") ack({ success: false, error: errorMsg });
        return;
      }

      if (content.length > 5000) {
        const errorMsg = "Message cannot exceed 5000 characters";
        socket.emit("error", { message: errorMsg });
        if (typeof ack === "function") ack({ success: false, error: errorMsg });
        return;
      }

      // Authorize: Verify sender is an active participant in this conversation
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });

      const isParticipant = participants.some((p) => p.userId === currentUser.id);

      if (!isParticipant) {
        const errorMsg = "You are not authorized to send messages to this conversation";
        socket.emit("error", { message: errorMsg });
        if (typeof ack === "function") ack({ success: false, error: errorMsg });
        return;
      }

      // Database is the sole source of truth:
      // Persist message with status SENT and atomically update conversation.updatedAt
      const [persistedMessage] = await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId,
            senderId: currentUser.id, // Strictly derived from verified JWT
            content: content.trim(),
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

      // 1. Broadcast to the conversation room (for users currently inside the chat)
      const roomName = `conversation:${conversationId}`;
      io.to(roomName).emit("message:new", persistedMessage);

      // 2. Broadcast to each participant's personal user room
      // This guarantees automatic conversation appearance and instant list update
      // even if the recipient has not yet opened or joined the conversation room!
      for (const p of participants) {
        io.to(`user:${p.userId}`).emit("message:new", persistedMessage);
        io.to(`user:${p.userId}`).emit("conversation:update", {
          conversationId,
          lastMessage: persistedMessage,
          updatedAt: persistedMessage.createdAt.toISOString(),
        });
      }

      // Acknowledge sender
      if (typeof ack === "function") {
        ack({ success: true, message: persistedMessage });
      }
    } catch (error) {
      const errorMsg = "Message could not be persisted";
      socket.emit("error", { message: errorMsg });
      if (typeof ack === "function") ack({ success: false, error: errorMsg });
    }
  });

  // 4. Read / Seen Realtime Event
  socket.on("conversation:read", async (payload: { conversationId: string }, ack) => {
    try {
      const { conversationId } = payload || {};
      if (!conversationId || typeof conversationId !== "string") {
        if (typeof ack === "function") ack({ success: false, error: "Invalid conversation ID" });
        return;
      }

      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });

      const isParticipant = participants.some((p) => p.userId === currentUser.id);
      if (!isParticipant) {
        if (typeof ack === "function") ack({ success: false, error: "Unauthorized" });
        return;
      }

      const now = new Date();

      // Update reader's lastReadAt and update messages status in PostgreSQL
      await prisma.$transaction([
        prisma.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: currentUser.id,
            },
          },
          data: { lastReadAt: now },
        }),
        prisma.message.updateMany({
          where: {
            conversationId,
            senderId: { not: currentUser.id },
            status: "SENT",
            createdAt: { lte: now },
          },
          data: {
            status: "SEEN",
            seenAt: now,
          },
        }),
      ]);

      const readPayload = {
        conversationId,
        readerId: currentUser.id,
        lastReadAt: now.toISOString(),
      };

      // Broadcast read receipt to the conversation room and participant user rooms
      io.to(`conversation:${conversationId}`).emit("conversation:read", readPayload);
      for (const p of participants) {
        io.to(`user:${p.userId}`).emit("conversation:read", readPayload);
      }

      if (typeof ack === "function") {
        ack({ success: true, lastReadAt: readPayload.lastReadAt });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ success: false, error: "Failed to mark conversation as read" });
      }
    }
  });

  // 5. Typing Start
  socket.on("typing:start", async (payload) => {
    try {
      const { conversationId } = payload || {};
      if (!conversationId || typeof conversationId !== "string") return;

      const roomName = `conversation:${conversationId}`;

      // Check if socket already verified and joined this room
      if (!socket.rooms.has(roomName)) {
        const participant = await prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: currentUser.id,
            },
          },
          select: { id: true },
        });
        if (!participant) return;
        socket.join(roomName);
      }

      socket.to(roomName).emit("typing:start", {
        conversationId,
        userId: currentUser.id,
      });
    } catch {
      // Ignore typing errors silently
    }
  });

  // 6. Typing Stop
  socket.on("typing:stop", async (payload) => {
    try {
      const { conversationId } = payload || {};
      if (!conversationId || typeof conversationId !== "string") return;

      const roomName = `conversation:${conversationId}`;

      if (!socket.rooms.has(roomName)) {
        const participant = await prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: currentUser.id,
            },
          },
          select: { id: true },
        });
        if (!participant) return;
      }

      socket.to(roomName).emit("typing:stop", {
        conversationId,
        userId: currentUser.id,
      });
    } catch {
      // Ignore typing errors silently
    }
  });
};
