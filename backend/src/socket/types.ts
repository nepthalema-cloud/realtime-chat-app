import { MessageStatus } from "@prisma/client";

export interface SocketUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface SocketData {
  user: SocketUser;
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  // senderId must never be accepted from client; strictly derived on server
}

export interface JoinConversationPayload {
  conversationId: string;
}

export interface LeaveConversationPayload {
  conversationId: string;
}

export interface PersistedMessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  status: MessageStatus;
  seenAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
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
  lastMessage: PersistedMessageDTO;
  updatedAt: string;
}

export interface ServerToClientEvents {
  "message:new": (message: PersistedMessageDTO) => void;
  "typing:start": (payload: TypingBroadcastPayload) => void;
  "typing:stop": (payload: TypingBroadcastPayload) => void;
  "presence:update": (payload: PresenceUpdatePayload) => void;
  "presence:initial": (payload: PresenceInitialPayload) => void;
  "conversation:read": (payload: ConversationReadPayload) => void;
  "conversation:update": (payload: ConversationUpdatePayload) => void;
  error: (err: { message: string }) => void;
}

export interface ClientToServerEvents {
  "conversation:join": (
    payload: JoinConversationPayload,
    ack?: (response: { success: boolean; message?: string; error?: string }) => void
  ) => void;
  "conversation:leave": (
    payload: LeaveConversationPayload,
    ack?: (response: { success: boolean; message?: string }) => void
  ) => void;
  "conversation:read": (
    payload: { conversationId: string },
    ack?: (response: { success: boolean; lastReadAt?: string; error?: string }) => void
  ) => void;
  "message:send": (
    payload: SendMessagePayload,
    ack?: (response: { success: boolean; message?: PersistedMessageDTO; error?: string }) => void
  ) => void;
  "typing:start": (payload: TypingPayload) => void;
  "typing:stop": (payload: TypingPayload) => void;
  "presence:query": (ack?: (onlineUserIds: string[]) => void) => void;
}
