import { GoogleGenAI } from "@google/genai";

/**
 * Embedding Service - Generates embeddings using Gemini API
 * Uses text-embedding-004 model for consistent, high-quality embeddings
 */
export class EmbeddingService {
  private client: GoogleGenAI;
  private embeddingModel = "text-embedding-004";
  private cache = new Map<string, number[]>();

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Get embedding for a single text
   */
  async getEmbedding(text: string): Promise<number[]> {
    const normalized = text.trim();
    
    // Check cache first
    if (this.cache.has(normalized)) {
      console.log("[EmbeddingService] ✅ Cache hit for text (first 50 chars):", normalized.substring(0, 50));
      return this.cache.get(normalized)!;
    }

    try {
      console.log("[EmbeddingService] 🔄 Embedding text (first 50 chars):", normalized.substring(0, 50));
      
      const response = await this.client.models.embedContent({
        model: `models/${this.embeddingModel}`,
        contents: [
          {
            parts: [
              {
                text: normalized,
              },
            ],
          },
        ],
      } as any);

      const embedding = (response as any).embedding?.values || [];
      
      // Cache the result
      this.cache.set(normalized, embedding);
      
      console.log(`[EmbeddingService] ✅ Generated embedding (${embedding.length} dimensions)`);
      return embedding;
    } catch (error) {
      console.error("[EmbeddingService] ❌ Failed to generate embedding:", error);
      throw error;
    }
  }

  /**
   * Get embeddings for multiple texts with batching
   */
  async getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      try {
        const embedding = await this.getEmbedding(text);
        embeddings.push(embedding);
      } catch (error) {
        console.error("[EmbeddingService] ❌ Batch error for text:", text.substring(0, 50), error);
        // Push zero embedding on error to maintain alignment
        embeddings.push(new Array(1536).fill(0));
      }
    }

    console.log(`[EmbeddingService] ✅ Batch processed ${texts.length} texts`);
    return embeddings;
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log("[EmbeddingService] ✅ Cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()).slice(0, 10),
    };
  }
}

/**
 * Singleton instance for global access
 */
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(apiKey?: string): EmbeddingService {
  if (!embeddingService) {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error("GOOGLE_API_KEY environment variable not set");
    }
    embeddingService = new EmbeddingService(key);
  }
  return embeddingService;
}
