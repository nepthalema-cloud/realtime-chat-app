import React, { useState, useRef, useEffect } from "react";
import { useChat } from "../../context/ChatContext";
import { useSocket } from "../../context/SocketContext";

export const MessageComposer: React.FC = () => {
  const { sendMessage, startTyping, stopTyping, activeConversationId } = useChat();
  const { isConnected } = useSocket();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }, [content]);

  // Focus textarea when conversation changes
  useEffect(() => {
    setContent("");
    textareaRef.current?.focus();
  }, [activeConversationId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (e.target.value.trim().length > 0) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    // 1. Immediately clear input and reset textarea height for instantaneous feedback
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    stopTyping();
    textareaRef.current?.focus();

    // 2. Dispatch sending in the background; on failure restore text so user never loses it
    sendMessage(trimmed).catch((err) => {
      console.error("Failed to send message:", err);
      setContent((prev) => (prev.trim() ? `${prev}\n${trimmed}` : trimmed));
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-composer-wrapper">
      {!isConnected && (
        <div className="composer-offline-warning">
          <span>⚠️</span>
          <span>Realtime socket disconnected. Messages will be sent via REST fallback.</span>
        </div>
      )}

      <div className="composer-form">
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          placeholder="Write a message... (Press Enter to send, Shift+Enter for new line)"
          value={content}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={stopTyping}
          rows={1}
          maxLength={5000}
          aria-label="Message content"
        />

        <button
          type="button"
          className="composer-send-btn"
          onClick={handleSend}
          disabled={!content.trim()}
          aria-label="Send message"
          title="Send message"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
};
