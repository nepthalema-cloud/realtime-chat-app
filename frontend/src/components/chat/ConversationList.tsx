import React, { useState } from "react";
import { useChat } from "../../context/ChatContext";
import { UserSearchModal } from "./UserSearchModal";

interface ConversationListProps {
  onSelectConversation?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ onSelectConversation }) => {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    isLoadingConversations,
    onlineUserIds,
  } = useChat();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const formatTimestamp = (dateString?: string | null): string => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!filterQuery.trim()) return true;
    const name = c.otherParticipant?.username.toLowerCase() || "";
    return name.includes(filterQuery.toLowerCase());
  });

  const handleConversationClick = (id: string) => {
    selectConversation(id);
    if (onSelectConversation) {
      onSelectConversation();
    }
  };

  return (
    <aside className="conversation-sidebar" aria-label="Conversation list">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Chats</h2>
        <button
          type="button"
          className="btn-new-chat"
          onClick={() => setIsSearchOpen(true)}
          aria-label="Start new conversation"
          title="New chat"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New Chat</span>
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Search chats..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          aria-label="Filter conversations"
        />
      </div>

      <div className="conversation-items-list" role="list">
        {isLoadingConversations ? (
          <div className="sidebar-loading">
            <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
            <p>Loading chats...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="sidebar-empty">
            <p className="sidebar-empty-title">No conversations yet</p>
            <p className="sidebar-empty-desc">
              Start a new chat to begin messaging.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: "1rem", fontSize: "0.85rem", padding: "0.5rem 1rem" }}
              onClick={() => setIsSearchOpen(true)}
            >
              Start a Chat
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const otherName = conv.otherParticipant?.username || "Unknown User";
            const initials = otherName.slice(0, 2).toUpperCase();
            const lastMsgText = conv.lastMessage
              ? conv.lastMessage.content
              : "No messages yet";
            const timeStr = formatTimestamp(conv.lastMessage?.createdAt || conv.updatedAt);
            const isOnline = conv.otherParticipant ? onlineUserIds.has(conv.otherParticipant.id) : false;

            return (
              <div
                key={conv.id}
                role="listitem"
                className={`conversation-item ${isActive ? "active" : ""}`}
                onClick={() => handleConversationClick(conv.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleConversationClick(conv.id);
                  }
                }}
                aria-selected={isActive}
              >
                <div className="avatar-wrapper">
                  <div className="conversation-avatar" aria-hidden="true">
                    {initials}
                  </div>
                  {isOnline && <span className="presence-dot online" title="Online" />}
                </div>

                <div className="conversation-content">
                  <div className="conversation-top-row">
                    <span className="conversation-name">{otherName}</span>
                    <span className="conversation-time">{timeStr}</span>
                  </div>

                  <div className="conversation-bottom-row">
                    <span className="conversation-preview">{lastMsgText}</span>
                    {conv.unreadCount > 0 && (
                      <span className="unread-badge" aria-label={`${conv.unreadCount} unread messages`}>
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <UserSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </aside>
  );
};
