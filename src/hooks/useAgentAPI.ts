/**
 * useAgentAPI Hook - Modular API client for agent operations
 * Provides: agent list, status, logs, restart, etc.
 */

import { useState, useCallback } from 'react';

export interface Agent {
  agentGroupId: string;
  status: 'online' | 'offline' | 'busy';
  messageQueueDepth: number;
  tasksEnabled: number;
  tasksDisabled: number;
  lastActivity: number;
  uptime: number;
}

export function useAgentAPI() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const getAgent = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`);
      if (!res.ok) throw new Error('Failed to fetch agent');
      return await res.json() as Agent;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const restartAgent = useCallback(async (agentId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/restart`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to restart agent');
      return await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const getAgentLogs = useCallback(async (agentId: string, lines: number = 50) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/logs?lines=${lines}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      return await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  return {
    agents,
    loading,
    error,
    fetchAgents,
    getAgent,
    restartAgent,
    getAgentLogs,
  };
}
