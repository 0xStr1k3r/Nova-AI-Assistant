/**
 * Workflow API - lightweight workflow designer + dynamic recording
 */

import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { executeWorkflow } from './action-executor';
import { getWorkspacePath } from './nanoclaw/workspace-manager';

export interface WorkflowStep {
  id: string;
  action: string;
  description: string;
  retries?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  steps: WorkflowStep[];
}

interface RecordingSession {
  sessionId: string;
  agentId: string;
  name: string;
  startedAt: number;
  steps: WorkflowStep[];
}

const recordingSessions = new Map<string, RecordingSession>();

async function getWorkflowPath(agentId: string): Promise<string> {
  const base = await getWorkspacePath(agentId);
  return path.join(base, 'workflows.json');
}

async function loadWorkflows(agentId: string): Promise<WorkflowDefinition[]> {
  const p = await getWorkflowPath(agentId);
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveWorkflows(agentId: string, workflows: WorkflowDefinition[]): Promise<void> {
  const p = await getWorkflowPath(agentId);
  await fs.writeFile(p, JSON.stringify(workflows, null, 2), 'utf-8');
}

export const listWorkflows = async (req: Request, res: Response) => {
  const agentId = String(req.query.agentId || process.env.AGENT_GROUP_ID || 'default');
  const workflows = await loadWorkflows(agentId);
  res.json({ agentId, workflows, total: workflows.length });
};

export const saveWorkflow = async (req: Request, res: Response) => {
  const agentId = String(req.body?.agentId || process.env.AGENT_GROUP_ID || 'default');
  const name = String(req.body?.name || '').trim();
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  if (!name || steps.length === 0) {
    return res.status(400).json({ error: 'name and at least one step are required' });
  }

  const workflows = await loadWorkflows(agentId);
  const now = Date.now();
  const id = String(req.body?.id || `wf_${now}`);
  const existingIdx = workflows.findIndex((w) => w.id === id);
  const next: WorkflowDefinition = {
    id,
    name,
    createdAt: existingIdx >= 0 ? workflows[existingIdx].createdAt : now,
    updatedAt: now,
    steps: steps.map((s: any, i: number) => ({
      id: s?.id || `step_${i + 1}`,
      action: String(s?.action || ''),
      description: String(s?.description || s?.action || ''),
      retries: typeof s?.retries === 'number' ? s.retries : 2,
    })),
  };

  if (existingIdx >= 0) workflows[existingIdx] = next;
  else workflows.push(next);
  await saveWorkflows(agentId, workflows);
  res.json({ success: true, workflow: next });
};

export const deleteWorkflow = async (req: Request, res: Response) => {
  const agentId = String(req.query.agentId || process.env.AGENT_GROUP_ID || 'default');
  const { workflowId } = req.params;
  const workflows = await loadWorkflows(agentId);
  const filtered = workflows.filter((w) => w.id !== workflowId);
  await saveWorkflows(agentId, filtered);
  res.json({ success: true, removed: workflows.length - filtered.length });
};

export const runWorkflow = async (req: Request, res: Response) => {
  const agentId = String(req.body?.agentId || process.env.AGENT_GROUP_ID || 'default');
  const { workflowId } = req.params;
  const workflows = await loadWorkflows(agentId);
  const workflow = workflows.find((w) => w.id === workflowId);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

  const result = await executeWorkflow({
    id: workflow.id,
    name: workflow.name,
    steps: workflow.steps,
  } as any);
  res.json({ success: true, result });
};

export const startWorkflowRecording = async (req: Request, res: Response) => {
  const agentId = String(req.body?.agentId || process.env.AGENT_GROUP_ID || 'default');
  const name = String(req.body?.name || 'Recorded Workflow').trim();
  const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  recordingSessions.set(sessionId, {
    sessionId,
    agentId,
    name,
    startedAt: Date.now(),
    steps: [],
  });
  res.json({ success: true, sessionId, name });
};

export const recordWorkflowAction = async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '');
  const action = String(req.body?.action || '').trim();
  const description = String(req.body?.description || action).trim();
  if (!sessionId || !action) return res.status(400).json({ error: 'sessionId and action required' });
  const session = recordingSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Recording session not found' });

  session.steps.push({
    id: `step_${session.steps.length + 1}`,
    action,
    description,
    retries: 2,
  });

  res.json({ success: true, sessionId, steps: session.steps.length });
};

export const stopWorkflowRecording = async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '');
  const session = recordingSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Recording session not found' });
  recordingSessions.delete(sessionId);

  if (session.steps.length === 0) {
    return res.status(400).json({ error: 'No actions recorded' });
  }

  const workflow: WorkflowDefinition = {
    id: `wf_${Date.now()}`,
    name: session.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: session.steps,
  };

  const workflows = await loadWorkflows(session.agentId);
  workflows.push(workflow);
  await saveWorkflows(session.agentId, workflows);
  res.json({ success: true, workflow, totalSteps: workflow.steps.length });
};

export function setupWorkflowAPI(app: any): void {
  app.get('/api/workflows', listWorkflows);
  app.post('/api/workflows', saveWorkflow);
  app.delete('/api/workflows/:workflowId', deleteWorkflow);
  app.post('/api/workflows/:workflowId/run', runWorkflow);

  app.post('/api/workflows/record/start', startWorkflowRecording);
  app.post('/api/workflows/record/action', recordWorkflowAction);
  app.post('/api/workflows/record/stop', stopWorkflowRecording);
  console.log('[WORKFLOW-API] Routes registered');
}

