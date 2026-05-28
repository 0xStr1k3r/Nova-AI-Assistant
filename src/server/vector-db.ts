import fs from "fs";
import path from "path";
import os from "os";
import * as lancedb from "@lancedb/lancedb";

const DB_DIR = path.join(os.homedir(), ".config", "nova-voice-assistant");
const LANCE_DB_PATH = path.join(DB_DIR, "memory-db");

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

/**
 * Vector DB interfaces
 */
export interface MemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type: "conversation" | "code" | "note" | "browser_history" | "workflow";
    source?: string;
    timestamp: string;
    importance?: number; // 1-3
    tags?: string[];
  };
}

export interface SearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata: MemoryEntry["metadata"];
}

/**
 * VectorDB wrapper providing high-level API for semantic search
 */
export class VectorDB {
  private db: lancedb.Connection | null = null;
  private initialized = false;

  /**
   * Initialize vector database connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log("[VectorDB] Initializing LanceDB at:", LANCE_DB_PATH);
      this.db = await lancedb.connect(LANCE_DB_PATH);
      this.initialized = true;
      console.log("[VectorDB] ✅ Initialized successfully");
    } catch (error) {
      console.error("[VectorDB] ❌ Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Store a memory entry with embedding
   */
  async store(entry: MemoryEntry): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      
      // Prepare record for insertion
      const record = {
        id: entry.id,
        text: entry.text,
        embedding: entry.embedding,
        metadata: JSON.stringify(entry.metadata),
        type: entry.metadata.type,
        timestamp: entry.metadata.timestamp,
        importance: entry.metadata.importance || 1,
      };

