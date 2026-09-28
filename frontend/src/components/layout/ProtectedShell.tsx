import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { AppHeader } from "./AppHeader";

export const ProtectedShell: React.FC = () => {
  const { user } = useAuth();
  const { status, socketId, error: socketError } = useSocket();

  if (!user) {
    return null;
  }

  return (
    <div className="app-container">
      <AppHeader />

      <main className="protected-shell-main">
        {socketError && (
          <div className="alert alert-warning" role="alert">
            <span>⚠️</span>
            <span>{socketError}</span>
          </div>
        )}

        <div className="placeholder-card">
          <h2>Protected Application Shell</h2>
          <p>
            You are securely authenticated. The React frontend foundation, centralized API client,
            session restoration, and Socket.IO transport layer are active and verified.
          </p>

          <div className="meta-grid">
            <div className="meta-box">
              <div className="meta-box-label">Authenticated User</div>
              <div className="meta-box-value">{user.username}</div>
            </div>

            <div className="meta-box">
              <div className="meta-box-label">Email Address</div>
              <div className="meta-box-value">{user.email}</div>
            </div>

            <div className="meta-box">
              <div className="meta-box-label">User ID</div>
              <div className="meta-box-value" style={{ fontSize: "0.8rem" }}>
                {user.id}
              </div>
            </div>

            <div className="meta-box">
              <div className="meta-box-label">Realtime Socket Status</div>
              <div className="meta-box-value" style={{ textTransform: "capitalize" }}>
                {status}
              </div>
            </div>

            <div className="meta-box">
              <div className="meta-box-label">Socket ID</div>
              <div className="meta-box-value" style={{ fontSize: "0.8rem" }}>
                {socketId || "Not connected"}
              </div>
            </div>

            <div className="meta-box">
              <div className="meta-box-label">Phase Status</div>
              <div className="meta-box-value" style={{ color: "var(--accent-primary)" }}>
                Phase 5 Foundation
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              background: "var(--bg-primary)",
              borderRadius: "var(--radius-md)",
              border: "1px dashed var(--border-color)",
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
              lineHeight: 1.6,
            }}
          >
            <strong>Phase 6 Ready:</strong> The full chat layout, user search, 1-to-1 conversation
            threads, realtime message exchange, typing indicators, and presence updates will be
            implemented in Phase 6.
          </div>
        </div>
      </main>
    </div>
  );
};
