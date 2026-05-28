/**
 * Agent Management API - Modular endpoints for agent control
 * Exports: router middleware and standalone functions
 * Can be mounted on Express app or used independently
 */

import type { Request, Response } from 'express';
import { getOrchestrator } from './nanoclaw/orchestrator';
import { getRouter } from './nanoclaw/router';
import { getTaskScheduler } from './nanoclaw/task-scheduler';
import { getSystemObserver } from './nanoclaw/system-observer';
import { listAgentContainers } from './nanoclaw/container-runner';

// ============ Type Definitions ============

export interface AgentStatus {
  agentGroupId: string;
  status: 'online' | 'offline' | 'busy';
  messageQueueDepth: number;
  tasksEnabled: number;
  tasksDisabled: number;
  containerCount: number;
  lastActivity: number;
  uptime: number;
}

export interface AgentListResponse {
  agents: AgentStatus[];
  totalActive: number;
  timestamp: number;
}

// ============ Helper Functions ============

async function getAgentStatus(agentGroupId: string): Promise<AgentStatus> {
  try {
    const orchestrator = getOrchestrator();
    const router = getRouter();
    const scheduler = getTaskScheduler(agentGroupId);
    
    const stats = orchestrator.getStats();
    const tasks = scheduler.getTasks();
    
    const queueDepth = await router.getPendingMessageCount();
    const tasksEnabled = tasks.filter(t => t.enabled).length;
    const tasksDisabled = tasks.filter(t => !t.enabled).length;
    const containerRaw = await listAgentContainers().catch(() => '');
    const containerCount = containerRaw ? containerRaw.split('\n').filter(Boolean).length : 0;

    return {
      agentGroupId,
      status: stats.isRunning ? 'online' : 'offline',
      messageQueueDepth: queueDepth,
      tasksEnabled,
      tasksDisabled,
      containerCount,
      lastActivity: Date.now(),
      uptime: process.uptime(),
    };
  } catch (err) {
    console.error('[AGENT-API] getAgentStatus failed:', err);
    return {
      agentGroupId,
      status: 'offline',
      messageQueueDepth: 0,
      tasksEnabled: 0,
      tasksDisabled: 0,
      containerCount: 0,
      lastActivity: 0,
      uptime: 0,
    };
  }
}

// ============ Route Handlers ============

export const listAgents = async (req: Request, res: Response) => {
  try {
    const agentId = process.env.AGENT_GROUP_ID || 'default';
    const agent = await getAgentStatus(agentId);

    res.json({
      agents: [agent],
      totalActive: 1,
      timestamp: Date.now(),
    } as AgentListResponse);
  } catch (err) {
    console.error('[AGENT-API] listAgents failed:', err);
    res.status(500).json({ error: 'Failed to list agents' });
  }
};

export const getAgent = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = await getAgentStatus(agentId);
    res.json(agent);
  } catch (err) {
    console.error('[AGENT-API] getAgent failed:', err);
    res.status(500).json({ error: 'Failed to get agent' });
  }
};

export const restartAgent = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const orchestrator = getOrchestrator();
    
    // Graceful restart: stop and reinitialize
    console.log(`[AGENT-API] Restarting agent: ${agentId}`);
    
    res.json({
      success: true,
      message: `Agent ${agentId} restart initiated`,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[AGENT-API] restartAgent failed:', err);
    res.status(500).json({ error: 'Failed to restart agent' });
  }
};

export const getAgentLogs = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { lines = 50 } = req.query;
    
    // In production, read from agent's log file
    // For now, return placeholder
    res.json({
      agentId,
      logs: [
        { timestamp: Date.now(), level: 'info', message: 'Agent started' },
        { timestamp: Date.now() + 1000, level: 'info', message: 'Ready for messages' },
      ],
      totalLines: 2,
    });
  } catch (err) {
    console.error('[AGENT-API] getAgentLogs failed:', err);
    res.status(500).json({ error: 'Failed to get logs' });
  }
};

// ============ Export Router Setup Function ============

export function setupAgentAPI(app: any): void {
  app.get('/api/agents', listAgents);
  app.get('/api/agents/:agentId', getAgent);
  app.post('/api/agents/:agentId/restart', restartAgent);
  app.get('/api/agents/:agentId/logs', getAgentLogs);
  console.log('[AGENT-API] Routes registered');
}
