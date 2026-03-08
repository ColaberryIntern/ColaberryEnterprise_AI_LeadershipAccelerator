import React, { useState, useEffect } from 'react';
import PreviewPanel from './PreviewPanel';
import { MockV2Content } from './mockDataGenerator';

interface MiniSectionInput {
  id: string;
  mini_section_type: string;
  title: string;
  description: string;
  mini_section_order: number;
  associated_skill_ids?: string[];
  associated_variable_keys?: string[];
  creates_variable_keys?: string[];
  creates_artifact_ids?: string[];
  knowledge_check_config?: { enabled: boolean; question_count: number; pass_score: number } | null;
}

interface TestProfile {
  industry: string;
  company_name: string;
  role: string;
  ai_maturity_level: number;
  goal: string;
  company_size?: string;
  identified_use_case?: string;
}

interface SimulationHistoryItem {
  id: string;
  test_profile_json: TestProfile;
  status: 'pending' | 'completed' | 'failed';
  model_used: string;
  token_count: number;
  duration_ms: number;
  created_at: string;
  error_message?: string;
}

interface Props {
  miniSections: MiniSectionInput[];
  lessonTitle: string;
  lessonId: string;
  token: string;
  apiUrl: string;
}

const PRESET_PROFILES: { label: string; profile: TestProfile }[] = [
  {
    label: 'Healthcare CTO',
    profile: { industry: 'Healthcare', company_name: 'MedTech Solutions', role: 'Chief Technology Officer', ai_maturity_level: 3, goal: 'Implement AI-driven diagnostic support systems', company_size: '500-1000', identified_use_case: 'Clinical decision support' },
  },
  {
    label: 'Retail VP Ops',
    profile: { industry: 'Retail', company_name: 'GlobalMart Inc.', role: 'VP of Operations', ai_maturity_level: 2, goal: 'Optimize supply chain with predictive analytics', company_size: '5000+', identified_use_case: 'Demand forecasting' },
  },
  {
    label: 'Finance Director',
    profile: { industry: 'Financial Services', company_name: 'Apex Capital Partners', role: 'Director of Strategy', ai_maturity_level: 4, goal: 'Automate compliance reporting and risk assessment', company_size: '200-500', identified_use_case: 'Regulatory compliance automation' },
  },
];

