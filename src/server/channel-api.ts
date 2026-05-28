/**
 * Channel Management API - Modular endpoints for channel status & control
 * Exports: Route handlers for channel operations
 */

import type { Request, Response } from 'express';
import { getAdapterRegistry } from './nanoclaw/channel-adapters/registry';
import type { MessageChannel } from './nanoclaw/types';

// ============ Type Definitions ============

export interface ChannelStatusInfo {
  channelId: MessageChannel;
  enabled: boolean;
  messagesSent: number;
  messagesReceived: number;
  lastActivity: number;
  status: 'connected' | 'disconnected' | 'error';
  errorMessage?: string;
}

export interface ChannelListResponse {
  channels: ChannelStatusInfo[];
  totalEnabled: number;
  totalDisabled: number;
}

// ============ Helper Functions ============

function getChannelStatus(channelId: MessageChannel): ChannelStatusInfo {
  const registry = getAdapterRegistry();
  const adapter = registry.getAdapter(channelId);

  return {
    channelId,
    enabled: !!adapter,
    messagesSent: 0, // TODO: track in router
    messagesReceived: 0, // TODO: track in router
    lastActivity: Date.now(),
    status: adapter ? 'connected' : 'disconnected',
  };
}

// ============ Route Handlers ============

export const listChannels = async (req: Request, res: Response) => {
  try {
    const registry = getAdapterRegistry();
    const stats = registry.getStats();

    const allChannels: MessageChannel[] = ['telegram', 'discord', 'slack', 'whatsapp', 'email'];
    const channels = allChannels.map(id => getChannelStatus(id as MessageChannel));

    res.json({
      channels,
      totalEnabled: stats.enabled.length,
      totalDisabled: allChannels.length - stats.enabled.length,
    } as ChannelListResponse);
  } catch (err) {
    console.error('[CHANNEL-API] listChannels failed:', err);
    res.status(500).json({ error: 'Failed to list channels' });
  }
};

export const getChannel = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const status = getChannelStatus(channelId as MessageChannel);
    res.json(status);
  } catch (err) {
    console.error('[CHANNEL-API] getChannel failed:', err);
    res.status(500).json({ error: 'Failed to get channel' });
  }
};

export const sendTestMessage = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { message = 'Test message from Nova' } = req.body;

    const registry = getAdapterRegistry();
    const adapter = registry.getAdapter(channelId as MessageChannel);

    if (!adapter) {
      return res.status(404).json({ error: `Channel ${channelId} not configured` });
    }

    // Send test message via adapter
    await adapter.sendMessage('admin', message);

    res.json({
      success: true,
      channel: channelId,
      message: `Test message sent to ${channelId}`,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[CHANNEL-API] sendTestMessage failed:', err);
    res.status(500).json({ error: 'Failed to send test message' });
  }
};

export const getChannelConfig = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    // Return config from environment
    const config = {
      channelId,
      configured: !!process.env[`${channelId.toUpperCase()}_TOKEN`],
      envVars: [
        `${channelId.toUpperCase()}_TOKEN`,
        `${channelId.toUpperCase()}_WEBHOOK_URL`,
      ],
    };

    res.json(config);
  } catch (err) {
    console.error('[CHANNEL-API] getChannelConfig failed:', err);
    res.status(500).json({ error: 'Failed to get channel config' });
  }
};

// ============ Export Router Setup Function ============

export function setupChannelAPI(app: any): void {
  app.get('/api/channels', listChannels);
  app.get('/api/channels/:channelId', getChannel);
  app.post('/api/channels/:channelId/test', sendTestMessage);
  app.get('/api/channels/:channelId/config', getChannelConfig);
  console.log('[CHANNEL-API] Routes registered');
}
