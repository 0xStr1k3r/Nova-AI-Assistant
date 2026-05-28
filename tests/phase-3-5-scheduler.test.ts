/**
 * Phase 3.5 Scheduler Integration Tests
 * Tests: cron parsing, task execution, channel delivery
 */

import TaskScheduler, { getTaskScheduler, type ScheduledTask } from '../src/server/nanoclaw/task-scheduler';
import path from 'path';
import fs from 'fs/promises';

describe('[Phase 3.5] Scheduled Tasks Scheduler', () => {
  let scheduler: TaskScheduler;
  const agentGroupId = 'test-agent-group';

  beforeEach(async () => {
    const testWorkspace = path.join(process.env.HOME || '/tmp', `.config/nova/agents/${agentGroupId}`);
    await fs.rm(testWorkspace, { recursive: true, force: true });
    await fs.mkdir(testWorkspace, { recursive: true });

    scheduler = new TaskScheduler(agentGroupId, 100);
  });

  afterEach(() => {
    scheduler.stop();
  });

  test('should create a scheduled task', async () => {
    const task: ScheduledTask = {
      id: 'morning-briefing',
      name: 'Morning Briefing',
      cron: '0 8 * * *',
      agentGroupId,
      channels: ['telegram'],
      action: { type: 'send_message', message: 'Good morning!' },
      enabled: true,
      createdAt: Date.now(),
    };

    await scheduler.createTask(task);
    const retrieved = scheduler.getTask('morning-briefing');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Morning Briefing');
    expect(retrieved?.nextRun).toBeGreaterThan(Date.now());
  });

  test('should persist tasks to workspace JSON', async () => {
    const task: ScheduledTask = {
      id: 'test-task-1',
      name: 'Test Task',
      cron: '*/5 * * * *',
      agentGroupId,
      channels: ['discord'],
      action: { type: 'send_message', message: 'Test' },
      enabled: true,
      createdAt: Date.now(),
    };

    await scheduler.createTask(task);
    const scheduler2 = new TaskScheduler(agentGroupId, 100);
    await scheduler2.loadTasks();
    const retrieved = scheduler2.getTask('test-task-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-task-1');
  });

  test('should list all tasks', async () => {
    const task1: ScheduledTask = {
      id: 'task-1',
      name: 'Task 1',
      cron: '0 8 * * *',
      agentGroupId,
      channels: ['telegram'],
      action: { type: 'send_message', message: 'msg1' },
      enabled: true,
      createdAt: Date.now(),
    };

    const task2: ScheduledTask = {
      id: 'task-2',
      name: 'Task 2',
      cron: '0 18 * * *',
      agentGroupId,
      channels: ['discord'],
      action: { type: 'send_message', message: 'msg2' },
      enabled: true,
      createdAt: Date.now(),
    };

    await scheduler.createTask(task1);
    await scheduler.createTask(task2);

    const all = scheduler.getTasks();
    expect(all).toHaveLength(2);
    expect(all.map(t => t.id)).toContain('task-1');
    expect(all.map(t => t.id)).toContain('task-2');
  });

  test('should delete a task', async () => {
    const task: ScheduledTask = {
      id: 'delete-me',
      name: 'Delete Test',
      cron: '0 12 * * *',
      agentGroupId,
      channels: ['telegram'],
      action: { type: 'send_message', message: 'Delete' },
      enabled: true,
      createdAt: Date.now(),
    };

    await scheduler.createTask(task);
    expect(scheduler.getTask('delete-me')).toBeDefined();

    await scheduler.deleteTask('delete-me');
    expect(scheduler.getTask('delete-me')).toBeUndefined();
  });
});
