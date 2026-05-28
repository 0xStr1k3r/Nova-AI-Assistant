/**
 * Generic Webhook Channel Adapter
 * Bridges any webhook-based channel into NanoClaw
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelAdapter, Message, MessageChannel } from '../types';

export class WebhookAdapter implements ChannelAdapter {
  id: MessageChannel;
  name: string;
  private apiClient: AxiosInstance;
  private webhookUrl: string;
  private agentGroupId: string;

  constructor(channelId: MessageChannel, webhookUrl: string, agentGroupId: string) {
    this.id = channelId;
    this.name = `${channelId.charAt(0).toUpperCase()}${channelId.slice(1)} Webhook`;
    this.webhookUrl = webhookUrl;
    this.agentGroupId = agentGroupId;
    this.apiClient = axios.create({ timeout: 10000 });
  }

  async sendMessage(userId: string, text: string, media?: string[]): Promise<string> {
    const payload = {
      channelId: this.id,
      userId,
      agentGroupId: this.agentGroupId,
      content: text,
      mediaUrls: media || [],
      timestamp: Date.now(),
    };

    await this.apiClient.post(this.webhookUrl, payload);
    return uuidv4();
  }

  async pollMessages(): Promise<Message[]> {
    return [];
  }

  async setupWebhook(url: string): Promise<void> {
    this.webhookUrl = url;
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      new URL(this.webhookUrl);
      return true;
    } catch {
      return false;
    }
  }
}

export default WebhookAdapter;
