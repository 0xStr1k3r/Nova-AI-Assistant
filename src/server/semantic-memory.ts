import { randomUUID } from "crypto";
import { getVectorDB, VectorDB, MemoryEntry, SearchResult } from "./vector-db";
import { getEmbeddingService, EmbeddingService } from "./embedding-service";

/**
 * Semantic Memory - High-level interface for memory operations
 * Manages storing and retrieving conversation context using vector similarity
 */
export class SemanticMemory {
  private vectorDB: VectorDB;
  private embeddingService: EmbeddingService;
  private initialized = false;

  constructor(vectorDB: VectorDB, embeddingService: EmbeddingService) {
    this.vectorDB = vectorDB;
    this.embeddingService = embeddingService;
  }

  /**
   * Initialize semantic memory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log("[SemanticMemory] ✅ Initialized");
  }

  /**
   * Store a conversation message with embeddings
   */
  async storeConversation(input: {
    userMessage: string;
    assistantResponse: string;
    context?: string;
  }): Promise<{ userEntryId: string; assistantEntryId: string }> {
    const userEntryId = `conv_user_${randomUUID()}`;
    const assistantEntryId = `conv_assistant_${randomUUID()}`;

    try {
      // Generate embeddings
      const userEmbedding = await this.embeddingService.getEmbedding(input.userMessage);
      const assistantEmbedding = await this.embeddingService.getEmbedding(input.assistantResponse);

      // Store both entries
      await this.vectorDB.storeBatch([
        {
          id: userEntryId,
          text: input.userMessage,
          embedding: userEmbedding,
          metadata: {
            type: "conversation",
            source: "user",
            timestamp: new Date().toISOString(),
            importance: 2,
            tags: extractTags(input.userMessage),
          },
        },
        {
          id: assistantEntryId,
          text: input.assistantResponse,
          embedding: assistantEmbedding,
          metadata: {
            type: "conversation",
            source: "assistant",
            timestamp: new Date().toISOString(),
            importance: 2,
            tags: extractTags(input.assistantResponse),
          },
        },
      ]);

      console.log("[SemanticMemory] ✅ Stored conversation pair");
      return { userEntryId, assistantEntryId };
    } catch (error) {
      console.error("[SemanticMemory] ❌ Failed to store conversation:", error);
      throw error;
    }
  }

  /**
   * Store a code snippet with metadata
   */
  async storeCodeSnippet(input: {
    code: string;
    language: string;
    description: string;
    tags?: string[];
  }): Promise<string> {
    const entryId = `code_${randomUUID()}`;
    const text = `${input.description}\n\n${input.language}:\n${input.code}`;

    try {
      const embedding = await this.embeddingService.getEmbedding(text);

      await this.vectorDB.store({
        id: entryId,
        text,
        embedding,
        metadata: {
          type: "code",
          source: input.language,
          timestamp: new Date().toISOString(),
          importance: 3,
          tags: [input.language, ...(input.tags || [])],
        },
      });

      console.log(`[SemanticMemory] ✅ Stored code snippet (${input.language})`);
      return entryId;
    } catch (error) {
      console.error("[SemanticMemory] ❌ Failed to store code snippet:", error);
      throw error;
    }
  }

  /**
   * Store browser history entry
   */
  async storeBrowserHistory(input: {
    url: string;
    title: string;
    content?: string;
    tags?: string[];
  }): Promise<string> {
    const entryId = `browser_${randomUUID()}`;
    const text = `${input.title}\n${input.url}\n${input.content || ""}`;

    try {
      const embedding = await this.embeddingService.getEmbedding(text);

      await this.vectorDB.store({
        id: entryId,
        text,
        embedding,
        metadata: {
          type: "browser_history",
          source: new URL(input.url).hostname,
          timestamp: new Date().toISOString(),
          importance: 1,
          tags: [new URL(input.url).hostname, ...(input.tags || [])],
        },
      });

      console.log("[SemanticMemory] ✅ Stored browser history entry");
      return entryId;
    } catch (error) {
      console.error("[SemanticMemory] ❌ Failed to store browser history:", error);
      throw error;
    }
  }

