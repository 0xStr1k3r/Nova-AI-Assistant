import { EventEmitter } from 'events';

interface ObserverOptions {
  pollIntervalMs?: number;
  checkCalendar?: boolean;
  checkEmail?: boolean;
  checkWindows?: boolean;
}

class SystemObserver extends EventEmitter {
  private pollIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private running: boolean = false;
  private lastTickAt: number = 0;
  private dedupeCache = new Map<string, number>();

  constructor(opts: ObserverOptions = {}) {
    super();
    this.pollIntervalMs = opts.pollIntervalMs || 30_000; // 30s
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    console.log('[OBSERVER] Started system observer');
    // First tick
    this.tick();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    console.log('[OBSERVER] Stopped system observer');
  }

  getState() {
    return {
      running: this.running,
      pollIntervalMs: this.pollIntervalMs,
      lastTickAt: this.lastTickAt,
    };
  }

  private shouldEmit(key: string, windowMs: number = 60_000): boolean {
    const now = Date.now();
    const prev = this.dedupeCache.get(key) || 0;
    if (now - prev < windowMs) return false;
    this.dedupeCache.set(key, now);
    return true;
  }

  private async tick() {
    try {
      this.lastTickAt = Date.now();
      // Active window (if desktop-mapper exists)
      try {
        const dm = await import('../../desktop-mapper');
        if (dm && typeof dm.getActiveWindow === 'function') {
          const active = await dm.getActiveWindow();
          this.emit('activeWindow', active);
        }
      } catch (e) {
        // desktop-mapper not available; skip
      }

      // Calendar adapter: poll workspace calendar.json and emit upcoming
      try {
        const CalendarAdapter = (await import('./adapters/calendar')).default;
        const cal = new CalendarAdapter(process.env.AGENT_GROUP_ID || 'default', 60_000);
        cal.on('upcoming', (ev: any) => {
          const key = `calendar:${ev?.id || ev?.title || JSON.stringify(ev)}`;
          if (this.shouldEmit(key, 90_000)) this.emit('calendarEvent', ev);
        });
        // run one-off poll to surface events quickly
        await cal.pollOnce();
      } catch (e) {
        console.warn('[OBSERVER] Calendar adapter not available:', e.message || e);
      }

      // Email adapter: poll workspace inbox.json and emit unread
      try {
        const EmailAdapter = (await import('./adapters/email')).default;
        const mail = new EmailAdapter(process.env.AGENT_GROUP_ID || 'default', 60_000);
        mail.on('unread', (m: any) => {
          const key = `email:${m?.id || m?.subject || JSON.stringify(m)}`;
          if (this.shouldEmit(key, 90_000)) this.emit('unreadEmail', m);
        });
        await mail.pollOnce();
      } catch (e) {
        console.warn('[OBSERVER] Email adapter not available:', e.message || e);
      }

      // Heartbeat emit
      this.emit('heartbeat', { ts: Date.now() });
    } catch (err) {
      console.error('[OBSERVER] Tick failed:', err);
    }
  }
}

let observer: SystemObserver | null = null;

export function getSystemObserver(): SystemObserver {
  if (!observer) observer = new SystemObserver();
  return observer;
}

export default SystemObserver;
