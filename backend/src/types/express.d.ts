import { SafeUser } from "./user";
import { ConversationParticipant } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      conversationParticipant?: ConversationParticipant;
    }
  }
}
