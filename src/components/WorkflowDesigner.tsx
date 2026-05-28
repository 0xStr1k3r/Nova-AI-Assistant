import React, { useEffect, useState } from 'react';
import { useWorkflowAPI } from '../hooks/useWorkflowAPI';

export default function WorkflowDesigner() {
  const {
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
  } = useWorkflowAPI();

  const [name, setName] = useState('');
  const [actionsText, setActionsText] = useState('');
  const [recordActionText, setRecordActionText] = useState('');
  const [runStatus, setRunStatus] = useState<string>('');

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const onCreate = async () => {
    const actions = actionsText.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!name.trim() || actions.length === 0) return;
    await createWorkflow(name.trim(), actions);
    setName('');
    setActionsText('');
  };

  const onRun = async (id: string) => {
    const result = await runWorkflow(id);
    setRunStatus(result?.result?.finalMessage || 'Workflow executed');
    setTimeout(() => setRunStatus(''), 6000);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Workflow Designer</h3>
      {error && <div className="text-xs text-red-400 bg-red-950 px-2 py-1 rounded">{error}</div>}
      {runStatus && <div className="text-xs text-emerald-300 bg-emerald-950 px-2 py-1 rounded">{runStatus}</div>}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name"
          className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-800 text-xs text-white"
        />
        <textarea
          value={actionsText}
          onChange={(e) => setActionsText(e.target.value)}
          placeholder={'One action per line\nExample:\nOpen browser and navigate to github.com\nClick Sign in'}
          rows={4}
          className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-800 text-xs text-white"
        />
        <button onClick={onCreate} className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-700 rounded text-white">
          Save Workflow
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
        <div className="flex gap-2">
          {!recordingSessionId ? (
            <button
              onClick={() => startRecording(name.trim() || `Recorded ${new Date().toLocaleTimeString()}`)}
              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              Start Recording
            </button>
          ) : (
            <>
              <button
                onClick={async () => {
                  if (recordActionText.trim()) {
                    await recordAction(recordActionText.trim());
                    setRecordActionText('');
                  }
                }}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white"
              >
                Add Recorded Step
              </button>
              <button
                onClick={stopRecording}
                className="text-xs px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-white"
              >
                Stop & Save
              </button>
            </>
          )}
        </div>
        {recordingSessionId && (
          <input
            value={recordActionText}
            onChange={(e) => setRecordActionText(e.target.value)}
            placeholder="Recorded action (lightweight manual capture)"
            className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-800 text-xs text-white"
          />
        )}
      </div>

      <div className="space-y-2">
        {loading && <p className="text-xs text-gray-500">Loading workflows…</p>}
        {workflows.map((wf) => (
          <div key={wf.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white font-medium">{wf.name}</p>
                <p className="text-xs text-gray-500">{wf.steps.length} steps</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onRun(wf.id)} className="text-xs px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-white">Run</button>
                <button onClick={() => deleteWorkflow(wf.id)} className="text-xs px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-white">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

