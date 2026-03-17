import React, { useState } from 'react';

interface SectionOutputPanelProps {
  conceptViewed: boolean;
  strategyViewed: boolean;
  promptGenerated: boolean;
  taskSubmitted: boolean;
  artifactCount: number;
  artifactsUploaded: number;
  quizScore: number | null;
  hasQuiz: boolean;
  reflectionDone: boolean;
  hasReflection: boolean;
}

interface RowData {
  icon: string;
  label: string;
  status: 'completed' | 'in_progress' | 'not_started';
}

function statusBadge(status: RowData['status']) {
  if (status === 'completed') {
    return <span className="badge bg-success" style={{ fontSize: 10 }}><i className="bi bi-check-lg me-1"></i>Completed</span>;
  }
  if (status === 'in_progress') {
    return <span className="badge bg-warning text-dark" style={{ fontSize: 10 }}>In Progress</span>;
  }
  return <span className="badge bg-secondary" style={{ fontSize: 10 }}>Not Started</span>;
}

export default function SectionOutputPanel(props: SectionOutputPanelProps) {
  const [open, setOpen] = useState(false);

  const rows: RowData[] = [];

  rows.push({
    icon: 'bi-lightbulb',
    label: 'Concept Review',
    status: props.conceptViewed ? 'completed' : 'not_started',
  });

  rows.push({
    icon: 'bi-cpu',
    label: 'AI Strategy',
    status: props.strategyViewed ? 'completed' : 'not_started',
  });

  rows.push({
    icon: 'bi-terminal',
    label: 'Prompt Generated',
    status: props.promptGenerated ? 'completed' : 'not_started',
  });

  rows.push({
    icon: 'bi-rocket',
    label: `Task (${props.artifactsUploaded}/${props.artifactCount} artifacts)`,
    status: props.taskSubmitted ? 'completed' : props.artifactsUploaded > 0 ? 'in_progress' : 'not_started',
  });

  if (props.hasQuiz) {
    rows.push({
      icon: 'bi-patch-question',
      label: props.quizScore !== null ? `Quiz — ${Math.round(props.quizScore)}%` : 'Knowledge Check',
      status: props.quizScore !== null ? 'completed' : 'not_started',
    });
  }

  if (props.hasReflection) {
    rows.push({
      icon: 'bi-chat-square-quote',
      label: 'Reflection',
      status: props.reflectionDone ? 'completed' : 'not_started',
    });
  }

  const completedCount = rows.filter(r => r.status === 'completed').length;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <button
        className="card-header bg-white fw-semibold d-flex align-items-center justify-content-between w-100 border-0"
        onClick={() => setOpen(!open)}
        style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}
        aria-expanded={open}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-clipboard-check" style={{ color: 'var(--color-primary)', fontSize: 14 }}></i>
          <span style={{ color: 'var(--color-primary)' }}>Section Output</span>
          <span className="badge bg-secondary" style={{ fontSize: 10 }}>{completedCount}/{rows.length}</span>
        </div>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ color: 'var(--color-text-light)', fontSize: 12 }}></i>
      </button>
      {open && (
        <div className="card-body pt-0 px-3 pb-3">
          {rows.map((row, i) => (
            <div key={i} className="d-flex align-items-center justify-content-between py-2" style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <div className="d-flex align-items-center gap-2">
                <i className={`bi ${row.icon}`} style={{ fontSize: 13, color: row.status === 'completed' ? 'var(--color-accent)' : 'var(--color-text-light)' }}></i>
                <span className="small" style={{ color: 'var(--color-text)' }}>{row.label}</span>
              </div>
              {statusBadge(row.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
