import React from "react";
import { Message } from "../../types/chat";

interface MessageItemProps {
  message: Message;
  isOutgoing: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, isOutgoing }) => {
  const formatTime = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const senderName = message.sender?.username || (isOutgoing ? "You" : "Them");
  const isPending = message.id.startsWith("temp-") || message.status === "SENDING";
  const statusClass = isPending ? "sending" : message.status.toLowerCase();

  return (
    <div className={`message-row ${isOutgoing ? "outgoing" : "incoming"}`}>
      {!isOutgoing && (
        <div className="message-sender-avatar" title={senderName} aria-hidden="true">
          {senderName.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div className="message-bubble-wrapper">
        <div className="message-bubble">
          <p className="message-text">{message.content}</p>
        </div>

        <div className="message-meta">
          <span className="message-time">{formatTime(message.createdAt)}</span>
          {isOutgoing && (
            <span
              className={`message-status-indicator status-${statusClass}`}
              title={isPending ? "Sending..." : `Status: ${message.status}`}
            >
              {isPending ? (
                <svg
                  className="message-status-clock"
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="6.25" />
                  <polyline points="8 4.75 8 8 10.25 9.5" />
                </svg>
              ) : message.status === "SEEN" ? (
                "✓✓"
              ) : (
                "✓"
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
