/**
 * ChannelStatus Component - Display multi-channel status
 * Features: Channel list, connection status, test message button
 * Modular integration into existing UI
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useChannelAPI } from '../hooks/useChannelAPI';

interface ChannelStatusProps {
  compact?: boolean;
  onChannelSelect?: (channelId: string) => void;
}

export default function ChannelStatus({ compact = false, onChannelSelect }: ChannelStatusProps) {
  const { channels, loading, error, fetchChannels, sendTestMessage } = useChannelAPI();
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const handleTestMessage = async (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTestingId(channelId);
    await sendTestMessage(channelId);
    setTimeout(() => setTestingId(null), 2000);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '🟢';
      case 'disconnected': return '🔴';
      case 'error': return '⚠️';
      default: return '⚪';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Message Channels</h3>
        <span className="text-xs text-gray-500">
          {channels.filter(c => c.enabled).length}/{channels.length}
        </span>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950 px-2 py-1 rounded">
          {error}
        </div>
      )}

      <div className="grid gap-2">
        {loading ? (
          <p className="text-xs text-gray-500">Loading channels...</p>
        ) : channels.length === 0 ? (
          <p className="text-xs text-gray-500">No channels configured</p>
        ) : (
          channels.map((channel) => (
            <motion.div
              key={channel.channelId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors cursor-pointer"
              onClick={() => onChannelSelect?.(channel.channelId)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{statusIcon(channel.status)}</span>
                  <div>
                    <p className="text-xs font-medium text-white capitalize">
                      {channel.channelId}
                    </p>
                    <p className="text-xs text-gray-500">
                      {channel.status}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => handleTestMessage(channel.channelId, e)}
                  disabled={testingId === channel.channelId}
                  className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                >
                  {testingId === channel.channelId ? '✓' : 'Test'}
                </motion.button>
              </div>

              {!compact && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800 text-xs">
                  <div>
                    <p className="text-gray-500">Sent</p>
                    <p className="text-white font-medium">{channel.messagesSent}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Received</p>
                    <p className="text-white font-medium">{channel.messagesReceived}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
