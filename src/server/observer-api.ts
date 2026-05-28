/**
 * Observer API - Modular endpoints for system observer events
 * Exports: Route handlers for getting observer state and events
 */

import type { Request, Response } from 'express';
import { getSystemObserver } from './nanoclaw/system-observer';

// ============ Type Definitions ============

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

// ============ Event Buffer (in-memory) ============

class EventBuffer {
  private events: ObserverEvent[] = [];
  private maxSize: number = 100;

  push(event: ObserverEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
  }

  getRecent(count: number = 20): ObserverEvent[] {
    return this.events.slice(-count);
  }

  getAll(): ObserverEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  size(): number {
    return this.events.length;
  }
}

const eventBuffer = new EventBuffer();

// Wire observer events to buffer
try {
  const observer = getSystemObserver();
  observer.on('calendarEvent', (data) => {
    eventBuffer.push({
      type: 'calendarEvent',
      timestamp: Date.now(),
      data,
    });
  });

  observer.on('unreadEmail', (data) => {
    eventBuffer.push({
      type: 'unreadEmail',
      timestamp: Date.now(),
      data,
    });
  });

  observer.on('heartbeat', (data) => {
    eventBuffer.push({
      type: 'heartbeat',
      timestamp: Date.now(),
      data,
    });
  });
} catch (err) {
  console.warn('[OBSERVER-API] Failed to wire events:', err);
}

// ============ Route Handlers ============

export const getObserverState = async (req: Request, res: Response) => {
  try {
    const observer = getSystemObserver();

    const state: ObserverState = {
      observerId: 'system-observer-1',
      isRunning: observer['running'],
      pollIntervalMs: observer['pollIntervalMs'] || 30000,
      lastTick: Date.now(),
      eventCount: eventBuffer.size(),
      recentEvents: eventBuffer.getRecent(10),
    };

    res.json(state);
  } catch (err) {
    console.error('[OBSERVER-API] getObserverState failed:', err);
    res.status(500).json({ error: 'Failed to get observer state' });
  }
};

export const getObserverEvents = async (req: Request, res: Response) => {
  try {
    const { limit = 50, type } = req.query;

    let events = eventBuffer.getRecent(parseInt(limit as string) || 50);

    if (type) {
      events = events.filter(e => e.type === type);
    }

    res.json({
      events,
      totalCount: eventBuffer.size(),
      filteredCount: events.length,
    });
  } catch (err) {
    console.error('[OBSERVER-API] getObserverEvents failed:', err);
    res.status(500).json({ error: 'Failed to get events' });
  }
};

export const startObserver = async (req: Request, res: Response) => {
  try {
    const observer = getSystemObserver();
    observer.start();

    res.json({
      success: true,
      message: 'Observer started',
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[OBSERVER-API] startObserver failed:', err);
    res.status(500).json({ error: 'Failed to start observer' });
  }
};

export const stopObserver = async (req: Request, res: Response) => {
  try {
    const observer = getSystemObserver();
    observer.stop();

    res.json({
      success: true,
      message: 'Observer stopped',
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[OBSERVER-API] stopObserver failed:', err);
    res.status(500).json({ error: 'Failed to stop observer' });
  }
};

export const clearEvents = async (req: Request, res: Response) => {
  try {
    const clearedCount = eventBuffer.size();
    eventBuffer.clear();

    res.json({
      success: true,
      clearedCount,
      message: `Cleared ${clearedCount} events`,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[OBSERVER-API] clearEvents failed:', err);
    res.status(500).json({ error: 'Failed to clear events' });
  }
};

// ============ Export Router Setup Function ============

export function setupObserverAPI(app: any): void {
  app.get('/api/observer/state', getObserverState);
  app.get('/api/observer/events', getObserverEvents);
  app.post('/api/observer/start', startObserver);
  app.post('/api/observer/stop', stopObserver);
  app.post('/api/observer/events/clear', clearEvents);
  console.log('[OBSERVER-API] Routes registered');
}

// ============ Export event buffer for WebSocket ============
export { eventBuffer };
