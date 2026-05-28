/**
 * TaskMonitor Component - Display and manage scheduled tasks
 * Features: Task list, enable/disable, next-run display
 * Integrates into existing UI via tabs or panels
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useTaskAPI } from '../hooks/useTaskAPI';

interface TaskMonitorProps {
  agentId?: string;
  compact?: boolean;
  onTaskSelect?: (taskId: string) => void;
}

export default function TaskMonitor({ agentId = 'default', compact = false, onTaskSelect }: TaskMonitorProps) {
  const { tasks, loading, error, fetchTasks, toggleTask } = useTaskAPI(agentId);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const getNextRunTime = (nextRun?: number) => {
    if (!nextRun) return '—';
    const now = Date.now();
    if (nextRun < now) return 'Due';
    const diffMs = nextRun - now;
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    if (hours > 24) return `in ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `in ${hours}h`;
    return `in ${mins}m`;
  };

  const handleToggle = async (taskId: string, newState: boolean) => {
    setTogglingId(taskId);
    await toggleTask(taskId, newState);
    setTogglingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Scheduled Tasks</h3>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
          {tasks.length} total
        </span>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950 px-2 py-1 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-gray-500">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-gray-500">No scheduled tasks</p>
        ) : (
          tasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors"
              onClick={() => onTaskSelect?.(task.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-xs font-medium text-white">{task.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{task.cron}</p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(task.id, !task.enabled);
                  }}
                  disabled={togglingId === task.id}
                  className={`w-4 h-4 rounded border-2 transition-colors ${
                    task.enabled
                      ? 'bg-green-600 border-green-500'
                      : 'bg-gray-700 border-gray-600'
                  } ${togglingId === task.id ? 'opacity-50' : ''}`}
                />
              </div>

              {!compact && (
                <>
                  <div className="flex gap-1 mb-2">
                    {task.channels.map((ch) => (
                      <span
                        key={ch}
                        className="text-xs px-2 py-1 bg-gray-800 text-gray-300 rounded"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
                    <span>Next run: {getNextRunTime(task.nextRun)}</span>
                    {task.lastRun && (
                      <span>Last: {new Date(task.lastRun).toLocaleTimeString()}</span>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
