/**
 * WhatsApp Cloud API Adapter
 * Sends outbound messages through the Meta WhatsApp Cloud API
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelAdapter, Message, MessageChannel } from '../types';

export class WhatsAppAdapter implements ChannelAdapter {
  id: MessageChannel = 'whatsapp';
  name = 'WhatsApp';
  private apiClient: AxiosInstance;
  private accessToken: string;
  private phoneNumberId: string;
  private agentGroupId: string;

  constructor(accessToken: string, phoneNumberId: string, agentGroupId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.agentGroupId = agentGroupId;

    this.apiClient = axios.create({
      baseURL: 'https://graph.facebook.com/v20.0',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  async sendMessage(userId: string, text: string): Promise<string> {
    await this.apiClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: userId,
      type: 'text',
      text: { body: text },
    });

    return uuidv4();
  }

  async pollMessages(): Promise<Message[]> {
    return [];
  }

  async setupWebhook(url: string): Promise<void> {
    console.log(`[WHATSAPP] Webhook should be registered in Meta console: ${url}`);
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      const response = await this.apiClient.get(`/${this.phoneNumberId}`, {
        params: {
          fields: 'display_phone_number,verified_name',
        },
      });
      return !!response.data?.display_phone_number || !!response.data?.verified_name;
    } catch (error) {
      console.error('[WHATSAPP] Credential verification failed:', error);
      return false;
    }
  }
}

export default WhatsAppAdapter;
