import { Router } from "express";
import {
  createOrGetConversation,
  getConversations,
  getConversationById,
  markConversationAsRead,
} from "../controllers/conversation.controller";
import { getMessages, sendMessage } from "../controllers/message.controller";
import { authenticateUser } from "../middleware/auth";
import { requireConversationParticipant } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createConversationSchema,
  sendMessageSchema,
} from "../validators/conversation.validator";

const router = Router();

// All conversation routes require authentication
router.use(authenticateUser);

// 1. List user's conversations
router.get("/", getConversations);

// 2. Create or retrieve existing 1-on-1 conversation
router.post("/", validate(createConversationSchema), createOrGetConversation);

// 3. Get single conversation details (Strict participant authorization required)
router.get("/:id", requireConversationParticipant, getConversationById);

// 4. Mark conversation as read (Strict participant authorization required)
router.patch("/:id/read", requireConversationParticipant, markConversationAsRead);

// 5. Get paginated messages (Strict participant authorization required)
router.get("/:id/messages", requireConversationParticipant, getMessages);

// 6. Send message fallback / REST endpoint (Strict participant authorization required)
router.post(
  "/:id/messages",
  requireConversationParticipant,
  validate(sendMessageSchema),
  sendMessage
);

export default router;
