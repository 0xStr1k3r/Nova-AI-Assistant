/**
 * Task Scheduler - lightweight cron-like scheduler for recurring tasks
 * Stores tasks in workspace as JSON, polls and executes on schedule
 * ~220 LOC: Parse cron expressions, execute tasks, delivery routing
 */

import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from './workspace-manager';
import { EventEmitter } from 'events';

export interface ScheduledTask {
  id: string;
  name: string;
  cron: string; // "0 8 * * *" = 8am daily
  agentGroupId: string;
  channels: string[]; // which channels to deliver to
  action: {
    type: 'send_message' | 'run_connector';
    message?: string;
    connector?: { app: string; command: string; args: Record<string, any> };
  };
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
}

/**
 * Parse simple cron and return next execution time (ms)
 * Very basic: supports "0 8 * * *" (hour minute day month day_of_week)
 */
function parseNextCronRun(cronExpr: string, fromTime: number = Date.now()): number {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.warn('[SCHEDULER] Invalid cron:', cronExpr);
    return fromTime + 60_000; // Default: 1 min
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map(p => p === '*' ? -1 : parseInt(p));
  const now = new Date(fromTime);

  // Simple logic: if hour/minute specified, find next matching time today or tomorrow
  if (hour !== -1 && minute !== -1) {
    const next = new Date(fromTime);
    next.setHours(hour, minute, 0, 0);

    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  // Fallback: every hour
  const next = new Date(fromTime);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next.getTime();
}

class TaskScheduler extends EventEmitter {
  private agentGroupId: string;
  private tasks: Map<string, ScheduledTask> = new Map();
  private pollIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private running: boolean = false;

  constructor(agentGroupId: string, pollIntervalMs: number = 60_000) {
    super();
    this.agentGroupId = agentGroupId;
    this.pollIntervalMs = pollIntervalMs;
  }

  async loadTasks(): Promise<void> {
    try {
      const wsPath = getWorkspacePath(this.agentGroupId);
      const tasksFile = path.join(wsPath, 'scheduled-tasks.json');
      const exists = await fs.stat(tasksFile).then(() => true).catch(() => false);

      if (!exists) {
        console.log('[SCHEDULER] No tasks file; creating empty');
        await fs.writeFile(tasksFile, JSON.stringify([], null, 2));
        return;
      }

      const raw = await fs.readFile(tasksFile, 'utf8');
      const tasks: ScheduledTask[] = JSON.parse(raw || '[]');

      for (const task of tasks) {
        this.tasks.set(task.id, task);
      }

      console.log(`[SCHEDULER] Loaded ${tasks.length} tasks for ${this.agentGroupId}`);
    } catch (err) {
      console.warn('[SCHEDULER] loadTasks failed:', err);
    }
  }

  async saveTasks(): Promise<void> {
    try {
      const wsPath = getWorkspacePath(this.agentGroupId);
      const tasksFile = path.join(wsPath, 'scheduled-tasks.json');
      const tasks = Array.from(this.tasks.values());
      await fs.writeFile(tasksFile, JSON.stringify(tasks, null, 2));
    } catch (err) {
      console.warn('[SCHEDULER] saveTasks failed:', err);
    }
  }

  async createTask(task: ScheduledTask): Promise<void> {
    task.id = task.id || `task-${Date.now()}`;
    task.createdAt = task.createdAt || Date.now();
    task.nextRun = parseNextCronRun(task.cron);
    this.tasks.set(task.id, task);
    await this.saveTasks();
    console.log(`[SCHEDULER] Created task: ${task.id}`);
  }

  async deleteTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
    await this.saveTasks();
    console.log(`[SCHEDULER] Deleted task: ${taskId}`);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    console.log('[SCHEDULER] Started task scheduler');
    this.tick(); // First check immediately
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    console.log('[SCHEDULER] Stopped task scheduler');
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    for (const [taskId, task] of this.tasks.entries()) {
      if (!task.enabled) continue;
      if (!task.nextRun || task.nextRun > now) continue;

      try {
        console.log(`[SCHEDULER] Executing task: ${taskId} (${task.name})`);

        // Emit task event for orchestrator to handle
        this.emit('executeTask', task);

        // Update next run
        task.lastRun = now;
        task.nextRun = parseNextCronRun(task.cron, now);
        await this.saveTasks();

        console.log(`[SCHEDULER] ✅ Task executed: ${taskId}, next run at ${new Date(task.nextRun).toISOString()}`);
      } catch (err) {
        console.error(`[SCHEDULER] Task failed: ${taskId}`, err);
      }
    }
  }

  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }
}

let schedulerInstance: TaskScheduler | null = null;

export function getTaskScheduler(agentGroupId: string = process.env.AGENT_GROUP_ID || 'default'): TaskScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler(agentGroupId);
  }
  return schedulerInstance;
}

export default TaskScheduler;
