/**
 * useObserverAPI Hook - Modular API client for system observer
 * Provides: observer state, events, start/stop
 */

import { useState, useCallback, useEffect } from 'react';

export interface ObserverEvent {
  type: 'calendarEvent' | 'unreadEmail' | 'activeWindow' | 'systemLoad' | 'heartbeat';
  timestamp: number;
  data: Record<string, any>;
}

export interface ObserverState {
  observerId: string;
  isRunning: boolean;
  pollIntervalMs: number;
  lastTick: number;
  eventCount: number;
  recentEvents: ObserverEvent[];
}

export function useObserverAPI() {
  const [state, setState] = useState<ObserverState | null>(null);
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/observer/state');
      if (!res.ok) throw new Error('Failed to fetch observer state');
      const data = await res.json();
      setState(data);
      setEvents(data.recentEvents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async (limit: number = 50, type?: string) => {
    setError(null);
    try {
      const url = new URL('/api/observer/events', window.location.origin);
      url.searchParams.append('limit', limit.toString());
      if (type) url.searchParams.append('type', type);

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const startObserver = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/observer/start', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start observer');
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [fetchState]);

  const stopObserver = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/observer/stop', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to stop observer');
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [fetchState]);

  const clearEvents = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/observer/events/clear', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to clear events');
      setEvents([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  // Auto-fetch state on mount
  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchState]);

  return {
    state,
    events,
    loading,
    error,
    fetchState,
    fetchEvents,
    startObserver,
    stopObserver,
    clearEvents,
  };
}
