import React, { useState, useCallback } from 'react';

interface Props {
  lessonId: string;
  token: string;
  apiUrl: string;
  externalPrompt?: { system: string; user: string } | null;
}

interface PromptLayer {
  name: string;
  content: string;
}

function parseLayers(promptText: string): PromptLayer[] {
  const parts = promptText.split(/^(=== .+ ===)$/m);
  const layers: PromptLayer[] = [];
  // Content before first marker
  const preamble = (parts[0] || '').trim();
  if (preamble) layers.push({ name: 'Preamble', content: preamble });
  // Marker + content pairs
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].replace(/^=== | ===$/g, '');
    const content = (parts[i + 1] || '').trim();
    if (content) layers.push({ name, content });
  }
  return layers;
}

const LAYER_COLORS: Record<string, string> = {
  'PROGRAM CONTEXT': '#7c3aed',
  'SECTION BLUEPRINT': '#2b6cb0',
  'MINI-SECTIONS': '#0d9488',
  'LEARNER CONTEXT': '#dd6b20',
  'LEARNER DATA': '#dd6b20',
  'EXPECTED ARTIFACTS': '#e53e3e',
  'SESSION CONTEXT': '#38a169',
  'MENTOR BRIEF': '#805ad5',
};

const DEFAULT_PROFILE = {
  industry: 'Healthcare',
  company_name: 'MedTech Solutions',
  role: 'Chief Technology Officer',
  ai_maturity_level: 3,
  goal: 'Implement AI-driven diagnostic support systems',
  company_size: '500-1000',
  identified_use_case: 'Clinical decision support',
};

export default function PromptDebuggerPanel({ lessonId, token, apiUrl, externalPrompt }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [layers, setLayers] = useState<PromptLayer[]>([]);
  const [rawUser, setRawUser] = useState('');
  const [viewMode, setViewMode] = useState<'layered' | 'full'>('layered');
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());
  const [tokenCount, setTokenCount] = useState<number | null>(null);

  const loadPrompt = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/simulate/section/${lessonId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ testProfile: DEFAULT_PROFILE, testVariables: {} }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      applyPrompt(data.promptUsed?.system || '', data.promptUsed?.user || '');
      setTokenCount(data.tokenCount || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load prompt');
    } finally {
      setLoading(false);
    }
  }, [lessonId, token, apiUrl]);

  const applyPrompt = (sys: string, user: string) => {
    setSystemPrompt(sys);
    setRawUser(user);
    const parsed = parseLayers(user);
    setLayers(parsed);
    // Auto-expand all layers
    setExpandedLayers(new Set(parsed.map((_, i) => i)));
  };

  // Apply external prompt if provided (from simulation result)
  React.useEffect(() => {
    if (externalPrompt) {
      applyPrompt(externalPrompt.system, externalPrompt.user);
    }
  }, [externalPrompt]);

  const toggleLayer = (index: number) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div
        className="card-header bg-white py-2 d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="fw-semibold small">
          <i className="bi bi-layers me-1" style={{ color: 'var(--color-primary, #1a365d)' }}></i>
          Prompt Debugger
          {layers.length > 0 && (
            <span className="badge bg-primary ms-1" style={{ fontSize: 8 }}>{layers.length} layers</span>
          )}
        </span>
        <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'} text-muted`} style={{ fontSize: 11 }}></i>
      </div>

      {!collapsed && (
        <div className="card-body py-2">
          {/* Controls */}
          <div className="d-flex gap-2 mb-2 align-items-center">
            {!externalPrompt && (
              <button
                className="btn btn-sm btn-outline-primary py-0 px-2"
                style={{ fontSize: 10 }}
                onClick={loadPrompt}
                disabled={loading || !lessonId}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}></span>Loading...</>
                ) : (
                  <><i className="bi bi-bug me-1"></i>Inspect Prompt</>
                )}
              </button>
            )}
            {layers.length > 0 && (
              <div className="btn-group btn-group-sm ms-auto">
                <button
                  className={`btn btn-sm py-0 px-2 ${viewMode === 'layered' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  style={{ fontSize: 9 }}
                  onClick={() => setViewMode('layered')}
                >
                  Layered
                </button>
                <button
                  className={`btn btn-sm py-0 px-2 ${viewMode === 'full' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  style={{ fontSize: 9 }}
                  onClick={() => setViewMode('full')}
                >
                  Full
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: 10 }}>
              <i className="bi bi-exclamation-triangle me-1"></i>{error}
            </div>
          )}

          {tokenCount != null && (
            <div className="text-muted mb-2" style={{ fontSize: 9 }}>
              <i className="bi bi-hash me-1"></i>{tokenCount.toLocaleString()} tokens
            </div>
          )}

          {layers.length === 0 && !loading && !error && (
            <div className="text-center text-muted py-3" style={{ fontSize: 11 }}>
              <i className="bi bi-layers d-block mb-1" style={{ fontSize: 24 }}></i>
              Click "Inspect Prompt" to view the 7-layer composite prompt
            </div>
          )}

          {/* System Prompt (always separate) */}
          {systemPrompt && (
            <div className="mb-2">
              <button
                className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100 mb-1"
                onClick={() => toggleLayer(-1)}
                style={{ fontSize: 10, color: '#e53e3e' }}
              >
                <i className={`bi bi-chevron-${expandedLayers.has(-1) ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
                <i className="bi bi-shield-lock"></i>
                <span className="fw-semibold">System Prompt</span>
              </button>
              {expandedLayers.has(-1) && (
                <pre className="p-2 rounded mb-0" style={{ fontSize: 9, maxHeight: 200, overflow: 'auto', background: '#1a202c', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {systemPrompt}
                </pre>
              )}
            </div>
          )}

          {/* Layered View */}
          {viewMode === 'layered' && layers.map((layer, i) => {
            const color = LAYER_COLORS[layer.name] || '#718096';
            return (
              <div key={i} className="mb-2">
                <button
                  className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100 mb-1"
                  onClick={() => toggleLayer(i)}
                  style={{ fontSize: 10, color }}
                >
                  <i className={`bi bi-chevron-${expandedLayers.has(i) ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
                  <span className="badge" style={{ fontSize: 7, background: `${color}18`, color, border: `1px solid ${color}30`, minWidth: 16 }}>
                    {i + 1}
                  </span>
                  <span className="fw-semibold">{layer.name}</span>
                  <span className="text-muted ms-auto" style={{ fontSize: 8 }}>{layer.content.length} chars</span>
                </button>
                {expandedLayers.has(i) && (
                  <pre className="p-2 rounded mb-0 ms-3" style={{ fontSize: 9, maxHeight: 250, overflow: 'auto', background: '#1a202c', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderLeft: `3px solid ${color}` }}>
                    {layer.content}
                  </pre>
                )}
              </div>
            );
          })}

          {/* Full View */}
          {viewMode === 'full' && rawUser && (
            <pre className="p-2 rounded" style={{ fontSize: 9, maxHeight: 500, overflow: 'auto', background: '#1a202c', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {rawUser}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
