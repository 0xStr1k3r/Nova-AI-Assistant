/**
 * Discord Channel Adapter
 * Integrates Discord bot with Nova agent
 * ~128 LOC: Message handling, webhook processing
 */

import axios, { AxiosInstance } from 'axios';
import type { Message, MessageChannel, ChannelAdapter } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
  };
  content: string;
  timestamp: string;
  attachments: Array<{
    id: string;
    filename: string;
    size: number;
    url: string;
    content_type?: string;
  }>;
  mentions?: Array<{ id: string; username: string }>;
}

export class DiscordAdapter implements ChannelAdapter {
  id: MessageChannel = 'discord';
  name = 'Discord';
  private apiClient: AxiosInstance;
  private botToken: string;
  private agentGroupId: string;
  private messageCache: Map<string, number> = new Map();

  constructor(botToken: string, agentGroupId: string) {
    this.botToken = botToken;
    this.agentGroupId = agentGroupId;

    this.apiClient = axios.create({
      baseURL: 'https://discord.com/api/v10',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Send message to Discord user or channel
   */
  async sendMessage(channelId: string, text: string, media?: string[]): Promise<string> {
    try {
      const payload: any = {
        content: text,
      };

      // Discord embeds for rich formatting
      if (media && media.length > 0) {
        payload.embeds = media.map((url) => ({
          image: { url },
        }));
      }

      const response = await this.apiClient.post(`/channels/${channelId}/messages`, payload);
      return response.data.id;
    } catch (error) {
      console.error(`[DISCORD] Failed to send message to ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Poll Discord for new messages (via webhook endpoint)
   * In practice, use Discord.js library or webhooks for real-time
   */
  async pollMessages(): Promise<Message[]> {
    // Discord uses webhooks/gateway for real-time
    // This is a fallback for periodic checking
    return [];
  }

  /**
   * Setup webhook for Discord interactions
   * POST to this endpoint to handle Discord messages
   */
  async setupWebhook(url: string): Promise<void> {
    try {
      // In real implementation, register with Discord's interaction endpoints
      console.log(`[DISCORD] Webhook ready at ${url}`);
    } catch (error) {
      console.error('[DISCORD] Failed to setup webhook:', error);
      throw error;
    }
  }

  /**
   * Verify bot credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/users/@me');
      if (response.data.id) {
        console.log(`[DISCORD] ✅ Bot verified: @${response.data.username}#${response.data.discriminator}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[DISCORD] Credential verification failed:', error);
      return false;
    }
  }

  /**
   * Handle Discord interaction webhook payload
   */
  async handleInteraction(payload: any): Promise<Message | null> {
    if (payload.type !== 1 && payload.type !== 4) return null; // Type 1 = PING, Type 4 = MESSAGE_CREATE

    if (!payload.data?.options) return null;

    const userId = payload.member?.user?.id || payload.user?.id;
    const channelId = payload.channel_id;
    const content = payload.data.options[0]?.value || '';

    if (!content) return null;

    return {
      id: uuidv4(),
      channelId: this.id,
      userId,
      conversationId: `discord-${channelId}`,
      agentGroupId: this.agentGroupId,
      content,
      timestamp: Date.now(),
      metadata: {
        discordMessageId: payload.id,
        discordUserId: userId,
        discordChannelId: channelId,
      },
    };
  }

  /**
   * Edit existing Discord message
   */
  async editMessage(
    channelId: string,
    messageId: string,
    newText: string
  ): Promise<void> {
    try {
      await this.apiClient.patch(`/channels/${channelId}/messages/${messageId}`, {
        content: newText,
      });
    } catch (error) {
      console.error('[DISCORD] Failed to edit message:', error);
      throw error;
    }
  }

  /**
   * Add reaction to Discord message
   */
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    try {
      await this.apiClient.put(
        `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`
      );
    } catch (error) {
      console.error('[DISCORD] Failed to add reaction:', error);
      throw error;
    }
  }

  /**
   * Send embed (rich message)
   */
  async sendEmbed(
    channelId: string,
    title: string,
    description: string,
    fields?: Array<{ name: string; value: string }>
  ): Promise<string> {
    try {
      const response = await this.apiClient.post(`/channels/${channelId}/messages`, {
        embeds: [
          {
            title,
            description,
            fields,
            color: 3447003, // Blue
            timestamp: new Date().toISOString(),
          },
        ],
      });
      return response.data.id;
    } catch (error) {
      console.error('[DISCORD] Failed to send embed:', error);
      throw error;
    }
  }

  /**
   * Defer interaction response (for long operations)
   */
  async deferResponse(interactionToken: string): Promise<void> {
    try {
      await this.apiClient.post(
        `/interactions/${this.botToken}/${interactionToken}/callback`,
        {
          type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        }
      );
    } catch (error) {
      console.error('[DISCORD] Failed to defer response:', error);
      throw error;
    }
  }

  /**
   * Send followup message
   */
  async sendFollowup(interactionToken: string, text: string): Promise<string> {
    try {
      const response = await this.apiClient.post(
        `/webhooks/${this.botToken}/${interactionToken}`,
        { content: text }
      );
      return response.data.id;
    } catch (error) {
      console.error('[DISCORD] Failed to send followup:', error);
      throw error;
    }
  }
}

export default DiscordAdapter;
