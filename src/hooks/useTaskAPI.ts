/**
 * useTaskAPI Hook - Modular API client for task operations
 * Provides: list, create, update, delete, toggle tasks
 */

import { useState, useCallback } from 'react';

export interface Task {
  id: string;
  name: string;
  cron: string;
  agentGroupId: string;
  channels: string[];
  action: {
    type: 'send_message' | 'run_connector';
    message?: string;
    connector?: any;
  };
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
}

export function useTaskAPI(agentId: string = 'default') {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const createTask = useCallback(async (task: Partial<Task>) => {
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) throw new Error('Failed to create task');
      const result = await res.json();
      setTasks(prev => [...prev, result.task]);
      return result.task;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [agentId]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update task');
      const result = await res.json();
      setTasks(prev => prev.map(t => t.id === taskId ? result.task : t));
      return result.task;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [agentId]);

  const deleteTask = useCallback(async (taskId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete task');
      setTasks(prev => prev.filter(t => t.id !== taskId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [agentId]);

  const toggleTask = useCallback(async (taskId: string, enabled: boolean) => {
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle task');
      const result = await res.json();
      setTasks(prev => prev.map(t => t.id === taskId ? result.task : t));
      return result.task;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [agentId]);

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleTask,
  };
}
