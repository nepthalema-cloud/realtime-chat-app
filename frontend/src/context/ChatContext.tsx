import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Conversation, Message } from "../types/chat";
import { TypingBroadcastPayload, PresenceUpdatePayload, ConversationReadPayload, ConversationUpdatePayload } from "../types/socket";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

interface CachedMessages {
  messages: Message[];
  nextCursor: string | null;
}

interface ChatContextType {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  onlineUserIds: Set<string>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingMore: boolean;
  hasMoreMessages: boolean;
  isOtherTyping: boolean;
  selectConversation: (conversationId: string | null) => Promise<void>;
  createConversation: (recipientId: string) => Promise<Conversation>;
  sendMessage: (content: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  startTyping: () => void;
  stopTyping: () => void;
  refreshConversations: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState<boolean>(false);

  // Client-side in-memory cache for ultra-fast message retrieval
  const messagesCacheRef = useRef<Record<string, CachedMessages>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  activeConvIdRef.current = activeConversationId;

  // Active conversation object computed from conversations list
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // 1. Fetch conversations on initial load or user change
  const refreshConversations = useCallback(async () => {
    try {
      const res = await api.conversations.list();
      setConversations(res.conversations);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      refreshConversations();
    } else {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      setOnlineUserIds(new Set());
      messagesCacheRef.current = {};
    }
  }, [user, refreshConversations]);

  // 2. Select conversation & fetch initial message history (Optimized with client caching)
  const selectConversation = useCallback(
    async (id: string | null) => {
      // Leave previous room if switching
      if (activeConvIdRef.current && activeConvIdRef.current !== id && socket && socket.connected) {
        socket.emit("conversation:leave", { conversationId: activeConvIdRef.current });
      }

      setActiveConversationId(id);
      setIsOtherTyping(false);

      if (!id) {
        setMessages([]);
        setNextCursor(null);
        return;
      }

      // Check if messages exist in memory cache for immediate 0ms display
      const cached = messagesCacheRef.current[id];
      if (cached && cached.messages.length > 0) {
        setMessages(cached.messages);
        setNextCursor(cached.nextCursor);
        setIsLoadingMessages(false);
      } else {
        setMessages([]);
        setIsLoadingMessages(true);
      }

      // Clear unread count locally for this conversation immediately
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
      );

      // Join new room and notify read via Socket.IO non-blockingly
      if (socket && socket.connected) {
        socket.emit("conversation:join", { conversationId: id });
        socket.emit("conversation:read", { conversationId: id });
      }

      // Background fetch authoritative message history
      try {
        const [msgRes] = await Promise.all([
          api.messages.list(id, undefined, 40),
          api.conversations.markRead(id).catch(() => null), // Best-effort mark read
        ]);

        setMessages(msgRes.messages);
        setNextCursor(msgRes.nextCursor);

        // Update cache
        messagesCacheRef.current[id] = {
          messages: msgRes.messages,
          nextCursor: msgRes.nextCursor,
        };
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [socket]
  );

  // 3. Load older messages with cursor pagination
  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || !nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const res = await api.messages.list(activeConversationId, nextCursor, 40);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOlder = res.messages.filter((m) => !existingIds.has(m.id));
        const updated = [...newOlder, ...prev];

        // Update cache
        if (messagesCacheRef.current[activeConversationId]) {
          messagesCacheRef.current[activeConversationId] = {
            messages: updated,
            nextCursor: res.nextCursor,
          };
        }

        return updated;
      });
      setNextCursor(res.nextCursor);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeConversationId, nextCursor, isLoadingMore]);

  // 4. Create or reuse conversation
  const createConversation = useCallback(
    async (recipientId: string): Promise<Conversation> => {
      const res = await api.conversations.create(recipientId);
      const conv = res.conversation;

      setConversations((prev) => {
        const exists = prev.find((c) => c.id === conv.id);
        if (exists) {
          return [conv, ...prev.filter((c) => c.id !== conv.id)];
        }
        return [conv, ...prev];
      });

      await selectConversation(conv.id);
      return conv;
    },
    [selectConversation]
  );

  // 5. Send message with Optimistic UI rendering
  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConversationId || !content.trim() || !user) return;

      const trimmedContent = content.trim();

      // Ensure typing indicator is stopped
      if (socket && socket.connected) {
        socket.emit("typing:stop", { conversationId: activeConversationId });
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();

      const optimisticMsg: Message = {
        id: tempId,
        conversationId: activeConversationId,
        senderId: user.id,
        content: trimmedContent,
        status: "SENDING",
        seenAt: null,
        createdAt: nowIso,
        sender: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
      };

      // 1. Immediately render optimistic message
      setMessages((prev) => [...prev, optimisticMsg]);

      // 2. Immediately update conversation list preview and order
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === activeConversationId) {
            return {
              ...c,
              lastMessage: optimisticMsg,
              updatedAt: nowIso,
            };
          }
          return c;
        });
        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });

      // 3. Update cache with optimistic message
      const curCache = messagesCacheRef.current[activeConversationId];
      if (curCache) {
        messagesCacheRef.current[activeConversationId] = {
          ...curCache,
          messages: [...curCache.messages, optimisticMsg],
        };
      }

      // 4. Send via Socket.IO or REST fallback
      if (socket && socket.connected) {
        return new Promise<void>((resolve, reject) => {
          socket.emit(
            "message:send",
            {
              conversationId: activeConversationId,
              content: trimmedContent,
            },
            (ack: { success: boolean; message?: Message; error?: string }) => {
              if (ack && ack.success && ack.message) {
                const persisted = ack.message;
                // Reconcile optimistic message with authoritative server message
                setMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? persisted : m))
                );

                if (messagesCacheRef.current[activeConversationId]) {
                  messagesCacheRef.current[activeConversationId].messages =
                    messagesCacheRef.current[activeConversationId].messages.map((m) =>
                      m.id === tempId ? persisted : m
                    );
                }
                resolve();
              } else {
                // Remove optimistic message on failure
                setMessages((prev) => prev.filter((m) => m.id !== tempId));
                reject(new Error(ack?.error || "Failed to send message"));
              }
            }
          );
        });
      } else {
        // Fallback to REST API if socket is disconnected temporarily
        try {
          const res = await api.messages.send(activeConversationId, trimmedContent);
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? res.message : m))
          );
          if (messagesCacheRef.current[activeConversationId]) {
            messagesCacheRef.current[activeConversationId].messages =
              messagesCacheRef.current[activeConversationId].messages.map((m) =>
                m.id === tempId ? res.message : m
              );
          }
        } catch (err) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          throw err;
        }
      }
    },
    [activeConversationId, socket, user]
  );

  // 6. Typing indicators
  const startTyping = useCallback(() => {
    if (!activeConversationId || !socket || !socket.connected) return;

    socket.emit("typing:start", { conversationId: activeConversationId });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (socket && socket.connected && activeConvIdRef.current) {
        socket.emit("typing:stop", { conversationId: activeConvIdRef.current });
      }
    }, 2500);
  }, [activeConversationId, socket]);

  const stopTyping = useCallback(() => {
    if (!activeConversationId || !socket || !socket.connected) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    socket.emit("typing:stop", { conversationId: activeConversationId });
  }, [activeConversationId, socket]);

  // 7. Socket.IO Listeners
  useEffect(() => {
    if (!socket) return;

    // Presence initial sync
    const handlePresenceInitial = ({ onlineUserIds: ids }: { onlineUserIds: string[] }) => {
      setOnlineUserIds(new Set(ids));
    };

    // Presence update
    const handlePresenceUpdate = ({ userId, status }: PresenceUpdatePayload) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (status === "online") {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
    };

    // Read receipt event: updates message status from SENT to SEEN (✓ to ✓✓)
    const handleConversationRead = ({ conversationId, lastReadAt }: ConversationReadPayload) => {
      const readTime = new Date(lastReadAt).getTime();

      // If active conversation was read, update outgoing messages to SEEN
      if (conversationId === activeConvIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.senderId === user?.id && new Date(m.createdAt).getTime() <= readTime) {
              return { ...m, status: "SEEN", seenAt: lastReadAt };
            }
            return m;
          })
        );
      }

      // Update cached messages as well
      const cached = messagesCacheRef.current[conversationId];
      if (cached) {
        cached.messages = cached.messages.map((m) => {
          if (m.senderId === user?.id && new Date(m.createdAt).getTime() <= readTime) {
            return { ...m, status: "SEEN", seenAt: lastReadAt };
          }
          return m;
        });
      }
    };

    // Incoming message: handles automatic conversation appearance, previews, and unread counts
    const handleNewMessage = (msg: Message) => {
      const currentActiveId = activeConvIdRef.current;

      // 1. Reconcile optimistic message or append
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev;
        }

        // Reconcile with any temporary optimistic message
        const tempIdx = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.senderId === msg.senderId &&
            m.content === msg.content &&
            m.conversationId === msg.conversationId
        );

        if (tempIdx !== -1) {
          const updated = [...prev];
          updated[tempIdx] = msg;
          return updated;
        }

        if (msg.conversationId === currentActiveId) {
          return [...prev, msg];
        }
        return prev;
      });

      // 2. Update cache
      const cached = messagesCacheRef.current[msg.conversationId];
      if (cached) {
        if (!cached.messages.some((m) => m.id === msg.id)) {
          const tempIdx = cached.messages.findIndex(
            (m) =>
              m.id.startsWith("temp-") &&
              m.senderId === msg.senderId &&
              m.content === msg.content
          );
          if (tempIdx !== -1) {
            cached.messages[tempIdx] = msg;
          } else {
            cached.messages.push(msg);
          }
        }
      }

      // 3. Update conversations list immediately (automatic conversation appearance)
      setConversations((prev) => {
        const convExists = prev.some((c) => c.id === msg.conversationId);
        if (!convExists) {
          // If conversation isn't in list yet, fetch immediately so it appears
          refreshConversations();
          return prev;
        }

        const updated = prev.map((c) => {
          if (c.id === msg.conversationId) {
            const isViewing = c.id === currentActiveId;
            const isFromOther = msg.senderId !== user?.id;
            return {
              ...c,
              lastMessage: msg,
              updatedAt: msg.createdAt,
              unreadCount: isViewing ? 0 : (isFromOther ? c.unreadCount + 1 : c.unreadCount),
            };
          }
          return c;
        });

        // Re-sort conversations by updatedAt desc
        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });

      // 4. If viewing this conversation and message was from someone else, mark as read
      if (msg.conversationId === currentActiveId && msg.senderId !== user?.id) {
        api.conversations.markRead(currentActiveId).catch(() => null);
        if (socket && socket.connected) {
          socket.emit("conversation:read", { conversationId: currentActiveId });
        }
      }
    };

    // Conversation update: ensures new conversations appear automatically
    const handleConversationUpdate = ({ conversationId, lastMessage, updatedAt }: ConversationUpdatePayload) => {
      const currentActiveId = activeConvIdRef.current;
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversationId);
        if (!exists) {
          // Conversation newly created: fetch immediately
          refreshConversations();
          return prev;
        }

        const updated = prev.map((c) => {
          if (c.id === conversationId) {
            const isViewing = c.id === currentActiveId;
            return {
              ...c,
              lastMessage: lastMessage || c.lastMessage,
              updatedAt: updatedAt || c.updatedAt,
              unreadCount: isViewing ? 0 : c.unreadCount,
            };
          }
          return c;
        });

        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    };

    // Typing start
    const handleTypingStart = (payload: TypingBroadcastPayload) => {
      if (
        payload.conversationId === activeConvIdRef.current &&
        payload.userId !== user?.id
      ) {
        setIsOtherTyping(true);
      }
    };

    // Typing stop
    const handleTypingStop = (payload: TypingBroadcastPayload) => {
      if (
        payload.conversationId === activeConvIdRef.current &&
        payload.userId !== user?.id
      ) {
        setIsOtherTyping(false);
      }
    };

    // Reconnection handling
    const handleConnect = () => {
      if (activeConvIdRef.current) {
        socket.emit("conversation:join", { conversationId: activeConvIdRef.current });
      }
      refreshConversations();
    };

    socket.on("presence:initial", handlePresenceInitial);
    socket.on("presence:update", handlePresenceUpdate);
    socket.on("conversation:read", handleConversationRead);
    socket.on("conversation:update", handleConversationUpdate);
    socket.on("message:new", handleNewMessage);
    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);
    socket.on("connect", handleConnect);

    return () => {
      socket.off("presence:initial", handlePresenceInitial);
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("conversation:read", handleConversationRead);
      socket.off("conversation:update", handleConversationUpdate);
      socket.off("message:new", handleNewMessage);
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
      socket.off("connect", handleConnect);
    };
  }, [socket, user?.id, refreshConversations]);

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeConversation,
        messages,
        onlineUserIds,
        isLoadingConversations,
        isLoadingMessages,
        isLoadingMore,
        hasMoreMessages: !!nextCursor,
        isOtherTyping,
        selectConversation,
        createConversation,
        sendMessage,
        loadOlderMessages,
        startTyping,
        stopTyping,
        refreshConversations,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
