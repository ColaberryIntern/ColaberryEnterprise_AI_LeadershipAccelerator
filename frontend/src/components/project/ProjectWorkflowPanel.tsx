import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface WorkflowTask {
  key: string;
  label: string;
  completed: boolean;
  detail?: string;
}

interface WorkflowPhase {
  key: string;
  label: string;
  icon: string;
  status: 'completed' | 'active' | 'locked';
  tasks: WorkflowTask[];
  completion_pct: number;
}

interface WorkflowState {
  phases: WorkflowPhase[];
  current_phase: string;
  overall_progress: number;
  next_action: string;
  summary: string;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'var(--color-accent)',
  active: 'var(--color-primary)',
  locked: 'var(--color-text-light)',
};

function ProjectWorkflowPanel() {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  useEffect(() => {
    portalApi.get('/api/portal/project/workflow')
      .then(res => {
        setWorkflow(res.data);
        const active = res.data.phases?.find((p: WorkflowPhase) => p.status === 'active');
        if (active) setExpandedPhase(active.key);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          <i className="bi bi-kanban me-2"></i>Project Workflow
        </div>
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm" style={{ color: 'var(--color-primary)' }} role="status">
            <span className="visually-hidden">Loading workflow...</span>
          </div>
          <span className="small text-muted ms-2">Loading workflow...</span>
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return null;
  }

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span><i className="bi bi-kanban me-2"></i>Project Workflow</span>
        <span className="badge" style={{ background: 'var(--color-primary)' }}>
          {workflow.overall_progress}% Complete
        </span>
      </div>
      <div className="card-body">
        {/* Overall progress bar */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="small text-muted">{workflow.summary}</span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div
              className="progress-bar"
              role="progressbar"
              style={{
                width: `${workflow.overall_progress}%`,
                background: workflow.overall_progress === 100 ? 'var(--color-accent)' : 'var(--color-primary)',
              }}
              aria-valuenow={workflow.overall_progress}
              aria-valuemin={0}
              aria-valuemax={100}
            ></div>
          </div>
        </div>

        {/* Next action callout */}
        <div className="alert py-2 px-3 mb-3 small" style={{
          background: 'var(--color-bg-alt)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}>
          <i className="bi bi-arrow-right-circle me-1" style={{ color: 'var(--color-primary)' }}></i>
          <strong>Next:</strong> {workflow.next_action}
        </div>

        {/* Phase list */}
        <div className="d-flex flex-column gap-2">
          {workflow.phases.map(phase => {
            const isExpanded = expandedPhase === phase.key;
            const statusColor = STATUS_COLORS[phase.status];

            return (
              <div key={phase.key}>
                {/* Phase header */}
                <button
                  className="btn btn-sm w-100 d-flex align-items-center gap-2 text-start px-3 py-2"
                  style={{
                    background: isExpanded ? 'var(--color-bg-alt)' : 'transparent',
                    border: `1px solid ${phase.status === 'active' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: isExpanded ? '0.375rem 0.375rem 0 0' : '0.375rem',
                    opacity: phase.status === 'locked' ? 0.6 : 1,
                  }}
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.key)}
                  aria-expanded={isExpanded}
                >
                  {/* Status indicator */}
                  {phase.status === 'completed' ? (
                    <i className="bi bi-check-circle-fill" style={{ color: statusColor, fontSize: '1rem' }}></i>
                  ) : phase.status === 'active' ? (
                    <i className={`bi ${phase.icon}`} style={{ color: statusColor, fontSize: '1rem' }}></i>
                  ) : (
                    <i className="bi bi-lock" style={{ color: statusColor, fontSize: '0.85rem' }}></i>
                  )}

                  <span className="fw-medium small flex-grow-1" style={{ color: phase.status === 'locked' ? 'var(--color-text-light)' : 'var(--color-text)' }}>
                    {phase.label}
                  </span>

                  {/* Completion badge */}
                  <span className="badge" style={{
                    background: phase.status === 'completed' ? 'var(--color-accent)' :
                      phase.status === 'active' ? 'var(--color-primary)' : 'var(--color-border)',
                    color: phase.status === 'locked' ? 'var(--color-text-light)' : '#fff',
                    fontSize: '0.65rem',
                  }}>
                    {phase.completion_pct}%
                  </span>

                  <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} small`} style={{ color: 'var(--color-text-light)' }}></i>
                </button>

                {/* Task checklist (expanded) */}
                {isExpanded && (
                  <div style={{
                    border: `1px solid ${phase.status === 'active' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderTop: 'none',
                    borderRadius: '0 0 0.375rem 0.375rem',
                    padding: '0.5rem 0.75rem',
                    background: '#fff',
                  }}>
                    {/* Mini progress */}
                    <div className="progress mb-2" style={{ height: 4 }}>
                      <div
                        className="progress-bar"
                        style={{
                          width: `${phase.completion_pct}%`,
                          background: phase.status === 'completed' ? 'var(--color-accent)' : 'var(--color-primary)',
                        }}
                      ></div>
                    </div>

                    {phase.tasks.map(task => (
                      <div key={task.key} className="d-flex align-items-start gap-2 py-1">
                        <i
                          className={`bi ${task.completed ? 'bi-check-square-fill' : 'bi-square'} mt-1`}
                          style={{
                            color: task.completed ? 'var(--color-accent)' : 'var(--color-border)',
                            fontSize: '0.85rem',
                          }}
                        ></i>
                        <div className="flex-grow-1">
                          <span className="small" style={{
                            color: task.completed ? 'var(--color-text)' : 'var(--color-text-light)',
                            textDecoration: task.completed ? 'none' : 'none',
                          }}>
                            {task.label}
                          </span>
                          {task.detail && (
                            <div className="small text-muted" style={{ fontSize: '0.75rem' }}>
                              {task.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ProjectWorkflowPanel;
