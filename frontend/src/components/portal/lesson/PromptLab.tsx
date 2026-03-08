import React, { useState, useEffect, useCallback } from 'react';
import portalApi from '../../../utils/portalApi';
import { useMentorContext } from '../../../contexts/MentorContext';

interface PromptLabProps {
  lessonId: string;
  promptTemplate?: {
    template: string;
    variables?: string[];
    placeholders?: { name: string; description: string; example: string }[];
    example_filled?: string;
  };
}

/* Simple markdown renderer for prompt lab responses */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<div key={i} className="fw-bold mt-2 mb-1" style={{ fontSize: 13 }}>{line.slice(4)}</div>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={i} className="fw-bold mt-2 mb-1" style={{ fontSize: 14 }}>{line.slice(3)}</div>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<div key={i} className="fw-bold mt-2 mb-1" style={{ fontSize: 15 }}>{line.slice(2)}</div>);
      continue;
    }

    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: 13 }}>
          <span className="flex-shrink-0" style={{ color: '#8b5cf6', fontWeight: 600, minWidth: 16 }}>{numMatch[1]}.</span>
          <span>{renderInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      elements.push(
        <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: 13 }}>
          <span style={{ color: '#8b5cf6', marginTop: 2 }}>&bull;</span>
          <span>{renderInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="p-2 rounded mb-2" style={{ background: '#1e293b', color: '#a7f3d0', fontSize: 12, lineHeight: 1.5, fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    if (line.trim()) {
      elements.push(<div key={i} className="mb-1" style={{ fontSize: 13 }}>{renderInline(line)}</div>);
    } else if (i > 0 && lines[i - 1].trim()) {
      elements.push(<div key={i} style={{ height: 4 }} />);
    }
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: 3, fontSize: 12, fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function PromptLab({ lessonId, promptTemplate }: PromptLabProps) {
  const { pendingPromptLabMessage, clearPendingPromptLabMessage, selectedLLM, openLLMWithPrompt } = useMentorContext();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const executePrompt = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setPrompt(text.trim());
    setResponse(null);

    try {
      const res = await portalApi.post(`/api/portal/curriculum/lessons/${lessonId}/prompt-lab`, {
        prompt: text.trim(),
      });
      setResponse(res.data.response);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to execute prompt');
    } finally {
      setLoading(false);
    }
  }, [loading, lessonId]);

  // Watch for external prompts from PromptTemplate "Test in Prompt Lab"
  useEffect(() => {
    if (pendingPromptLabMessage && !loading) {
      executePrompt(pendingPromptLabMessage);
      clearPendingPromptLabMessage();
    }
  }, [pendingPromptLabMessage, loading, executePrompt, clearPendingPromptLabMessage]);

  const copyResponse = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus('Failed to copy');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  // Nothing to show until a prompt is sent
  if (!prompt && !loading) return null;

  return (
    <div className="card border-0 shadow-sm mb-4" style={{ borderTop: '3px solid #8b5cf6' }}>
      <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
        <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#f5f3ff' }}>
          <i className="bi bi-terminal" style={{ color: '#8b5cf6', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Prompt Lab Result</span>
      </div>

      <div className="card-body" style={{ padding: 20 }}>
        {/* Your Prompt */}
        {prompt && (
          <div className="mb-3">
            <div className="fw-semibold small mb-1" style={{ color: '#64748b' }}>Your Prompt</div>
            <pre
              className="p-3 rounded mb-0"
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 12,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                color: '#334155',
                fontFamily: 'monospace',
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {prompt}
            </pre>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-4">
            <div className="spinner-border text-primary mb-2" role="status" style={{ width: 32, height: 32 }}>
              <span className="visually-hidden">Running prompt...</span>
            </div>
            <p className="small mb-0" style={{ color: '#64748b' }}>Running your prompt...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded mb-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-triangle" style={{ color: '#ef4444' }}></i>
              <span className="small" style={{ color: '#991b1b' }}>{error}</span>
            </div>
          </div>
        )}

        {/* AI Response */}
        {response && (
          <div>
            <div className="fw-semibold small mb-1" style={{ color: '#64748b' }}>AI Response</div>
            <div
              className="p-3 rounded"
              style={{
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                lineHeight: 1.7,
                color: '#334155',
              }}
            >
              {renderMarkdown(response)}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {response && (
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button
              className="btn btn-sm d-flex align-items-center gap-1"
              style={{
                background: '#8b5cf6',
                color: '#fff',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
              }}
              onClick={() => executePrompt(prompt!)}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise"></i>
              Run Again
            </button>
            <button
              className="btn btn-sm d-flex align-items-center gap-1"
              style={{
                background: '#fff',
                color: '#6366f1',
                border: '1px solid #c7d2fe',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
              onClick={copyResponse}
            >
              <i className="bi bi-clipboard"></i>
              {copyStatus || 'Copy Response'}
            </button>
            <button
              className="btn btn-sm d-flex align-items-center gap-1"
              style={{
                background: '#fff',
                color: '#6366f1',
                border: '1px solid #c7d2fe',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
              onClick={() => openLLMWithPrompt(prompt!)}
            >
              <i className={`bi ${selectedLLM.icon}`}></i>
              Open in {selectedLLM.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
