import React, { useEffect, useRef } from "react";
import { useChat } from "../../context/ChatContext";
import { useAuth } from "../../context/AuthContext";
import { MessageItem } from "./MessageItem";

export const MessageList: React.FC = () => {
  const { user } = useAuth();
  const {
    messages,
    isLoadingMessages,
    isLoadingMore,
    hasMoreMessages,
    loadOlderMessages,
    isOtherTyping,
    activeConversation,
  } = useChat();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);

  // Auto-scroll to bottom on conversation change or new message
  useEffect(() => {
    if (isLoadingMessages) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if user was already near the bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    // If initial load or user sent/near bottom, scroll down
    if (prevMessagesLengthRef.current === 0 || isNearBottom) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, isLoadingMessages]);

  const otherUsername = activeConversation?.otherParticipant?.username || "Other user";

  if (isLoadingMessages) {
    return (
      <div className="messages-loading-state">
        <span className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
        <p>Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="messages-container" ref={scrollContainerRef}>
      {hasMoreMessages && (
        <div className="load-older-wrapper">
          <button
            type="button"
            className="btn-load-older"
            onClick={loadOlderMessages}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading older messages..." : "Load older messages"}
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="messages-empty-state">
          <div className="empty-chat-icon" aria-hidden="true">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="empty-chat-title">Say hello to {otherUsername}</p>
          <p className="empty-chat-subtitle">
            Send a message to start this conversation.
          </p>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isOutgoing={msg.senderId === user?.id}
          />
        ))
      )}

      {/* Typing indicator bubble */}
      {isOtherTyping && (
        <div className="message-row incoming typing-row" aria-live="polite">
          <div className="message-sender-avatar" aria-hidden="true">
            {otherUsername.slice(0, 2).toUpperCase()}
          </div>
          <div className="message-bubble-wrapper">
            <div className="typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="typing-label">{otherUsername} is typing...</span>
          </div>
        </div>
      )}

      <div ref={bottomAnchorRef} style={{ height: 1 }} />
    </div>
  );
};
