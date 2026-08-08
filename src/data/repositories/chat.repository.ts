import { getDb } from "@/data/db/db";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { ChatMessage, Conversation, ID } from "@/shared/types/domain";

export interface ChatRepository {
  listConversations(): Promise<Conversation[]>;
  createConversation(title?: string): Promise<Conversation>;
  renameConversation(id: ID, title: string): Promise<void>;
  removeConversation(id: ID): Promise<void>;
  listMessages(conversationId: ID): Promise<ChatMessage[]>;
  appendMessage(message: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage>;
  updateMessage(id: ID, patch: Partial<ChatMessage>): Promise<void>;
}

export const chatRepository: ChatRepository = {
  listConversations() {
    return getDb().conversations.orderBy("updatedAt").reverse().toArray();
  },
  async createConversation(title = "New chat") {
    const conversation: Conversation = { id: newId(), title, ...timestamps() };
    await getDb().conversations.add(conversation);
    return conversation;
  },
  async renameConversation(id, title) {
    await getDb().conversations.update(id, { title, updatedAt: now() });
  },
  async removeConversation(id) {
    await getDb().transaction("rw", getDb().conversations, getDb().messages, async () => {
      await getDb().conversations.delete(id);
      await getDb().messages.where("conversationId").equals(id).delete();
    });
  },
  async listMessages(conversationId) {
    const messages = await getDb()
      .messages.where("conversationId")
      .equals(conversationId)
      .toArray();
    return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async appendMessage(message) {
    const record: ChatMessage = { ...message, id: newId(), createdAt: now() };
    await getDb().messages.add(record);
    await getDb().conversations.update(message.conversationId, { updatedAt: now() });
    return record;
  },
  async updateMessage(id, patch) {
    await getDb().messages.update(id, patch);
  },
};
