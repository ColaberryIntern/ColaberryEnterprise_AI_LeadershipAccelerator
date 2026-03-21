import React, { useEffect, useState, useCallback } from 'react';
import portalApi from '../../utils/portalApi';

interface MiniLesson {
  title: string;
  explanation: string;
  steps: string[];
}

interface CodeExample {
  path: string;
  language: string;
  code: string;
  description: string;
}

interface Prompt {
  type: 'claude_code' | 'debug' | 'extend';
  title: string;
  content: string;
}

interface GuidedPayload {
  lesson: MiniLesson;
  code_examples: CodeExample[];
  prompts: Prompt[];
  context: {
    tech_stack: string[];
    difficulty_level: string;
    related_artifacts: string[];
    missing_components: string[];
    files_suggested: string[];
  };
}

type TabKey = 'learn' | 'build' | 'artifacts' | 'prompts';

const PROMPT_TYPE_ICONS: Record<string, string> = {
  claude_code: 'bi-terminal',
  debug: 'bi-bug',
  extend: 'bi-plus-circle',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline-secondary'}`}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      <i className={`bi ${copied ? 'bi-check' : 'bi-clipboard'} me-1`}></i>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function GuidedExecutionPanel({ actionId }: { actionId: string }) {
  const [data, setData] = useState<GuidedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('learn');

  const fetchGuidance = useCallback(() => {
    setLoading(true);
    setError(null);
    portalApi.get(`/api/portal/project/guided-execution?action_id=${actionId}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load guidance'))
      .finally(() => setLoading(false));
  }, [actionId]);

  useEffect(() => { fetchGuidance(); }, [fetchGuidance]);

  if (loading) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-4 text-center">
          <div className="spinner-border spinner-border-sm me-2" style={{ color: 'var(--color-primary)' }} role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <span className="small text-muted">Generating execution guidance...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-3">
          <div className="small text-danger">
            <i className="bi bi-exclamation-circle me-1"></i>
            {error || 'Unable to generate guidance'}
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'learn', label: 'Learn', icon: 'bi-book' },
    { key: 'build', label: 'Build', icon: 'bi-code-square' },
    { key: 'artifacts', label: 'Artifacts', icon: 'bi-collection' },
    { key: 'prompts', label: 'Prompts', icon: 'bi-chat-square-text' },
  ];

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white py-2">
        <nav className="nav nav-tabs card-header-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`nav-link small py-1 px-3${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="card-body">
        {activeTab === 'learn' && <LearnTab lesson={data.lesson} />}
        {activeTab === 'build' && <BuildTab examples={data.code_examples} />}
        {activeTab === 'artifacts' && <ArtifactsTab context={data.context} />}
        {activeTab === 'prompts' && <PromptsTab prompts={data.prompts} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Components
// ---------------------------------------------------------------------------

function LearnTab({ lesson }: { lesson: MiniLesson }) {
  return (
    <>
      <h6 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>{lesson.title}</h6>
      <p className="small text-muted mb-3">{lesson.explanation}</p>
      <div className="small fw-medium mb-2">Steps:</div>
      <ol className="small mb-0">
        {lesson.steps.map((step, i) => (
          <li key={i} className="mb-1">{step}</li>
        ))}
      </ol>
    </>
  );
}

function BuildTab({ examples }: { examples: CodeExample[] }) {
  if (examples.length === 0) {
    return <div className="small text-muted">No code examples available for this action.</div>;
  }

  return (
    <>
      {examples.map((ex, i) => (
        <div key={i} className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <div>
              <code className="small" style={{ color: 'var(--color-primary)' }}>{ex.path}</code>
              <span className="badge bg-light text-dark border ms-2 small">{ex.language}</span>
            </div>
            <CopyButton text={ex.code} />
          </div>
          {ex.description && <div className="small text-muted mb-1">{ex.description}</div>}
          <pre
            className="p-3 rounded small mb-0"
            style={{
              background: 'var(--color-bg-alt)',
              border: '1px solid var(--color-border)',
              maxHeight: 300,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '0.8rem',
            }}
          >
            <code>{ex.code}</code>
          </pre>
        </div>
      ))}
    </>
  );
}

function ArtifactsTab({ context }: { context: GuidedPayload['context'] }) {
  return (
    <>
      {context.related_artifacts.length > 0 ? (
        <div className="mb-3">
          <div className="small fw-medium mb-2">
            <i className="bi bi-link-45deg me-1"></i>Related Artifacts
          </div>
          <div className="d-flex flex-wrap gap-2">
            {context.related_artifacts.map((a, i) => (
              <span key={i} className="badge bg-primary py-2 px-3">{a}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="small text-muted mb-3">No linked artifacts for this action.</div>
      )}

      {context.missing_components.length > 0 && (
        <div className="mb-3">
          <div className="small fw-medium mb-2">
            <i className="bi bi-exclamation-triangle me-1" style={{ color: '#f59e0b' }}></i>
            Missing Components
          </div>
          <ul className="small mb-0">
            {context.missing_components.map((c, i) => (
              <li key={i} className="mb-1 text-muted">{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="d-flex gap-3 flex-wrap">
        <div className="small">
          <strong>Tech Stack:</strong>{' '}
          {context.tech_stack.length > 0
            ? context.tech_stack.map((t, i) => (
                <span key={i} className="badge bg-light text-dark border me-1">{t}</span>
              ))
            : <span className="text-muted">Not detected</span>}
        </div>
        <div className="small">
          <strong>Difficulty:</strong>{' '}
          <span className={`badge ${
            context.difficulty_level === 'low' ? 'bg-success' :
            context.difficulty_level === 'medium' ? 'bg-warning text-dark' : 'bg-danger'
          }`}>
            {context.difficulty_level}
          </span>
        </div>
      </div>
    </>
  );
}

function PromptsTab({ prompts }: { prompts: Prompt[] }) {
  if (prompts.length === 0) {
    return <div className="small text-muted">No prompts available.</div>;
  }

  return (
    <>
      {prompts.map((p, i) => (
        <div key={i} className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <div className="small fw-medium">
              <i className={`bi ${PROMPT_TYPE_ICONS[p.type] || 'bi-chat'} me-1`} style={{ color: 'var(--color-primary)' }}></i>
              {p.title}
              <span className="badge bg-light text-dark border ms-2">{p.type}</span>
            </div>
            <CopyButton text={p.content} />
          </div>
          <pre
            className="p-3 rounded small mb-0"
            style={{
              background: 'var(--color-bg-alt)',
              border: '1px solid var(--color-border)',
              maxHeight: 250,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '0.8rem',
            }}
          >
            {p.content}
          </pre>
        </div>
      ))}
    </>
  );
}

export default GuidedExecutionPanel;
