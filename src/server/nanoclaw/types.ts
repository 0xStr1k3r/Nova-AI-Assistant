/**
 * NanoClaw Channel Router - Type Definitions
 * Entity model for multi-channel message routing
 */

export type MessageChannel = 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'teams' | 'imessage' | 'matrix' | 'signal' | 'viber' | 'sms' | 'email' | 'web';

export interface Message {
  id: string;
  channelId: MessageChannel;
  userId: string;
  conversationId: string;
  agentGroupId: string;
  content: string;
  mediaUrls?: string[];
  mentions?: string[];
  threadId?: string;
  replyTo?: string;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface ChannelUser {
  channelUserId: string;
  channelId: MessageChannel;
  agentGroupId: string;
  novaUserId: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
  lastMessageAt: number;
}

export interface ConversationSession {
  id: string;
  agentGroupId: string;
  channelId: MessageChannel;
  userId: string;
  startedAt: number;
  lastMessageAt: number;
  messageCount: number;
  status: 'active' | 'archived' | 'paused';
}

export interface AgentGroup {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  isMultiUser: boolean;
  enabledChannels: MessageChannel[];
  status: 'active' | 'inactive' | 'maintenance';
}

export interface DeliveryTask {
  id: string;
  messageId: string;
  channelId: MessageChannel;
  channelUserId: string;
  content: string;
  mediaUrls?: string[];
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempts: number;
  maxRetries: number;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

export interface ChannelConfig {
  channelId: MessageChannel;
  enabled: boolean;
  credentials?: Record<string, any>;
  rateLimit?: {
    messagesPerSecond: number;
    burstSize: number;
  };
  webhookUrl?: string;
  polling?: {
    enabled: boolean;
    intervalMs: number;
  };
}

export interface NovaResponse {
  text: string;
  actions?: Array<{
    type: string;
    app: string;
    command: string;
    args: Record<string, any>;
  }>;
  metadata?: Record<string, any>;
}

export interface ChannelAdapter {
  id: MessageChannel;
  name: string;
  sendMessage(userId: string, text: string, media?: string[]): Promise<string>;
  pollMessages(): Promise<Message[]>;
  setupWebhook(url: string): Promise<void>;
  verifyCredentials(): Promise<boolean>;
}
