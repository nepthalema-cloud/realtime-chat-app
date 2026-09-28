import React from "react";
import { AppHeader } from "../layout/AppHeader";
import { ConversationList } from "./ConversationList";
import { ChatArea } from "./ChatArea";
import { useChat } from "../../context/ChatContext";

export const ChatLayout: React.FC = () => {
  const { activeConversationId, selectConversation } = useChat();

  return (
    <div className="app-container">
      <AppHeader />

      <div className={`chat-layout-wrapper ${activeConversationId ? "has-active-chat" : ""}`}>
        <ConversationList onSelectConversation={() => {}} />
        <ChatArea onBack={() => selectConversation(null)} />
      </div>
    </div>
  );
};
