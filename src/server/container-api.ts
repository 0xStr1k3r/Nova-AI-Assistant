/**
 * Container API - lightweight endpoints for per-agent container isolation
 */

import type { Request, Response } from 'express';
import {
  listAgentContainers,
  runAgentContainer,
  stopAgentContainer,
} from './nanoclaw/container-runner';

export const getContainers = async (_req: Request, res: Response) => {
  try {
    const raw = await listAgentContainers();
    const containers = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, name, status] = line.split('\t');
        return { id, name, status };
      });
    res.json({ containers, total: containers.length, timestamp: Date.now() });
  } catch (err) {
    console.error('[CONTAINER-API] getContainers failed:', err);
    res.status(500).json({ error: 'Failed to list containers' });
  }
};

export const startContainer = async (req: Request, res: Response) => {
  try {
    const {
      agentGroupId = process.env.AGENT_GROUP_ID || 'default',
      cpuShares = 256,
      memory = '256m',
      imageTag = 'nova-agent:latest',
    } = req.body || {};

    const containerId = await runAgentContainer({
      agentGroupId,
      imageTag,
      cpuShares,
      memory,
      env: { AGENT_GROUP_ID: agentGroupId },
    });

    res.json({
      success: true,
      agentGroupId,
      containerId,
      limits: { cpuShares, memory },
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[CONTAINER-API] startContainer failed:', err);
    res.status(500).json({ error: 'Failed to start container' });
  }
};

export const stopContainer = async (req: Request, res: Response) => {
  try {
    const { containerName } = req.params;
    await stopAgentContainer(containerName);
    res.json({ success: true, containerName, timestamp: Date.now() });
  } catch (err) {
    console.error('[CONTAINER-API] stopContainer failed:', err);
    res.status(500).json({ error: 'Failed to stop container' });
  }
};

export function setupContainerAPI(app: any): void {
  app.get('/api/containers', getContainers);
  app.post('/api/containers/start', startContainer);
  app.post('/api/containers/:containerName/stop', stopContainer);
  console.log('[CONTAINER-API] Routes registered');
}

