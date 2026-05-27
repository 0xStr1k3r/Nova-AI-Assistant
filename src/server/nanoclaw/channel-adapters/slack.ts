/**
 * Slack Channel Adapter
 * Integrates Slack with Nova agent
 * ~135 LOC: Events API, message handling, delivery
 */

import axios, { AxiosInstance } from 'axios';
import type { Message, MessageChannel, ChannelAdapter } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface SlackEvent {
  type: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: Array<{
    id: string;
    name: string;
    permalink: string;
    url_private: string;
  }>;
}

interface SlackEventPayload {
  token: string;
  team_id: string;
  event: SlackEvent;
  event_id: string;
  event_time: number;
}

export class SlackAdapter implements ChannelAdapter {
  id: MessageChannel = 'slack';
  name = 'Slack';
  private apiClient: AxiosInstance;
  private botToken: string;
  private agentGroupId: string;
  private verificationToken: string;

  constructor(botToken: string, verificationToken: string, agentGroupId: string) {
    this.botToken = botToken;
    this.verificationToken = verificationToken;
    this.agentGroupId = agentGroupId;

    this.apiClient = axios.create({
      baseURL: 'https://slack.com/api',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Send message to Slack user or channel
   */
  async sendMessage(channelId: string, text: string, media?: string[]): Promise<string> {
    try {
      const payload: any = {
        channel: channelId,
        text,
      };

      // Add attachments for media
      if (media && media.length > 0) {
        payload.blocks = media.map((url) => ({
          type: 'image',
          image_url: url,
          alt_text: 'Image',
        }));
      }

      const response = await this.apiClient.post('/chat.postMessage', payload);

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data.ts;
    } catch (error) {
      console.error(`[SLACK] Failed to send message to ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Poll Slack for messages (Events API is preferred)
   */
  async pollMessages(): Promise<Message[]> {
    // Slack Events API handles real-time via webhooks
    return [];
  }

  /**
   * Handle Slack event webhook
   */
  async handleEventWebhook(payload: SlackEventPayload): Promise<Message | null> {
    // Verify token
    if (payload.token !== this.verificationToken) {
      console.warn('[SLACK] Invalid verification token');
      return null;
    }

    const event = payload.event;

    // Handle URL verification challenge
    if (payload.type === 'url_verification') {
      return null; // Already handled at HTTP level
    }

    // Handle message events
    if (event.type === 'message' && event.text && !event.thread_ts) {
      return {
        id: uuidv4(),
        channelId: this.id,
        userId: event.user || 'bot',
        conversationId: event.channel || 'unknown',
        agentGroupId: this.agentGroupId,
        content: event.text,
        timestamp: parseInt((event.ts || '0').split('.')[0]) * 1000,
        metadata: {
          slackUserId: event.user,
          slackChannelId: event.channel,
          slackTimestamp: event.ts,
        },
      };
    }

    // Handle file uploads
    if (event.type === 'message' && event.files) {
      const fileUrls = event.files.map((f) => f.url_private);
      return {
        id: uuidv4(),
        channelId: this.id,
        userId: event.user || 'bot',
        conversationId: event.channel || 'unknown',
        agentGroupId: this.agentGroupId,
        content: event.text || '[File]',
        mediaUrls: fileUrls,
        timestamp: parseInt((event.ts || '0').split('.')[0]) * 1000,
        metadata: {
          slackUserId: event.user,
          slackChannelId: event.channel,
          fileCount: event.files.length,
        },
      };
    }

    return null;
  }

  /**
   * Setup webhook for Slack Events API
   */
  async setupWebhook(url: string): Promise<void> {
    try {
      console.log(
        `[SLACK] Configure webhook in Slack app settings to: ${url}`
      );
      console.log('[SLACK] Subscribe to: message.channels, message.groups, message.im');
    } catch (error) {
      console.error('[SLACK] Failed to setup webhook:', error);
      throw error;
    }
  }

  /**
   * Verify bot credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/auth.test');
      if (response.data.ok) {
        console.log(`[SLACK] ✅ Bot verified: @${response.data.user_id} in ${response.data.team_id}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SLACK] Credential verification failed:', error);
      return false;
    }
  }

  /**
   * Update message in Slack
   */
  async updateMessage(
    channelId: string,
    timestamp: string,
    text: string
  ): Promise<void> {
    try {
      const response = await this.apiClient.post('/chat.update', {
        channel: channelId,
        ts: timestamp,
        text,
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('[SLACK] Failed to update message:', error);
      throw error;
    }
  }

  /**
   * Add reaction to Slack message
   */
  async addReaction(
    channelId: string,
    timestamp: string,
    emoji: string
  ): Promise<void> {
    try {
      const response = await this.apiClient.post('/reactions.add', {
        channel: channelId,
        timestamp,
        name: emoji,
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('[SLACK] Failed to add reaction:', error);
      throw error;
    }
  }

  /**
   * Send thread reply
   */
  async sendThreadReply(
    channelId: string,
    threadTs: string,
    text: string
  ): Promise<string> {
    try {
      const response = await this.apiClient.post('/chat.postMessage', {
        channel: channelId,
        thread_ts: threadTs,
        text,
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data.ts;
    } catch (error) {
      console.error('[SLACK] Failed to send thread reply:', error);
      throw error;
    }
  }

  /**
   * Send rich blocks (Slack Block Kit)
   */
  async sendBlocks(channelId: string, blocks: any[]): Promise<string> {
    try {
      const response = await this.apiClient.post('/chat.postMessage', {
        channel: channelId,
        blocks,
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data.ts;
    } catch (error) {
      console.error('[SLACK] Failed to send blocks:', error);
      throw error;
    }
  }
}

export default SlackAdapter;
