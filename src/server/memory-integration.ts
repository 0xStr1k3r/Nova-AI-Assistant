import { getSemanticMemory } from "./semantic-memory";

/**
 * Memory Integration for Server.ts
 * Handles storing conversations and injecting semantic context into prompts
 */

export async function storeConversationToMemory(
  userMessage: string,
  assistantResponse: string
): Promise<{ userEntryId?: string; assistantEntryId?: string; error?: string }> {
  try {
    const memory = await getSemanticMemory();
    const result = await memory.storeConversation({
      userMessage,
      assistantResponse,
    });
    console.log(`[SEMANTIC_MEMORY] ✅ Stored conversation pair: ${result.userEntryId}, ${result.assistantEntryId}`);
    return result;
  } catch (error: any) {
    console.error("[SEMANTIC_MEMORY] ❌ Failed to store conversation:", error.message);
    return { error: error.message };
  }
}

export async function getSemanticContextForPrompt(userQuery: string, limit: number = 5): Promise<string> {
  try {
    const memory = await getSemanticMemory();
    const results = await memory.searchContext(userQuery, {
      limit,
      minSimilarity: 0.7,
    });

    if (results.length === 0) {
      return "";
    }

    const contextStr = memory.formatContextForPrompt(results);
    console.log(`[SEMANTIC_MEMORY] ✅ Found ${results.length} relevant context entries`);
    return contextStr;
  } catch (error: any) {
    console.error("[SEMANTIC_MEMORY] ❌ Failed to get context:", error.message);
    return "";
  }
}

export async function cleanupOldMemories(olderThanDays: number = 30): Promise<number> {
  try {
    const memory = await getSemanticMemory();
    const archived = await memory.cleanup(olderThanDays);
    console.log(`[SEMANTIC_MEMORY] ✅ Cleaned up ${archived} old entries`);
    return archived;
  } catch (error: any) {
    console.error("[SEMANTIC_MEMORY] ❌ Cleanup failed:", error.message);
    return 0;
  }
}

export async function getMemoryStats(): Promise<any> {
  try {
    const memory = await getSemanticMemory();
    const stats = await memory.getStats();
    console.log("[SEMANTIC_MEMORY] ✅ Retrieved stats");
    return stats;
  } catch (error: any) {
    console.error("[SEMANTIC_MEMORY] ❌ Stats failed:", error.message);
    return null;
  }
}
