/**
 * useWebSocket Hook - Modular WebSocket connection management
 * Provides: real-time agent events, auto-reconnect, heartbeat
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface WSMessage {
  type: string;
  agentId?: string;
  timestamp: number;
  data?: Record<string, any>;
}

export function useWebSocket(agentId: string = 'default', enabled: boolean = true) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws/agent-events`;
      
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Subscribe to agent
        ws.send(JSON.stringify({
          type: 'subscribe',
          agentId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          setMessages(prev => [...prev, message].slice(-50)); // Keep last 50
        } catch (err) {
          console.error('[WS] Message parse error:', err);
        }
      };

      ws.onerror = () => {
        setError('WebSocket error');
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);

        // Auto-reconnect with backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts && enabled) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current++;
          setTimeout(connect, delay);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [agentId, enabled]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
      reconnectAttemptsRef.current = 0;
    }
  }, []);

  const send = useCallback((message: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      setError('WebSocket not connected');
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [enabled, agentId, connect, disconnect]);

  return {
    connected,
    messages,
    error,
    send,
    connect,
    disconnect,
  };
}
