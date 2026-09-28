import React from "react";
import { useChat } from "../../context/ChatContext";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";

interface ChatAreaProps {
  onBack?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onBack }) => {
  const { activeConversation, isOtherTyping, selectConversation, onlineUserIds } = useChat();

  if (!activeConversation) {
    return (
      <main className="chat-area empty-selection" aria-label="No conversation selected">
        <div className="empty-selection-content">
          <div className="empty-selection-icon" aria-hidden="true">
            <svg
              width="48"
              height="48"
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
          <h2 className="empty-selection-title">Select a conversation</h2>
          <p className="empty-selection-text">
            Choose a chat from the sidebar or click New Chat to start a conversation.
          </p>
        </div>
      </main>
    );
  }

  const otherUser = activeConversation.otherParticipant;
  const username = otherUser?.username || "Direct Message";
  const initials = username.slice(0, 2).toUpperCase();
  const isOnline = otherUser ? onlineUserIds.has(otherUser.id) : false;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      selectConversation(null);
    }
  };

  return (
    <main className="chat-area active-chat" aria-label={`Chat with ${username}`}>
      {/* Chat header */}
      <div className="chat-header">
        <div className="chat-header-user">
          <button
            type="button"
            className="btn-back-mobile"
            onClick={handleBack}
            aria-label="Back to chats list"
            title="Back"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>

          <div className="avatar-wrapper">
            <div className="conversation-avatar" aria-hidden="true">
              {initials}
            </div>
            {isOnline && <span className="presence-dot online" title="Online" />}
          </div>

          <div className="chat-header-info">
            <span className="chat-header-name">{username}</span>
            <span className="chat-header-status">
              {isOtherTyping ? (
                <span className="status-typing">typing...</span>
              ) : isOnline ? (
                <span className="status-online">online</span>
              ) : (
                <span className="status-offline">offline</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Message history */}
      <MessageList />

      {/* Composer */}
      <MessageComposer />
    </main>
  );
};
