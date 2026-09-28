import { z } from "zod";

export const createConversationSchema = z.object({
  recipientId: z.string().uuid("Invalid recipient user ID format"),
});

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(5000, "Message cannot exceed 5000 characters"),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