      await table.add([record]);
      console.log(`[VectorDB] ✅ Stored entry: ${entry.id}`);
    } catch (error) {
      console.error("[VectorDB] ❌ Failed to store entry:", error);
      throw error;
    }
  }

  /**
   * Store multiple entries in batch
   */
  async storeBatch(entries: MemoryEntry[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      
      const records = entries.map(entry => ({
        id: entry.id,
        text: entry.text,
        embedding: entry.embedding,
        metadata: JSON.stringify(entry.metadata),
        type: entry.metadata.type,
        timestamp: entry.metadata.timestamp,
        importance: entry.metadata.importance || 1,
      }));

      await table.add(records);
      console.log(`[VectorDB] ✅ Stored ${entries.length} entries in batch`);
    } catch (error) {
      console.error("[VectorDB] ❌ Failed to store batch:", error);
      throw error;
    }
  }

  /**
   * Search for similar memories using embedding similarity
   */
  async search(query: {
    embedding: number[];
    limit?: number;
    filters?: {
      type?: string;
      minImportance?: number;
      since?: Date;
    };
  }): Promise<SearchResult[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      const limit = query.limit || 10;

      const results = await table
        .search(query.embedding)
        .limit(limit)
        .toArray();

      // Parse metadata and convert to SearchResult format
      const searchResults: SearchResult[] = results.map((result: any) => ({
        id: result.id,
        text: result.text,
        similarity: 1 - (result._distance || 0), // Convert distance to similarity
        metadata: JSON.parse(result.metadata),
      }));

      // Apply filters if specified
      if (query.filters) {
        const filtered = searchResults.filter(result => {
          if (query.filters?.type && result.metadata.type !== query.filters.type) {
            return false;
          }
          if (query.filters?.minImportance && 
              (result.metadata.importance || 1) < query.filters.minImportance) {
            return false;
          }
          if (query.filters?.since) {
            const entryTime = new Date(result.metadata.timestamp).getTime();
            const sinceTime = query.filters.since.getTime();
            if (entryTime < sinceTime) return false;
          }
          return true;
        });
        
        console.log(`[VectorDB] ✅ Found ${filtered.length} similar entries (after filters)`);
        return filtered;
      }

      console.log(`[VectorDB] ✅ Found ${searchResults.length} similar entries`);
      return searchResults;
    } catch (error) {
      console.error("[VectorDB] ❌ Search failed:", error);
      return [];
    }
  }

  /**
   * Delete an entry by ID
   */
  async delete(id: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      await table.delete(`id = '${id}'`);
      console.log(`[VectorDB] ✅ Deleted entry: ${id}`);
    } catch (error) {
      console.error("[VectorDB] ❌ Failed to delete entry:", error);
      throw error;
    }
  }

  /**
   * Get total count of stored entries
   */
  async count(): Promise<number> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      const result = await table.countRows();
      console.log(`[VectorDB] ℹ️  Total entries: ${result}`);
      return result;
    } catch (error) {
      console.error("[VectorDB] ❌ Count failed:", error);
      return 0;
    }
  }

  /**
   * Get statistics about stored entries
   */
  async getStats(): Promise<{
    totalCount: number;
    byType: Record<string, number>;
    byImportance: Record<number, number>;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      const allRecords = await table.query().toArray();

      const byType: Record<string, number> = {};
      const byImportance: Record<number, number> = {};
      let oldestEntry: string | undefined;
      let newestEntry: string | undefined;
      let oldestTime = Infinity;
      let newestTime = 0;

      for (const record of allRecords) {
        const metadata = JSON.parse(record.metadata);
        
        // Count by type
        byType[metadata.type] = (byType[metadata.type] || 0) + 1;
        
        // Count by importance
        const imp = metadata.importance || 1;
        byImportance[imp] = (byImportance[imp] || 0) + 1;
        
        // Track oldest and newest
        const time = new Date(metadata.timestamp).getTime();
        if (time < oldestTime) {
          oldestTime = time;
          oldestEntry = metadata.timestamp;
        }
        if (time > newestTime) {
          newestTime = time;
          newestEntry = metadata.timestamp;
        }
      }

      return {
        totalCount: allRecords.length,
        byType,
        byImportance,
        oldestEntry,
        newestEntry,
      };
    } catch (error) {
      console.error("[VectorDB] ❌ Stats failed:", error);
      return { totalCount: 0, byType: {}, byImportance: {} };
    }
  }

  /**
   * Clear old entries (archival strategy)
   */
  async archiveOldEntries(olderThan: Date, limit?: number): Promise<number> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const table = await this.getOrCreateTable("memories");
      const allRecords = await table.query().toArray();
      
      const toDelete = allRecords
        .filter((record: any) => {
          const metadata = JSON.parse(record.metadata);
          const entryTime = new Date(metadata.timestamp);
          return entryTime < olderThan;
        })
        .slice(0, limit)
        .map((record: any) => record.id);

      for (const id of toDelete) {
        await this.delete(id);
      }

      console.log(`[VectorDB] ✅ Archived ${toDelete.length} old entries`);
      return toDelete.length;
    } catch (error) {
      console.error("[VectorDB] ❌ Archival failed:", error);
      return 0;
    }
  }

  /**
   * Clear all entries (use with caution!)
   */
  async clear(): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error("Database not initialized");

    try {
      const tables = await this.db.tableNames();
      if (tables.includes("memories")) {
        // Delete all records from the table
        const table = await this.getOrCreateTable("memories");
        const allRecords = await table.query().toArray();
        for (const record of allRecords) {
          await this.delete(record.id);
        }
      }
      console.log("[VectorDB] ✅ All entries cleared");
    } catch (error) {
      console.error("[VectorDB] ❌ Clear failed:", error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    this.initialized = false;
    this.db = null;
    console.log("[VectorDB] ✅ Closed connection");
  }

  /**
   * Get or create table with schema
   */
  private async getOrCreateTable(tableName: string): Promise<lancedb.Table> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Try to open existing table
      return await this.db.openTable(tableName);
    } catch {
      // Create new table if it doesn't exist
      return await this.db.createTable(tableName, [
        {
          id: "memory_001",
          text: "placeholder",
          embedding: new Array(1536).fill(0), // 1536 dims for Gemini embeddings
          metadata: "{}",
          type: "conversation",
          timestamp: new Date().toISOString(),
          importance: 1,
        },
      ]);
    }
  }
}

/**
 * Singleton instance for global access
 */
let vectorDB: VectorDB | null = null;

export async function getVectorDB(): Promise<VectorDB> {
  if (!vectorDB) {
    vectorDB = new VectorDB();
    await vectorDB.initialize();
  }
  return vectorDB;
}

export async function closeVectorDB(): Promise<void> {
  if (vectorDB) {
    await vectorDB.close();
    vectorDB = null;
  }
}
