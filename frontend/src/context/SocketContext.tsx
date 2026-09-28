import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { SocketState } from "../types/socket";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export interface SocketContextType extends SocketState {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isAuthenticated } = useAuth();
  const [socketState, setSocketState] = useState<SocketState>({
    status: "disconnected",
    isConnected: false,
    isConnecting: false,
    socketId: null,
    error: null,
  });

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Only connect when user is authenticated and token is available
    if (!isAuthenticated || !token || !user) {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocketState({
        status: "disconnected",
        isConnected: false,
        isConnecting: false,
        socketId: null,
        error: null,
      });
      return;
    }

    setSocketState((prev) => ({
      ...prev,
      status: "connecting",
      isConnecting: true,
      error: null,
    }));

    // Establish authenticated Socket.IO connection
    const socketInstance = io(SOCKET_URL, {
      auth: {
        token: `Bearer ${token}`,
      },
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socketInstance;

    socketInstance.on("connect", () => {
      setSocketState({
        status: "connected",
        isConnected: true,
        isConnecting: false,
        socketId: socketInstance.id || null,
        error: null,
      });
    });

    socketInstance.on("disconnect", (reason) => {
      setSocketState({
        status: "disconnected",
        isConnected: false,
        isConnecting: false,
        socketId: null,
        error: reason === "io server disconnect" ? "Disconnected by server" : null,
      });
    });

    socketInstance.on("connect_error", (err) => {
      const msg = err.message ? err.message.toLowerCase() : "";
      const isAuthError = msg.includes("auth") || msg.includes("token") || msg.includes("jwt");
      const safeMessage = isAuthError
        ? "Realtime connection authentication failed."
        : "Realtime connection error. Retrying...";

      setSocketState((prev) => ({
        ...prev,
        status: "error",
        isConnected: false,
        isConnecting: false,
        error: safeMessage,
      }));
    });

    return () => {
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token, user?.id]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        ...socketState,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
