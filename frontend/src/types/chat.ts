import { User } from "./auth";

export type MessageStatus = "SENDING" | "SENT" | "SEEN";

export interface ConversationParticipant {
  id: string;
  userId: string;
  lastReadAt: string;
  user: User;
}

export interface MessageSender {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  status: MessageStatus;
  seenAt: string | null;
  createdAt: string;
  sender?: MessageSender;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  otherParticipant: User | null;
  participants: ConversationParticipant[];
  lastMessage: Message | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedMessagesResponse {
  success: boolean;
  messages: Message[];
  nextCursor: string | null;
}
