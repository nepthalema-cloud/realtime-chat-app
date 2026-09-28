export type SocketStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SocketState {
  status: SocketStatus;
  isConnected: boolean;
  isConnecting: boolean;
  socketId: string | null;
  error: string | null;
}

export interface TypingPayload {
  conversationId: string;
}

export interface TypingBroadcastPayload {
  conversationId: string;
  userId: string;
}

export interface PresenceUpdatePayload {
  userId: string;
  status: "online" | "offline";
}

export interface PresenceInitialPayload {
  onlineUserIds: string[];
}

export interface ConversationReadPayload {
  conversationId: string;
  readerId: string;
  lastReadAt: string;
}

export interface ConversationUpdatePayload {
  conversationId: string;
  lastMessage: any;
  updatedAt: string;
}
