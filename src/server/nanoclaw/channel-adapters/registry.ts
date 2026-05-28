/**
 * Channel Adapter Registry
 * Centralized management of all channel adapters
 * ~98 LOC: Initialize, retrieve, route to adapters
 */

import type { MessageChannel, ChannelAdapter } from '../types';
import TelegramAdapter from './telegram';
import DiscordAdapter from './discord';
import SlackAdapter from './slack';
import WhatsAppAdapter from './whatsapp';
import WebhookAdapter from './webhook';

interface AdapterConfig {
  channel: MessageChannel;
  enabled: boolean;
  config: {
    botToken?: string;
    verificationToken?: string;
    agentGroupId: string;
    pollIntervalMs?: number;
  };
}

class ChannelAdapterRegistry {
  private adapters: Map<MessageChannel, ChannelAdapter> = new Map();
  private configs: Map<MessageChannel, AdapterConfig> = new Map();

  /**
   * Register a channel adapter
   */
  registerAdapter(adapter: ChannelAdapter, config: AdapterConfig): void {
    if (config.enabled) {
      this.adapters.set(adapter.id, adapter);
      this.configs.set(adapter.id, config);
      console.log(`[ADAPTER-REGISTRY] ✅ Registered ${adapter.name} adapter`);
    }
  }

  /**
   * Initialize default adapters from environment
   */
  async initializeFromEnv(agentGroupId: string): Promise<void> {
    // Telegram
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    if (tgToken) {
      const telegramAdapter = new TelegramAdapter(tgToken, agentGroupId, 2000);
      const isValid = await telegramAdapter.verifyCredentials();
      if (isValid) {
        this.registerAdapter(telegramAdapter, {
          channel: 'telegram',
          enabled: true,
          config: { botToken: tgToken, agentGroupId },
        });
      }
    }

    // Discord
    const discordToken = process.env.DISCORD_BOT_TOKEN;
    if (discordToken) {
      const discordAdapter = new DiscordAdapter(discordToken, agentGroupId);
      const isValid = await discordAdapter.verifyCredentials();
      if (isValid) {
        this.registerAdapter(discordAdapter, {
          channel: 'discord',
          enabled: true,
          config: { botToken: discordToken, agentGroupId },
        });
      }
    }

    // WhatsApp Cloud API
    const whatsappEnabled = process.env.WHATSAPP_ENABLED !== 'false';
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (whatsappEnabled && whatsappToken && whatsappPhoneNumberId) {
      const whatsappAdapter = new WhatsAppAdapter(whatsappToken, whatsappPhoneNumberId, agentGroupId);
      const isValid = await whatsappAdapter.verifyCredentials();
      if (isValid) {
        this.registerAdapter(whatsappAdapter, {
          channel: 'whatsapp',
          enabled: true,
          config: { agentGroupId },
        });
      }
    }

    // Slack
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const slackVerification = process.env.SLACK_VERIFICATION_TOKEN;
    if (slackToken && slackVerification) {
      const slackAdapter = new SlackAdapter(slackToken, slackVerification, agentGroupId);
      const isValid = await slackAdapter.verifyCredentials();
      if (isValid) {
        this.registerAdapter(slackAdapter, {
          channel: 'slack',
          enabled: true,
          config: {
            botToken: slackToken,
            verificationToken: slackVerification,
            agentGroupId,
          },
        });
      }
    }

    const webhookChannelMap: Array<{ channel: MessageChannel; envKey: string }> = [
      { channel: 'teams', envKey: 'TEAMS_WEBHOOK_URL' },
      { channel: 'imessage', envKey: 'IMESSAGE_WEBHOOK_URL' },
      { channel: 'matrix', envKey: 'MATRIX_WEBHOOK_URL' },
      { channel: 'signal', envKey: 'SIGNAL_WEBHOOK_URL' },
      { channel: 'viber', envKey: 'VIBER_WEBHOOK_URL' },
      { channel: 'sms', envKey: 'SMS_WEBHOOK_URL' },
      { channel: 'email', envKey: 'EMAIL_WEBHOOK_URL' },
      { channel: 'web', envKey: 'WEB_WEBHOOK_URL' },
    ];

    for (const { channel, envKey } of webhookChannelMap) {
      const webhookUrl = process.env[envKey];
      if (!webhookUrl) continue;
      const adapter = new WebhookAdapter(channel, webhookUrl, agentGroupId);
      const isValid = await adapter.verifyCredentials();
      if (isValid) {
        this.registerAdapter(adapter, {
          channel,
          enabled: true,
          config: { agentGroupId },
        });
      }
    }

    console.log(
      `[ADAPTER-REGISTRY] Initialized ${this.adapters.size} channel adapters`
    );
  }

  /**
   * Get adapter by channel ID
   */
  getAdapter(channelId: MessageChannel): ChannelAdapter | undefined {
    return this.adapters.get(channelId);
  }

  /**
   * Get all enabled adapters
   */
  getAllAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get enabled channel IDs
   */
  getEnabledChannels(): MessageChannel[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get adapter config
   */
  getConfig(channelId: MessageChannel): AdapterConfig | undefined {
    return this.configs.get(channelId);
  }

  /**
   * Check if channel is enabled
   */
  isChannelEnabled(channelId: MessageChannel): boolean {
    return this.adapters.has(channelId);
  }

  /**
   * Get adapter statistics
   */
  getStats(): {
    total: number;
    enabled: string[];
    disabled: MessageChannel[];
  } {
    const allChannels: MessageChannel[] = [
      'telegram',
      'discord',
      'slack',
      'whatsapp',
      'teams',
      'imessage',
      'matrix',
      'signal',
      'viber',
      'sms',
      'email',
      'web',
    ];

    const enabled = this.getEnabledChannels();
    const disabled = allChannels.filter((ch) => !enabled.includes(ch));

    return {
      total: enabled.length,
      enabled: enabled as string[],
      disabled: disabled as MessageChannel[],
    };
  }
}

let registryInstance: ChannelAdapterRegistry | null = null;

export function getAdapterRegistry(): ChannelAdapterRegistry {
  if (!registryInstance) {
    registryInstance = new ChannelAdapterRegistry();
  }
  return registryInstance;
}

export function createNewRegistry(): ChannelAdapterRegistry {
  return new ChannelAdapterRegistry();
}

export default ChannelAdapterRegistry;
