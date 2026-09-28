import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";

export const AppHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const { status, isConnected } = useSocket();

  const getInitials = (name: string): string => {
    return name ? name.slice(0, 2).toUpperCase() : "U";
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <svg
          className="header-brand-icon"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="header-title">Chat</span>
      </div>

      <div className="header-actions">
        {/* Realtime status indicator */}
        <div
          className={`status-badge ${status}`}
          title={isConnected ? "Realtime Socket.IO connected" : `Socket status: ${status}`}
          role="status"
        >
          <span className="status-dot" />
          <span>
            {status === "connected" && "Online"}
            {status === "connecting" && "Connecting..."}
            {status === "disconnected" && "Disconnected"}
            {status === "error" && "Offline"}
          </span>
        </div>

        {/* User profile */}
        {user && (
          <div className="user-profile">
            <div className="user-avatar" title={user.username}>
              {getInitials(user.username)}
            </div>
            <div className="user-details">
              <span className="user-username">{user.username}</span>
              <span className="user-email">{user.email}</span>
            </div>
          </div>
        )}

        {/* Logout control */}
        <button
          type="button"
          className="btn-logout"
          onClick={logout}
          aria-label="Log out of application"
        >
          Log Out
        </button>
      </div>
    </header>
  );
};
