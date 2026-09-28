import React, { useState, useEffect, useRef } from "react";
import { User } from "../../types/auth";
import { api } from "../../services/api";
import { useChat } from "../../context/ChatContext";

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSearchModal: React.FC<UserSearchModalProps> = ({ isOpen, onClose }) => {
  const { createConversation } = useChat();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setUsers([]);
      setTimeout(() => inputRef.current?.focus(), 50);
      loadUsers("");
    }
  }, [isOpen]);

  const loadUsers = async (query: string) => {
    setIsLoading(true);
    try {
      const res = await api.users.list(query);
      setUsers(res.users);
    } catch (err) {
      console.error("Failed to search users:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadUsers(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelectUser = async (recipientId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createConversation(recipientId);
      onClose();
    } catch (err) {
      console.error("Failed to start conversation:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-modal-title"
      >
        <div className="modal-header">
          <h2 id="search-modal-title" className="modal-title">
            New Chat
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-search-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
        </div>

        <div className="modal-user-list">
          {isLoading ? (
            <div className="modal-loading-state">
              <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
              <p>Searching users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="modal-empty-state">
              <p>{search ? `No users found matching "${search}"` : "No other users found."}</p>
            </div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                type="button"
                className="modal-user-item"
                onClick={() => handleSelectUser(u.id)}
                disabled={isSubmitting}
              >
                <div className="user-avatar" style={{ width: 34, height: 34 }}>
                  {u.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="modal-user-info">
                  <span className="modal-user-name">{u.username}</span>
                  <span className="modal-user-email">{u.email}</span>
                </div>
                <span className="modal-start-badge">Chat</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
