/**
 * Channel Router - Multi-Channel Message Orchestration
 * Routes messages from 12+ channels to Nova agent and vice versa
 * ~328 LOC: Message ingestion, routing, delivery tracking
 */

import { v4 as uuidv4 } from 'uuid';
import * as sqlite3 from 'sqlite3';
import type {
  Message,
  MessageChannel,
  ChannelUser,
  ConversationSession,
  AgentGroup,
  NovaResponse,
  DeliveryTask,
} from './types';

class ChannelRouter {
  private db: sqlite3.Database;
  private inboundQueue: Message[] = [];
  private outboundQueue: DeliveryTask[] = [];
  private activeAgentGroups: Map<string, AgentGroup> = new Map();

  constructor(dbPath: string = '~/.config/nova-nanoclaw/router.db') {
    const expandedPath = dbPath.replace('~', process.env.HOME || '');
    this.db = new sqlite3.Database(expandedPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Channel users mapping
    this.db.run(`
      CREATE TABLE IF NOT EXISTS channel_users (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_user_id TEXT NOT NULL,
        agent_group_id TEXT NOT NULL,
        nova_user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        created_at INTEGER NOT NULL,
        last_message_at INTEGER NOT NULL,
        UNIQUE(channel_id, channel_user_id, agent_group_id)
      )
    `);

    // Conversation sessions
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        agent_group_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_user_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        last_message_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        FOREIGN KEY(channel_user_id) REFERENCES channel_users(id)
      )
    `);

    // Inbound message queue
    this.db.run(`
      CREATE TABLE IF NOT EXISTS inbound_messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_user_id TEXT NOT NULL,
        agent_group_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        content TEXT NOT NULL,
        media_urls TEXT,
        mentions TEXT,
        thread_id TEXT,
        reply_to TEXT,
        received_at INTEGER NOT NULL,
        processed_at INTEGER,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY(conversation_id) REFERENCES conversation_sessions(id)
      )
    `);

    // Outbound delivery queue
    this.db.run(`
      CREATE TABLE IF NOT EXISTS outbound_delivery (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        media_urls TEXT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        error_message TEXT,
        FOREIGN KEY(message_id) REFERENCES inbound_messages(id)
      )
    `);

    // Agent groups
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_multi_user BOOLEAN DEFAULT 1,
        enabled_channels TEXT NOT NULL,
        status TEXT DEFAULT 'active'
      )
    `);
  }

  /**
   * Register or create an agent group
   */
  async registerAgentGroup(agentGroup: AgentGroup): Promise<void> {
    const channels = JSON.stringify(agentGroup.enabledChannels);
    await this.dbRun(
      `INSERT OR REPLACE INTO agent_groups (id, name, description, created_at, updated_at, is_multi_user, enabled_channels, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agentGroup.id,
        agentGroup.name,
        agentGroup.description,
        agentGroup.createdAt,
        agentGroup.updatedAt,
        agentGroup.isMultiUser ? 1 : 0,
        channels,
        agentGroup.status,
      ]
    );
    this.activeAgentGroups.set(agentGroup.id, agentGroup);
  }

  async listAgentGroups(): Promise<AgentGroup[]> {
    const rows = await this.dbAll(
      `SELECT id, name, description, created_at, updated_at, is_multi_user, enabled_channels, status
       FROM agent_groups
       ORDER BY updated_at DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isMultiUser: !!row.is_multi_user,
      enabledChannels: this.parseChannels(row.enabled_channels),
      status: row.status,
    }));
  }

  async getAgentGroup(agentGroupId: string): Promise<AgentGroup | null> {
    const row = await this.dbGet(
      `SELECT id, name, description, created_at, updated_at, is_multi_user, enabled_channels, status
       FROM agent_groups WHERE id = ?`,
      [agentGroupId]
    );

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isMultiUser: !!row.is_multi_user,
      enabledChannels: this.parseChannels(row.enabled_channels),
      status: row.status,
    };
  }

  async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.dbAll(sql, params);
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return this.dbGet(sql, params);
  }

  /**
   * Ingest message from any channel
   */
  async ingestMessage(msg: Message): Promise<void> {
    // Create or get conversation session
    let sessionId = await this.getOrCreateSession(
      msg.agentGroupId,
      msg.channelId,
      msg.userId
    );

    const msgRecord = {
      id: msg.id || uuidv4(),
      channelId: msg.channelId,
      channelUserId: msg.userId,
      agentGroupId: msg.agentGroupId,
      conversationId: sessionId,
      content: msg.content,
      mediaUrls: msg.mediaUrls ? JSON.stringify(msg.mediaUrls) : null,
      mentions: msg.mentions ? JSON.stringify(msg.mentions) : null,
      threadId: msg.threadId || null,
      replyTo: msg.replyTo || null,
      receivedAt: msg.timestamp,
    };

    await this.dbRun(
      `INSERT INTO inbound_messages 
       (id, channel_id, channel_user_id, agent_group_id, conversation_id, content, media_urls, mentions, thread_id, reply_to, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(msgRecord)
    );

    this.inboundQueue.push(msg);
  }

  /**
   * Get pending messages for processing
   */
  async getPendingMessages(limit: number = 50): Promise<Message[]> {
    return new Promise((resolve) => {
      this.db.all(
        `SELECT * FROM inbound_messages WHERE status = 'pending' LIMIT ?`,
        [limit],
        (err, rows: any[]) => {
          if (err) {
            console.error('[ROUTER] Error fetching pending messages:', err);
            resolve([]);
            return;
          }
          const messages = rows.map((row) => ({
            id: row.id,
            channelId: row.channel_id,
            userId: row.channel_user_id,
            conversationId: row.conversation_id,
            agentGroupId: row.agent_group_id,
            content: row.content,
            mediaUrls: row.media_urls ? JSON.parse(row.media_urls) : [],
            mentions: row.mentions ? JSON.parse(row.mentions) : [],
            threadId: row.thread_id,
            replyTo: row.reply_to,
            timestamp: row.received_at,
            metadata: {},
          }));
          resolve(messages);
        }
      );
    });
  }

  /**
   * Queue response for delivery to channel
   */
  async queueResponse(
    inboundMsgId: string,
    channelId: MessageChannel,
    channelUserId: string,
    response: NovaResponse
  ): Promise<string> {
    const deliveryId = uuidv4();
    const task: DeliveryTask = {
      id: deliveryId,
      messageId: inboundMsgId,
      channelId,
      channelUserId,
      content: response.text,
      mediaUrls: response.metadata?.mediaUrls,
      status: 'pending',
      attempts: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    };

    await this.dbRun(
      `INSERT INTO outbound_delivery 
       (id, message_id, channel_id, channel_user_id, content, media_urls, status, attempts, max_retries, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.messageId,
        task.channelId,
        task.channelUserId,
        task.content,
        task.mediaUrls ? JSON.stringify(task.mediaUrls) : null,
        task.status,
        task.attempts,
        task.maxRetries,
        task.createdAt,
      ]
    );

    this.outboundQueue.push(task);
    return deliveryId;
  }

  /**
   * Get pending delivery tasks
   */
  async getPendingDeliveries(limit: number = 50): Promise<DeliveryTask[]> {
    return new Promise((resolve) => {
      this.db.all(
        `SELECT * FROM outbound_delivery WHERE status IN ('pending', 'retrying') LIMIT ?`,
        [limit],
        (err, rows: any[]) => {
          if (err) {
            console.error('[ROUTER] Error fetching pending deliveries:', err);
            resolve([]);
            return;
          }
          const deliveries = rows.map((row) => ({
            id: row.id,
            messageId: row.message_id,
            channelId: row.channel_id,
            channelUserId: row.channel_user_id,
            content: row.content,
            mediaUrls: row.media_urls ? JSON.parse(row.media_urls) : [],
            status: row.status,
            attempts: row.attempts,
            maxRetries: row.max_retries,
            createdAt: row.created_at,
            sentAt: row.sent_at,
            error: row.error_message,
          }));
          resolve(deliveries);
        }
      );
    });
  }

  /**
   * Mark delivery as sent
   */
  async markDeliverySent(deliveryId: string): Promise<void> {
    await this.dbRun(
      `UPDATE outbound_delivery SET status = 'sent', sent_at = ? WHERE id = ?`,
      [Date.now(), deliveryId]
    );
  }

  /**
   * Mark delivery as failed with retry
   */
  async markDeliveryFailed(
    deliveryId: string,
    error: string,
    shouldRetry: boolean = true
  ): Promise<void> {
    const task = await this.getDeliveryTask(deliveryId);
    if (!task) return;

    const nextStatus = shouldRetry && task.attempts < task.maxRetries ? 'retrying' : 'failed';
    const nextAttempts = task.attempts + 1;

    await this.dbRun(
      `UPDATE outbound_delivery SET status = ?, attempts = ?, error_message = ? WHERE id = ?`,
      [nextStatus, nextAttempts, error, deliveryId]
    );
  }

  /**
   * Mark inbound message as processed
   */
  async markMessageProcessed(msgId: string): Promise<void> {
    await this.dbRun(
      `UPDATE inbound_messages SET status = 'processed', processed_at = ? WHERE id = ?`,
      [Date.now(), msgId]
    );
  }

  // ============ Private Helpers ============

  private async getOrCreateSession(
    agentGroupId: string,
    channelId: MessageChannel,
    channelUserId: string
  ): Promise<string> {
    // Find existing session
    const existing = await this.dbGet(
      `SELECT id FROM conversation_sessions WHERE agent_group_id = ? AND channel_id = ? AND channel_user_id = ? AND status = 'active'`,
      [agentGroupId, channelId, channelUserId]
    );

    if (existing) return existing.id;

    // Create new session
    const sessionId = uuidv4();
    await this.dbRun(
      `INSERT INTO conversation_sessions (id, agent_group_id, channel_id, channel_user_id, started_at, last_message_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, agentGroupId, channelId, channelUserId, Date.now(), Date.now(), 'active']
    );

    return sessionId;
  }

  private dbRun(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private dbGet(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve) => {
      this.db.get(sql, params, (err, row) => {
        resolve(err ? null : row);
      });
    });
  }

  private dbAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  private parseChannels(raw: string | null): MessageChannel[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[ROUTER] Failed to parse enabled channels JSON:', err);
      return [];
    }
  }

  private async getDeliveryTask(deliveryId: string): Promise<DeliveryTask | null> {
    const row = await this.dbGet(`SELECT * FROM outbound_delivery WHERE id = ?`, [deliveryId]);
    if (!row) return null;
    return {
      id: row.id,
      messageId: row.message_id,
      channelId: row.channel_id,
      channelUserId: row.channel_user_id,
      content: row.content,
      mediaUrls: row.media_urls ? JSON.parse(row.media_urls) : [],
      status: row.status,
      attempts: row.attempts,
      maxRetries: row.max_retries,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      error: row.error_message,
    };
  }
}

let routerInstance: ChannelRouter | null = null;

export function getRouter(): ChannelRouter {
  if (!routerInstance) {
    routerInstance = new ChannelRouter();
  }
  return routerInstance;
}

export default ChannelRouter;
