/**
 * Task Management API - Modular CRUD endpoints for scheduled tasks
 * Exports: Route handlers for task operations
 */

import type { Request, Response } from 'express';
import { getTaskScheduler, type ScheduledTask } from './nanoclaw/task-scheduler';

// ============ Type Definitions ============

export interface TaskCreateRequest {
  id?: string;
  name: string;
  cron: string;
  channels: string[];
  action: {
    type: 'send_message' | 'run_connector';
    message?: string;
    connector?: { app: string; command: string; args: Record<string, any> };
  };
  enabled?: boolean;
}

export interface TaskUpdateRequest {
  name?: string;
  cron?: string;
  channels?: string[];
  action?: TaskCreateRequest['action'];
  enabled?: boolean;
}

// ============ Route Handlers ============

export const listTasks = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const scheduler = getTaskScheduler(agentId);
    await scheduler.loadTasks();

    const tasks = scheduler.getTasks();
    res.json({
      agentId,
      tasks,
      totalTasks: tasks.length,
      enabledCount: tasks.filter(t => t.enabled).length,
      disabledCount: tasks.filter(t => !t.enabled).length,
    });
  } catch (err) {
    console.error('[TASK-API] listTasks failed:', err);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
};

export const getTask = async (req: Request, res: Response) => {
  try {
    const { agentId, taskId } = req.params;
    const scheduler = getTaskScheduler(agentId);
    await scheduler.loadTasks();

    const task = scheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (err) {
    console.error('[TASK-API] getTask failed:', err);
    res.status(500).json({ error: 'Failed to get task' });
  }
};

export const createTask = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const body = req.body as TaskCreateRequest;

    const scheduler = getTaskScheduler(agentId);
    await scheduler.loadTasks();

    const task: ScheduledTask = {
      id: body.id || `task-${Date.now()}`,
      name: body.name,
      cron: body.cron,
      agentGroupId: agentId,
      channels: body.channels,
      action: body.action,
      enabled: body.enabled !== false,
      createdAt: Date.now(),
    };

    await scheduler.createTask(task);
    res.status(201).json({
      success: true,
      task,
      message: `Task ${task.id} created`,
    });
  } catch (err) {
    console.error('[TASK-API] createTask failed:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const { agentId, taskId } = req.params;
    const body = req.body as TaskUpdateRequest;

    const scheduler = getTaskScheduler(agentId);
    await scheduler.loadTasks();

    const task = scheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update fields
    if (body.name) task.name = body.name;
    if (body.cron) task.cron = body.cron;
    if (body.channels) task.channels = body.channels;
    if (body.action) task.action = body.action;
    if (body.enabled !== undefined) task.enabled = body.enabled;

    // Manually update and save
    scheduler['tasks'].set(taskId, task);
    await scheduler.saveTasks();

    res.json({
      success: true,
      task,
      message: `Task ${taskId} updated`,
    });
  } catch (err) {
    console.error('[TASK-API] updateTask failed:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { agentId, taskId } = req.params;
    const scheduler = getTaskScheduler(agentId);
    await scheduler.loadTasks();

    const task = scheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await scheduler.deleteTask(taskId);
    res.json({
      success: true,
      message: `Task ${taskId} deleted`,
    });
  } catch (err) {
    console.error('[TASK-API] deleteTask failed:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

export const toggleTask = async (req: Request, res: Response) => {
  try {
    const { agentId, taskId } = req.params;
    const { enabled } = req.body;

    if (enabled === undefined) {
      return res.status(400).json({ error: 'enabled field required' });
    }

    const scheduler = getTaskScheduler(agentId);
    await scheduler.loadTasks();

    const task = scheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.enabled = enabled;
    scheduler['tasks'].set(taskId, task);
    await scheduler.saveTasks();

    res.json({
      success: true,
      task,
      message: `Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (err) {
    console.error('[TASK-API] toggleTask failed:', err);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
};

// ============ Export Router Setup Function ============

export function setupTaskAPI(app: any): void {
  app.get('/api/agents/:agentId/tasks', listTasks);
  app.get('/api/agents/:agentId/tasks/:taskId', getTask);
  app.post('/api/agents/:agentId/tasks', createTask);
  app.put('/api/agents/:agentId/tasks/:taskId', updateTask);
  app.delete('/api/agents/:agentId/tasks/:taskId', deleteTask);
  app.patch('/api/agents/:agentId/tasks/:taskId/toggle', toggleTask);
  console.log('[TASK-API] Routes registered');
}
