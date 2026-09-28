import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ChatProvider } from "./context/ChatContext";
import { LoginForm } from "./components/auth/LoginForm";
import { RegisterForm } from "./components/auth/RegisterForm";
import { ChatLayout } from "./components/chat/ChatLayout";

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [authView, setAuthView] = useState<"login" | "register">("login");

  if (isLoading) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Initializing session...
        </p>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    );
  }

  return (
    <div className="app-container">
      {authView === "login" ? (
        <LoginForm onSwitchToRegister={() => setAuthView("register")} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setAuthView("login")} />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
