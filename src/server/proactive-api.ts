/**
 * Proactive Notification API - lightweight event-derived notifications
 */

import type { Request, Response } from 'express';
import { getSystemObserver } from './nanoclaw/system-observer';

type NotificationLevel = 'info' | 'warning' | 'urgent';

export interface ProactiveNotification {
  id: string;
  source: 'calendar' | 'email' | 'system';
  level: NotificationLevel;
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

interface NotificationSettings {
  enabled: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number; // 0-23
  maxQueue: number;
}

const settings: NotificationSettings = {
  enabled: true,
  quietHoursStart: 23,
  quietHoursEnd: 7,
  maxQueue: 120,
};

const notifications: ProactiveNotification[] = [];
const dedupeWindowMs = 120_000;
const seen = new Map<string, number>();

function isQuietHours(now = new Date()): boolean {
  const hour = now.getHours();
  if (settings.quietHoursStart < settings.quietHoursEnd) {
    return hour >= settings.quietHoursStart && hour < settings.quietHoursEnd;
  }
  return hour >= settings.quietHoursStart || hour < settings.quietHoursEnd;
}

function enqueueNotification(next: Omit<ProactiveNotification, 'id' | 'timestamp' | 'acknowledged'>) {
  if (!settings.enabled || isQuietHours()) return;
  const key = `${next.source}:${next.title}:${next.message}`;
  const now = Date.now();
  const last = seen.get(key) || 0;
  if (now - last < dedupeWindowMs) return;
  seen.set(key, now);

  notifications.push({
    id: `n_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    acknowledged: false,
    ...next,
  });

  if (notifications.length > settings.maxQueue) {
    notifications.splice(0, notifications.length - settings.maxQueue);
  }
}

try {
  const observer = getSystemObserver();
  observer.on('calendarEvent', (ev: any) => {
    const title = ev?.title || 'Upcoming calendar event';
    const at = ev?.startTime ? ` at ${new Date(ev.startTime).toLocaleTimeString()}` : '';
    enqueueNotification({
      source: 'calendar',
      level: 'info',
      title: 'Calendar reminder',
      message: `${title}${at}`,
    });
  });

  observer.on('unreadEmail', (mail: any) => {
    const from = mail?.from || 'Unknown sender';
    const subject = mail?.subject || 'New unread email';
    enqueueNotification({
      source: 'email',
      level: 'warning',
      title: 'Unread email',
      message: `${from}: ${subject}`,
    });
  });
} catch (err) {
  console.warn('[PROACTIVE-API] Failed to bind observer listeners:', err);
}

export const listNotifications = async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const onlyUnacked = req.query.unacked === 'true';
  let items = [...notifications].reverse();
  if (onlyUnacked) items = items.filter((n) => !n.acknowledged);
  res.json({
    notifications: items.slice(0, limit),
    unacked: notifications.filter((n) => !n.acknowledged).length,
    settings,
  });
};

export const acknowledgeNotification = async (req: Request, res: Response) => {
  const { id } = req.params;
  const target = notifications.find((n) => n.id === id);
  if (!target) return res.status(404).json({ error: 'Notification not found' });
  target.acknowledged = true;
  res.json({ success: true, id });
};

export const updateNotificationSettings = async (req: Request, res: Response) => {
  const incoming = req.body || {};
  if (typeof incoming.enabled === 'boolean') settings.enabled = incoming.enabled;
  if (Number.isInteger(incoming.quietHoursStart)) settings.quietHoursStart = Math.max(0, Math.min(23, incoming.quietHoursStart));
  if (Number.isInteger(incoming.quietHoursEnd)) settings.quietHoursEnd = Math.max(0, Math.min(23, incoming.quietHoursEnd));
  if (Number.isInteger(incoming.maxQueue)) settings.maxQueue = Math.max(20, Math.min(500, incoming.maxQueue));
  res.json({ success: true, settings });
};

export function setupProactiveAPI(app: any): void {
  app.get('/api/notifications', listNotifications);
  app.post('/api/notifications/:id/ack', acknowledgeNotification);
  app.post('/api/notifications/settings', updateNotificationSettings);
  console.log('[PROACTIVE-API] Routes registered');
}