  /**
   * Search for relevant context based on query
   */
  async searchContext(query: string, options?: {
    limit?: number;
    type?: string;
    minSimilarity?: number;
  }): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      
      const results = await this.vectorDB.search({
        embedding: queryEmbedding,
        limit: options?.limit || 10,
        filters: {
          type: options?.type,
          minImportance: 1,
        },
      });

      // Filter by minimum similarity if specified
      const filtered = options?.minSimilarity
        ? results.filter(r => r.similarity >= options.minSimilarity)
        : results;

      console.log(`[SemanticMemory] ✅ Found ${filtered.length} relevant entries`);
      return filtered;
    } catch (error) {
      console.error("[SemanticMemory] ❌ Search failed:", error);
      return [];
    }
  }

  /**
   * Format search results as context string for prompt injection
   */
  formatContextForPrompt(results: SearchResult[]): string {
    if (results.length === 0) return "";

    const lines: string[] = ["\n\n--- SEMANTIC MEMORY (Relevant Context) ---"];
    
    // Group by type
    const byType: Record<string, SearchResult[]> = {};
    for (const result of results) {
      const type = result.metadata.type;
      if (!byType[type]) byType[type] = [];
      byType[type].push(result);
    }

    // Format each group
    for (const [type, entries] of Object.entries(byType)) {
      lines.push(`\n${type.toUpperCase()}:`);
      for (const entry of entries.slice(0, 5)) {
        // Limit to 5 entries per type
        const preview = entry.text.substring(0, 150);
        const similarity = (entry.similarity * 100).toFixed(1);
        lines.push(`  • (${similarity}% match) ${preview}...`);
      }
    }

    lines.push("---");
    return lines.join("\n");
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<any> {
    try {
      const stats = await this.vectorDB.getStats();
      console.log("[SemanticMemory] ✅ Retrieved stats");
      return stats;
    } catch (error) {
      console.error("[SemanticMemory] ❌ Failed to get stats:", error);
      return null;
    }
  }

  /**
   * Cleanup old entries (older than specified days)
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const archived = await this.vectorDB.archiveOldEntries(cutoffDate, 100);
      console.log(`[SemanticMemory] ✅ Cleaned up ${archived} old entries`);
      return archived;
    } catch (error) {
      console.error("[SemanticMemory] ❌ Cleanup failed:", error);
      return 0;
    }
  }

  /**
   * Clear all semantic memory (use with caution!)
   */
  async clear(): Promise<void> {
    try {
      await this.vectorDB.clear();
      this.embeddingService.clearCache();
      console.log("[SemanticMemory] ✅ All memory cleared");
    } catch (error) {
      console.error("[SemanticMemory] ❌ Failed to clear memory:", error);
      throw error;
    }
  }
}

/**
 * Helper function to extract tags from text
 */
function extractTags(text: string): string[] {
  const tags: Set<string> = new Set();
  
  // Extract hashtags
  const hashtagRegex = /#\w+/g;
  const hashtags = text.match(hashtagRegex);
  if (hashtags) {
    hashtags.forEach(tag => tags.add(tag.substring(1).toLowerCase()));
  }

  // Extract code language hints
  const codeLanguages = [
    "python", "javascript", "typescript", "java", "c++", "rust", "go",
    "swift", "kotlin", "sql", "html", "css", "react", "vue", "angular"
  ];
  for (const lang of codeLanguages) {
    if (text.toLowerCase().includes(lang)) {
      tags.add(lang);
    }
  }

  // Extract common topics
  const topics = [
    "api", "database", "frontend", "backend", "deployment", "testing",
    "security", "performance", "debugging", "git", "docker", "kubernetes"
  ];
  for (const topic of topics) {
    if (text.toLowerCase().includes(topic)) {
      tags.add(topic);
    }
  }

  return Array.from(tags);
}

/**
 * Singleton instance for global access
 */
let semanticMemory: SemanticMemory | null = null;

export async function getSemanticMemory(): Promise<SemanticMemory> {
  if (!semanticMemory) {
    const vectorDB = await getVectorDB();
    const embeddingService = getEmbeddingService();
    semanticMemory = new SemanticMemory(vectorDB, embeddingService);
    await semanticMemory.initialize();
  }
  return semanticMemory;
}

export async function closeSemanticMemory(): Promise<void> {
  semanticMemory = null;
}
