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
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Workflow Designer</h3>
      {error && (
        <div className="text-xs px-2.5 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red)' }}>
          {error}
        </div>
      )}
      {runStatus && (
        <div className="text-xs px-2.5 py-1.5 rounded-lg font-medium" style={{ background: 'var(--green-soft)', border: '1px solid var(--green-soft)', color: 'var(--green)' }}>
          {runStatus}
        </div>
      )}

      {/* Save Workflow Card */}
      <div
        className="p-4 space-y-3"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--bg-border)',
          borderRadius: 12,
        }}
      >
        <div className="space-y-1">
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workflow Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Deploy website"
            className="input-field"
            style={{ fontSize: 12 }}
          />
        </div>
        <div className="space-y-1">
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Actions (one per line)</label>
          <textarea
            value={actionsText}
            onChange={(e) => setActionsText(e.target.value)}
            placeholder={'Example:\nOpen browser and navigate to github.com\nClick Sign in'}
            rows={4}
            className="input-field resize-none leading-relaxed"
            style={{ fontSize: 12 }}
          />
        </div>
        <button
          onClick={onCreate}
          className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: 'var(--blue-soft)',
            border: '1px solid var(--blue-border)',
            color: '#93c5fd',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(59,130,246,0.2)';
            e.currentTarget.style.color = 'var(--text-1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--blue-soft)';
            e.currentTarget.style.color = '#93c5fd';
          }}
        >
          Save Workflow
        </button>
      </div>

      {/* Recording Steps Card */}
      <div
        className="p-4 space-y-3"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--bg-border)',
          borderRadius: 12,
        }}
      >
        <div className="flex gap-2">
          {!recordingSessionId ? (
            <button
              onClick={() => startRecording(name.trim() || `Recorded ${new Date().toLocaleTimeString()}`)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid var(--blue-border)',
                color: '#60a5fa',
              }}
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  color: 'var(--text-2)',
                }}
              >
                Add Recorded Step
              </button>
              <button
                onClick={stopRecording}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: 'var(--green-soft)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: 'var(--green)',
                }}
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
            placeholder="Describe the action performed manually..."
            className="input-field"
            style={{ fontSize: 12 }}
          />
        )}
      </div>

      {/* Workflows List */}
      <div className="space-y-2">
        {loading && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Loading workflows…</p>}
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="p-3.5"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--bg-border)',
              borderRadius: 12,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{wf.name}</p>
                <p className="text-[10px] uppercase font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>{wf.steps.length} steps</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onRun(wf.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: 'var(--green-soft)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    color: 'var(--green)',
                  }}
                >
                  Run
                </button>
                <button
                  onClick={() => deleteWorkflow(wf.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: 'var(--red)',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

