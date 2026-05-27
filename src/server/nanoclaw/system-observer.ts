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

  private async tick() {
    try {
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

      // Calendar placeholder: emit 'calendar' event if upcoming meeting
      try {
        // TODO: integrate Google Calendar or local calendar adapters
        // For now, emit heartbeat
        this.emit('heartbeat', { ts: Date.now() });
      } catch (e) {
        // ignore
      }
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