export default function TestSimulationPanel({ miniSections, lessonTitle, lessonId, token, apiUrl }: Props) {
  const [profile, setProfile] = useState<TestProfile>(PRESET_PROFILES[0].profile);
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ content: MockV2Content | null; prompt: { system: string; user: string } | null; meta: { tokens: number; durationMs: number; model: string; status: string; error?: string } } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [history, setHistory] = useState<SimulationHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Collect all variable keys from mini-sections
  const allVarKeys = Array.from(new Set(
    miniSections.flatMap(ms => [...(ms.associated_variable_keys || []), ...(ms.creates_variable_keys || [])])
  ));

  useEffect(() => {
    if (lessonId) fetchHistory();
  }, [lessonId]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/simulate/section/${lessonId}/history`, { headers });
      if (res.ok) setHistory(await res.json());
    } catch { /* non-critical */ }
  };

  const runSimulation = async () => {
    if (!lessonId || miniSections.length === 0) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/simulate/section/${lessonId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ testProfile: profile, testVariables }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Simulation failed');
      setResult({
        content: data.content || null,
        prompt: data.promptUsed || null,
        meta: {
          tokens: data.tokenCount || 0,
          durationMs: data.durationMs || 0,
          model: data.modelUsed || '',
          status: data.status || 'completed',
          error: data.error,
        },
      });
      fetchHistory();
    } catch (err: any) {
      setResult({
        content: null,
        prompt: null,
        meta: { tokens: 0, durationMs: 0, model: '', status: 'failed', error: err.message },
      });
    }
    setRunning(false);
  };

  const deleteHistoryItem = async (id: string) => {
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/simulate/${id}`, { method: 'DELETE', headers });
      setHistory(h => h.filter(item => item.id !== id));
    } catch { /* non-critical */ }
  };

  if (miniSections.length === 0) {
    return (
      <div className="text-center py-4">
        <i className="bi bi-robot" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
        <p className="text-muted small mt-2">No mini-sections to simulate. Create mini-sections first.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Profile Selection */}
      <div className="mb-2">
        <div className="d-flex gap-1 mb-2 flex-wrap">
          {PRESET_PROFILES.map(p => (
            <button
              key={p.label}
              className={`btn btn-sm ${profile.company_name === p.profile.company_name ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setProfile(p.profile)}
              style={{ fontSize: 10 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Editable profile fields */}
        <div className="row g-1" style={{ fontSize: 11 }}>
          <div className="col-4">
            <label className="form-label mb-0 small fw-medium">Industry</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.industry} onChange={e => setProfile({ ...profile, industry: e.target.value })} />
          </div>
          <div className="col-4">
            <label className="form-label mb-0 small fw-medium">Company</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.company_name} onChange={e => setProfile({ ...profile, company_name: e.target.value })} />
          </div>
          <div className="col-4">
            <label className="form-label mb-0 small fw-medium">Role</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.role} onChange={e => setProfile({ ...profile, role: e.target.value })} />
          </div>
          <div className="col-3">
            <label className="form-label mb-0 small fw-medium">AI Maturity (1-5)</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} type="number" min={1} max={5} value={profile.ai_maturity_level} onChange={e => setProfile({ ...profile, ai_maturity_level: parseInt(e.target.value) || 1 })} />
          </div>
          <div className="col-9">
            <label className="form-label mb-0 small fw-medium">Goal</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Variable Overrides */}
      {allVarKeys.length > 0 && (
        <div className="mb-2">
          <label className="form-label small fw-medium mb-1">Variable Overrides</label>
          <div className="row g-1">
            {allVarKeys.slice(0, 6).map(key => (
              <div key={key} className="col-6">
                <div className="input-group input-group-sm">
                  <span className="input-group-text" style={{ fontSize: 9, maxWidth: 100 }}>{key}</span>
                  <input className="form-control" style={{ fontSize: 10 }} value={testVariables[key] || ''} onChange={e => setTestVariables({ ...testVariables, [key]: e.target.value })} placeholder="test value..." />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Button */}
      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-sm btn-success" onClick={runSimulation} disabled={running}>
          {running ? (
            <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Running...</>
          ) : (
            <><i className="bi bi-play-fill me-1"></i>Run Simulation</>
          )}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowHistory(!showHistory)}>
          <i className="bi bi-clock-history me-1"></i>History ({history.length})
        </button>
      </div>

      {/* Result */}
      {result && (
        <div>
          {result.meta.status === 'failed' ? (
            <div className="alert alert-danger py-1 small">
              <i className="bi bi-exclamation-triangle me-1"></i>
              Simulation failed: {result.meta.error}
            </div>
          ) : (
            <div>
              <div className="d-flex gap-2 mb-2 align-items-center">
                <span className="badge bg-success" style={{ fontSize: 10 }}>Completed</span>
                <span className="text-muted" style={{ fontSize: 10 }}>{result.meta.tokens} tokens | {(result.meta.durationMs / 1000).toFixed(1)}s | {result.meta.model}</span>
                <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setShowPrompt(!showPrompt)} style={{ fontSize: 10 }}>
                  {showPrompt ? 'Hide' : 'View'} Prompt
                </button>
              </div>
              {showPrompt && result.prompt && (
                <div className="mb-2">
                  <pre className="bg-dark text-light rounded p-2" style={{ fontSize: 10, maxHeight: 200, overflowY: 'auto' }}>
                    <strong className="text-info">SYSTEM:</strong>{'\n'}{result.prompt.system}{'\n\n'}
                    <strong className="text-warning">USER:</strong>{'\n'}{result.prompt.user}
                  </pre>
                </div>
              )}
              {result.content && (
                <PreviewPanel
                  miniSections={miniSections}
                  lessonTitle={lessonTitle}
                  lessonId={lessonId}
                  externalContent={result.content as MockV2Content}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="mt-2">
          <h6 className="small fw-semibold mb-1">Simulation History</h6>
          <div className="d-flex flex-column gap-1">
            {history.map(h => (
              <div key={h.id} className="d-flex justify-content-between align-items-center border rounded px-2 py-1" style={{ fontSize: 10 }}>
                <div>
                  <span className={`badge ${h.status === 'completed' ? 'bg-success' : h.status === 'failed' ? 'bg-danger' : 'bg-warning'} me-1`} style={{ fontSize: 8 }}>{h.status}</span>
                  <span className="fw-medium">{h.test_profile_json?.role} @ {h.test_profile_json?.company_name}</span>
                  <span className="text-muted ms-1">({h.test_profile_json?.industry})</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted">{h.token_count} tok | {((h.duration_ms || 0) / 1000).toFixed(1)}s</span>
                  <span className="text-muted">{new Date(h.created_at).toLocaleString()}</span>
                  <button className="btn btn-sm btn-outline-danger py-0 px-1" onClick={() => deleteHistoryItem(h.id)} style={{ fontSize: 9 }}>
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
