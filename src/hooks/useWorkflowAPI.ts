import { useCallback, useState } from 'react';

export interface WorkflowStep {
  id: string;
  action: string;
  description: string;
  retries?: number;
}

export interface Workflow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  steps: WorkflowStep[];
}

export function useWorkflowAPI(agentId: string = 'default') {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows?agentId=${encodeURIComponent(agentId)}`);
      if (!res.ok) throw new Error('Failed to load workflows');
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const createWorkflow = useCallback(async (name: string, actions: string[]) => {
    setError(null);
    const steps = actions
      .map((action, idx) => action.trim())
      .filter(Boolean)
      .map((action, idx) => ({ id: `step_${idx + 1}`, action, description: action, retries: 2 }));
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, name, steps }),
    });
    if (!res.ok) throw new Error('Failed to save workflow');
    await fetchWorkflows();
  }, [agentId, fetchWorkflows]);

  const deleteWorkflow = useCallback(async (workflowId: string) => {
    setError(null);
    const res = await fetch(`/api/workflows/${workflowId}?agentId=${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete workflow');
    setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
  }, [agentId]);

  const runWorkflow = useCallback(async (workflowId: string) => {
    setError(null);
    const res = await fetch(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    if (!res.ok) throw new Error('Failed to run workflow');
    return res.json();
  }, [agentId]);

  const startRecording = useCallback(async (name: string) => {
    setError(null);
    const res = await fetch('/api/workflows/record/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, name }),
    });
    if (!res.ok) throw new Error('Failed to start recording');
    const data = await res.json();
    setRecordingSessionId(data.sessionId);
    return data.sessionId as string;
  }, [agentId]);

  const recordAction = useCallback(async (action: string, description?: string) => {
    if (!recordingSessionId) throw new Error('Recording not started');
    const res = await fetch('/api/workflows/record/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: recordingSessionId, action, description: description || action }),
    });
    if (!res.ok) throw new Error('Failed to record action');
  }, [recordingSessionId]);

  const stopRecording = useCallback(async () => {
    if (!recordingSessionId) throw new Error('Recording not started');
    const res = await fetch('/api/workflows/record/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: recordingSessionId }),
    });
    if (!res.ok) throw new Error('Failed to stop recording');
    setRecordingSessionId(null);
    await fetchWorkflows();
  }, [recordingSessionId, fetchWorkflows]);

  return {
    workflows,
    recordingSessionId,
    loading,
    error,
    fetchWorkflows,
    createWorkflow,
    deleteWorkflow,
    runWorkflow,
    startRecording,
    recordAction,
    stopRecording,
  };
}

