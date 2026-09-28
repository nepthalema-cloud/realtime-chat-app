import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env";
import { isOriginAllowed } from "../utils/cors";
import { socketAuthMiddleware } from "./socketAuth";
import { registerChatHandlers } from "./chatHandlers";
import { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types";
import { presenceManager } from "./presence";

let ioInstance: SocketIOServer<ClientToServerEvents, ServerToClientEvents, any, SocketData> | null = null;

export const getIO = (): SocketIOServer<ClientToServerEvents, ServerToClientEvents, any, SocketData> | null => {
  return ioInstance;
};

export const initSocketServer = (
  httpServer: http.Server
): SocketIOServer<ClientToServerEvents, ServerToClientEvents, any, SocketData> => {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, any, SocketData>(
    httpServer,
    {
      cors: {
        origin: (origin, callback) => {
          if (isOriginAllowed(origin)) {
            return callback(null, true);
          }
          return callback(new Error(`CORS policy violation: origin ${origin} not allowed`), false);
        },
        credentials: true,
        methods: ["GET", "POST"],
      },
      pingTimeout: 20000,
      pingInterval: 25000,
    }
  );

  ioInstance = io;

  // Handshake authentication middleware
  io.use(socketAuthMiddleware);

  // Connection lifecycle
  io.on("connection", (socket) => {
    const user = socket.data.user;

    // 1. Join user's personal room for direct user-scoped events
    socket.join(`user:${user.id}`);

    // 2. Track presence
    const { isFirst } = presenceManager.addSocket(user.id, socket.id);

    // Send currently online user IDs to the connected client
    socket.emit("presence:initial", {
      onlineUserIds: presenceManager.getOnlineUserIds(),
    });

    // If this is the user's first active socket, broadcast online status
    if (isFirst) {
      io.emit("presence:update", {
        userId: user.id,
        status: "online",
      });
    }

    // Allow manual presence query
    socket.on("presence:query", (ack) => {
      if (typeof ack === "function") {
        ack(presenceManager.getOnlineUserIds());
      }
    });

    // 3. Register chat event handlers
    registerChatHandlers(io, socket);

    // 4. Handle disconnect
    socket.on("disconnect", () => {
      const { isLast } = presenceManager.removeSocket(user.id, socket.id);

      // Only broadcast offline if the user has no remaining active connections
      if (isLast) {
        io.emit("presence:update", {
          userId: user.id,
          status: "offline",
        });
      }
    });
  });

  return io;
};
