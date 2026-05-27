/**
 * Telegram Channel Adapter
 * Bridges Telegram Bot API to Nova agent
 * ~142 LOC: Inbound webhook, polling, outbound delivery
 */

import axios, { AxiosInstance } from 'axios';
import type { Message, MessageChannel, ChannelAdapter } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
    };
    date: number;
    text?: string;
    photo?: Array<{ file_id: string }>;
    document?: { file_id: string };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    message: {
      message_id: number;
      chat: { id: number };
    };
    data: string;
  };
}

export class TelegramAdapter implements ChannelAdapter {
  id: MessageChannel = 'telegram';
  name = 'Telegram';
  private apiClient: AxiosInstance;
  private botToken: string;
  private lastUpdateId: number = 0;
  private agentGroupId: string;
  private pollIntervalMs: number = 2000;

  constructor(botToken: string, agentGroupId: string, pollIntervalMs?: number) {
    this.botToken = botToken;
    this.agentGroupId = agentGroupId;
    if (pollIntervalMs) this.pollIntervalMs = pollIntervalMs;

    this.apiClient = axios.create({
      baseURL: `https://api.telegram.org/bot${botToken}`,
      timeout: 10000,
    });
  }

  /**
   * Send message to Telegram user
   */
  async sendMessage(userId: string, text: string, media?: string[]): Promise<string> {
    try {
      const response = await this.apiClient.post('/sendMessage', {
        chat_id: userId,
        text: text,
        parse_mode: 'HTML',
      });

      return response.data.result.message_id;
    } catch (error) {
      console.error(`[TELEGRAM] Failed to send message to ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Poll Telegram for new messages
   */
  async pollMessages(): Promise<Message[]> {
    try {
      const response = await this.apiClient.post('/getUpdates', {
        offset: this.lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });

      const messages: Message[] = [];
      const updates: TelegramUpdate[] = response.data.result || [];

      for (const update of updates) {
        this.lastUpdateId = update.update_id;

        if (update.message?.text) {
          messages.push({
            id: uuidv4(),
            channelId: this.id,
            userId: String(update.message.from.id),
            conversationId: `tg-${update.message.chat.id}`,
            agentGroupId: this.agentGroupId,
            content: update.message.text,
            timestamp: update.message.date * 1000,
            metadata: {
              telegramMessageId: update.message.message_id,
              telegramUserId: update.message.from.id,
              telegramUsername: update.message.from.username || '',
              firstName: update.message.from.first_name,
              chatType: update.message.chat.type,
            },
          });
        }

        if (update.message?.photo) {
          const photoFileId = update.message.photo[0].file_id;
          const fileUrl = await this.getFileUrl(photoFileId);
          messages.push({
            id: uuidv4(),
            channelId: this.id,
            userId: String(update.message.from.id),
            conversationId: `tg-${update.message.chat.id}`,
            agentGroupId: this.agentGroupId,
            content: update.message.text || '[Photo]',
            mediaUrls: [fileUrl],
            timestamp: update.message.date * 1000,
            metadata: {
              mediaType: 'photo',
              telegramMessageId: update.message.message_id,
              telegramUserId: update.message.from.id,
            },
          });
        }

        // Acknowledge callback queries
        if (update.callback_query) {
          await this.apiClient.post('/answerCallbackQuery', {
            callback_query_id: update.callback_query.id,
          });
        }
      }

      return messages;
    } catch (error) {
      console.error('[TELEGRAM] Polling error:', error);
      return [];
    }
  }

  /**
   * Setup webhook for real-time updates
   */
  async setupWebhook(url: string): Promise<void> {
    try {
      await this.apiClient.post('/setWebhook', {
        url: url,
        max_connections: 40,
      });
      console.log(`[TELEGRAM] Webhook set to ${url}`);
    } catch (error) {
      console.error('[TELEGRAM] Failed to set webhook:', error);
      throw error;
    }
  }

  /**
   * Verify bot credentials are valid
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      const response = await this.apiClient.post('/getMe');
      if (response.data.ok && response.data.result) {
        console.log(`[TELEGRAM] ✅ Bot verified: @${response.data.result.username}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[TELEGRAM] Credential verification failed:', error);
      return false;
    }
  }

  /**
   * Send inline buttons (for interactive responses)
   */
  async sendWithButtons(
    userId: string,
    text: string,
    buttons: Array<{ label: string; action: string }>
  ): Promise<string> {
    try {
      const keyboardMarkup = {
        inline_keyboard: buttons.map((btn) => [
          {
            text: btn.label,
            callback_data: btn.action,
          },
        ]),
      };

      const response = await this.apiClient.post('/sendMessage', {
        chat_id: userId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboardMarkup,
      });

      return response.data.result.message_id;
    } catch (error) {
      console.error(`[TELEGRAM] Failed to send buttons to ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Edit existing message
   */
  async editMessage(
    userId: string,
    messageId: string,
    newText: string
  ): Promise<void> {
    try {
      await this.apiClient.post('/editMessageText', {
        chat_id: userId,
        message_id: messageId,
        text: newText,
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error('[TELEGRAM] Failed to edit message:', error);
      throw error;
    }
  }

  // ============ Private Helpers ============

  private async getFileUrl(fileId: string): Promise<string> {
    try {
      const response = await this.apiClient.post('/getFile', {
        file_id: fileId,
      });
      if (response.data.ok) {
        return `https://api.telegram.org/file/bot${this.botToken}/${response.data.result.file_path}`;
      }
    } catch (error) {
      console.error('[TELEGRAM] Failed to get file URL:', error);
    }
    return '';
  }
}

export default TelegramAdapter;
