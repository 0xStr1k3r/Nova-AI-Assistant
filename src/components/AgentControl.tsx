/**
 * AgentControl Component - Integrated agent management panel
 * Features: Agent status, task count, quick actions
 * Can be embedded anywhere in the UI (sidebar, tab, popover)
 */

import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { useAgentAPI } from '../hooks/useAgentAPI';

interface AgentControlProps {
  compact?: boolean;
  onAgentSelect?: (agentId: string) => void;
}

export default function AgentControl({ compact = false, onAgentSelect }: AgentControlProps) {
  const { agents, loading, error, fetchAgents } = useAgentAPI();

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return 'from-green-500 to-green-600';
      case 'busy': return 'from-yellow-500 to-yellow-600';
      case 'offline': return 'from-red-500 to-red-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Active Agents</h3>
        {loading && <span className="text-xs text-gray-400">Updating...</span>}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950 px-2 py-1 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {agents.length === 0 ? (
          <p className="text-xs text-gray-500">No agents running</p>
        ) : (
          agents.map((agent) => (
            <motion.div
              key={agent.agentGroupId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors cursor-pointer"
              onClick={() => onAgentSelect?.(agent.agentGroupId)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-xs font-medium text-white truncate">
                    {agent.agentGroupId}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${statusColor(agent.status)}`} />
                    <span className="text-xs text-gray-400 capitalize">
                      {agent.status}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-blue-400">
                  ↑{agent.tasksEnabled}
                </span>
              </div>

              {!compact && (
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-800 text-xs">
                  <div>
                    <p className="text-gray-500">Queue</p>
                    <p className="text-white font-medium">{agent.messageQueueDepth}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tasks</p>
                    <p className="text-white font-medium">
                      {agent.tasksEnabled}/{agent.tasksEnabled + agent.tasksDisabled}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Containers</p>
                    <p className="text-white font-medium">{agent.containerCount ?? 0}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
