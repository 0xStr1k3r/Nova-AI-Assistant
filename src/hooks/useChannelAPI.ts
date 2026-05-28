/**
 * useChannelAPI Hook - Modular API client for channel operations
 * Provides: list channels, get status, send test messages
 */

import { useState, useCallback } from 'react';

export interface ChannelStatus {
  channelId: string;
  enabled: boolean;
  messagesSent: number;
  messagesReceived: number;
  lastActivity: number;
  status: 'connected' | 'disconnected' | 'error';
  errorMessage?: string;
}

export function useChannelAPI() {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/channels');
      if (!res.ok) throw new Error('Failed to fetch channels');
      const data = await res.json();
      setChannels(data.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const getChannel = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/channels/${channelId}`);
      if (!res.ok) throw new Error('Failed to fetch channel');
      return await res.json() as ChannelStatus;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const sendTestMessage = useCallback(async (channelId: string, message?: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message || 'Test message from Nova' }),
      });
      if (!res.ok) throw new Error('Failed to send test message');
      return await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const getChannelConfig = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/channels/${channelId}/config`);
      if (!res.ok) throw new Error('Failed to fetch channel config');
      return await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  return {
    channels,
    loading,
    error,
    fetchChannels,
    getChannel,
    sendTestMessage,
    getChannelConfig,
  };
}
