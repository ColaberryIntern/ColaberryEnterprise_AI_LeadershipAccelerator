import React, { useState, useEffect, useMemo } from 'react';
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
  onPromptCaptured?: (prompt: { system: string; user: string }) => void;
}

// ── Random Test Data ────────────────────────────────────────────

const RANDOM_INDUSTRIES = ['Healthcare', 'Financial Services', 'Retail', 'Manufacturing', 'Technology', 'Energy & Utilities', 'Education', 'Logistics & Supply Chain', 'Government', 'Media & Entertainment'];
const RANDOM_COMPANIES = ['Meridian Health Systems', 'Atlas Capital Group', 'NovaTech Industries', 'Pinnacle Logistics', 'Summit Energy Corp', 'Horizon Retail Group', 'Catalyst Manufacturing', 'Vertex Financial', 'Beacon Education Partners', 'Frontier Media Inc.'];
const RANDOM_ROLES = ['Chief Technology Officer', 'VP of Operations', 'Director of Strategy', 'Chief Data Officer', 'Head of Innovation', 'SVP Digital Transformation', 'Director of IT', 'Chief Operating Officer'];
const RANDOM_GOALS = ['Implement AI-driven process automation', 'Build predictive analytics capability', 'Automate compliance and risk management', 'Deploy AI customer service solutions', 'Create AI-powered decision support', 'Optimize supply chain with ML', 'Develop AI governance framework', 'Scale AI from pilot to production'];
const RANDOM_USE_CASES = ['Process automation', 'Predictive analytics', 'Customer service AI', 'Fraud detection', 'Demand forecasting', 'Document processing', 'Quality control', 'Risk assessment'];
const RANDOM_SIZES = ['50-249', '250-999', '1000-4999', '5000+'];
const RANDOM_VAR_VALUES: Record<string, string[]> = {
  department_focus: ['Engineering', 'Operations', 'Finance', 'Marketing', 'HR', 'Sales', 'Customer Support'],
  specific_challenge: ['Data silos across teams', 'Manual reporting overhead', 'Slow decision cycles', 'Talent retention', 'Customer churn'],
  current_process: ['Manual spreadsheet tracking', 'Email-based approvals', 'Quarterly reviews', 'Ad-hoc reporting'],
  desired_outcome: ['Real-time dashboards', '50% faster processing', 'Automated compliance', 'Predictive alerts'],
  key_stakeholders: ['CEO, CFO, CTO', 'Board of Directors', 'Department Heads', 'IT Team Lead'],
  timeline: ['30 days', '60 days', '90 days', '6 months'],
  scope_area: ['Customer-facing operations', 'Internal processes', 'Supply chain', 'Financial reporting'],
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randomProfile(): TestProfile {
  return {
    industry: pick(RANDOM_INDUSTRIES),
    company_name: pick(RANDOM_COMPANIES),
    role: pick(RANDOM_ROLES),
    ai_maturity_level: Math.floor(Math.random() * 5) + 1,
    goal: pick(RANDOM_GOALS),
    company_size: pick(RANDOM_SIZES),
    identified_use_case: pick(RANDOM_USE_CASES),
  };
}

function randomVarValue(key: string): string {
  const pool = RANDOM_VAR_VALUES[key];
  if (pool) return pick(pool);
  return `test_${key}_${Math.floor(Math.random() * 100)}`;
}

// ── Preset Profiles ─────────────────────────────────────────────

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

// ── Profile field keys for auto-fill detection ──────────────────

const PROFILE_KEYS = ['industry', 'company_name', 'company', 'role', 'goal', 'ai_maturity_level', 'company_size', 'identified_use_case', 'full_name', 'email', 'title', 'sector'];

// ── Component ───────────────────────────────────────────────────

export default function TestSimulationPanel({ miniSections, lessonTitle, lessonId, token, apiUrl, onPromptCaptured }: Props) {
  const [profile, setProfile] = useState<TestProfile>(PRESET_PROFILES[0].profile);
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ content: MockV2Content | null; prompt: { system: string; user: string } | null; meta: { tokens: number; durationMs: number; model: string; status: string; error?: string } } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [history, setHistory] = useState<SimulationHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [readiness, setReadiness] = useState<any>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Collect variable keys from mini-sections
  const associatedVarKeys = useMemo(() => Array.from(new Set(
    miniSections.flatMap(ms => ms.associated_variable_keys || [])
  )), [miniSections]);

  const createsVarKeys = useMemo(() => Array.from(new Set(
    miniSections.flatMap(ms => ms.creates_variable_keys || [])
  )), [miniSections]);

  const allVarKeys = useMemo(() => Array.from(new Set([...associatedVarKeys, ...createsVarKeys])), [associatedVarKeys, createsVarKeys]);

  // Variable collection preview — what auto-fills vs what prompts the learner
  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    map.industry = profile.industry;
    map.sector = profile.industry;
    map.company_name = profile.company_name;
    map.company = profile.company_name;
    map.role = profile.role;
    map.goal = profile.goal;
    map.ai_maturity_level = String(profile.ai_maturity_level);
    if (profile.company_size) map.company_size = profile.company_size;
    if (profile.identified_use_case) { map.identified_use_case = profile.identified_use_case; map.use_case = profile.identified_use_case; }
    // Merge test variables
    for (const [k, v] of Object.entries(testVariables)) {
      if (v) map[k] = v;
    }
    return map;
  }, [profile, testVariables]);

  const autoFilledVars = useMemo(() =>
    associatedVarKeys.filter(k => profileMap[k]).map(k => ({ key: k, value: profileMap[k] })),
    [associatedVarKeys, profileMap]
  );

  const unansweredVars = useMemo(() =>
    associatedVarKeys.filter(k => !profileMap[k] && !PROFILE_KEYS.includes(k)),
    [associatedVarKeys, profileMap]
  );

  // Custom variables (not profile fields)
  const customVarKeys = useMemo(() =>
    allVarKeys.filter(k => !PROFILE_KEYS.includes(k)),
    [allVarKeys]
  );

  useEffect(() => {
    if (lessonId) fetchHistory();
  }, [lessonId]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/simulate/section/${lessonId}/history`, { headers });
      if (res.ok) setHistory(await res.json());
    } catch { /* non-critical */ }
  };

  const checkReadiness = async () => {
    setReadinessLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/ai-readiness`, { method: 'POST', headers });
      if (res.ok) setReadiness(await res.json());
    } catch {}
    setReadinessLoading(false);
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
      const promptUsed = data.promptUsed || null;
      setResult({
        content: data.content || null,
        prompt: promptUsed,
        meta: {
          tokens: data.tokenCount || 0,
          durationMs: data.durationMs || 0,
          model: data.modelUsed || '',
          status: data.status || 'completed',
          error: data.error,
        },
      });
      if (promptUsed && onPromptCaptured) onPromptCaptured(promptUsed);
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

  const handleRandomize = () => {
    setProfile(randomProfile());
    const randomVars: Record<string, string> = {};
    for (const key of customVarKeys) {
      randomVars[key] = randomVarValue(key);
    }
    setTestVariables(randomVars);
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
        <div className="d-flex gap-1 mb-2 flex-wrap align-items-center">
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
          <button className="btn btn-sm btn-outline-warning" onClick={handleRandomize} style={{ fontSize: 10 }}>
            <i className="bi bi-shuffle me-1"></i>Randomize All
          </button>
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
          <div className="col-5">
            <label className="form-label mb-0 small fw-medium">Goal</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })} />
          </div>
          <div className="col-4">
            <label className="form-label mb-0 small fw-medium">Company Size</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.company_size || ''} onChange={e => setProfile({ ...profile, company_size: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label mb-0 small fw-medium">Identified Use Case</label>
            <input className="form-control form-control-sm" style={{ fontSize: 11 }} value={profile.identified_use_case || ''} onChange={e => setProfile({ ...profile, identified_use_case: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Custom Variable Overrides */}
      {customVarKeys.length > 0 && (
        <div className="mb-2">
          <div className="d-flex align-items-center gap-2 mb-1">
            <label className="form-label small fw-medium mb-0">Custom Variables</label>
            <button
              className="btn btn-outline-warning py-0 px-1"
              style={{ fontSize: 9 }}
              onClick={() => {
                const randomVars: Record<string, string> = {};
                for (const key of customVarKeys) randomVars[key] = randomVarValue(key);
                setTestVariables(randomVars);
              }}
            >
              <i className="bi bi-shuffle me-1"></i>Randomize
            </button>
          </div>
          <div className="row g-1">
            {customVarKeys.map(key => (
              <div key={key} className="col-6">
                <div className="input-group input-group-sm">
                  <span className="input-group-text" style={{ fontSize: 9, maxWidth: 120 }}>{key}</span>
                  <input className="form-control" style={{ fontSize: 10 }} value={testVariables[key] || ''} onChange={e => setTestVariables({ ...testVariables, [key]: e.target.value })} placeholder="test value..." />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variable Collection Preview — simulates the learner's experience */}
      <div className="mb-2 border-top pt-2">
        <div className="d-flex align-items-center gap-2 mb-1">
          <i className="bi bi-input-cursor-text" style={{ fontSize: 12, color: 'var(--color-primary-light)' }}></i>
          <span className="fw-semibold small">Variable Collection Preview</span>
          <span className="text-muted" style={{ fontSize: 10 }}>What the learner sees when running a prompt template</span>
        </div>

        {/* Auto-filled from profile */}
        <div className="mb-1 d-flex flex-wrap gap-1 align-items-center" style={{ fontSize: 10 }}>
          <span className="text-muted fw-medium me-1">Auto-filled:</span>
          {autoFilledVars.length === 0 ? (
            <span className="text-muted" style={{ fontSize: 9 }}>None</span>
          ) : autoFilledVars.map(v => (
            <span key={v.key} className="badge bg-success-subtle text-success border" style={{ fontSize: 9 }}>
              {v.key}: {v.value.length > 20 ? v.value.slice(0, 20) + '...' : v.value}
            </span>
          ))}
        </div>

        {/* Unanswered — would prompt learner */}
        <div className="mb-1 d-flex flex-wrap gap-1 align-items-center" style={{ fontSize: 10 }}>
          <span className="text-muted fw-medium me-1">Would prompt learner:</span>
          {unansweredVars.length === 0 ? (
            <span className="text-muted" style={{ fontSize: 9 }}>None &mdash; all variables answered</span>
          ) : unansweredVars.map(v => (
            <span key={v} className="badge bg-warning-subtle text-warning border" style={{ fontSize: 9 }}>
              {`{{${v}}}`} &mdash; unanswered
            </span>
          ))}
        </div>

        {/* Creates new variables */}
        <div className="d-flex flex-wrap gap-1 align-items-center" style={{ fontSize: 10 }}>
          <span className="text-muted fw-medium me-1">Creates new:</span>
          {createsVarKeys.length === 0 ? (
            <span className="text-muted" style={{ fontSize: 9 }}>None</span>
          ) : createsVarKeys.map(v => (
            <span key={v} className="badge bg-info-subtle text-info border" style={{ fontSize: 9 }}>
              {`{{${v}}}`} &mdash; output
            </span>
          ))}
        </div>
      </div>

      {/* Run Button + Readiness Check */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <button className="btn btn-sm btn-outline-info" onClick={checkReadiness} disabled={readinessLoading}>
          {readinessLoading ? (
            <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Checking...</>
          ) : (
            <><i className="bi bi-shield-check me-1"></i>Readiness Check</>
          )}
        </button>
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

      {/* Readiness Result */}
      {readiness && (
        <div className={`alert ${readiness.readinessScore >= 80 ? 'alert-success' : readiness.readinessScore >= 50 ? 'alert-warning' : 'alert-danger'} py-2 mb-3`} style={{ fontSize: 11 }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>AI Readiness: {readiness.readinessScore}%</strong>
            <button className="btn-close" style={{ fontSize: 8 }} onClick={() => setReadiness(null)} />
          </div>
          <div className="d-flex gap-2 mb-1 flex-wrap">
            {Object.entries(readiness.stages || {}).map(([key, stage]: [string, any]) => (
              <span key={key} className={`badge ${stage.ready ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 8 }}>
                {key.replace(/([A-Z])/g, ' $1').trim()}
                {stage.ready ? ' \u2713' : ' \u2717'}
              </span>
            ))}
          </div>
          {readiness.blockers?.length > 0 && (
            <div className="mt-1">
              <strong style={{ fontSize: 10 }}>Blockers:</strong>
              <ul className="mb-0 ps-3" style={{ fontSize: 10 }}>
                {readiness.blockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
          {readiness.recommendations?.length > 0 && (
            <div className="mt-1">
              <strong style={{ fontSize: 10 }}>Recommendations:</strong>
              <ul className="mb-0 ps-3" style={{ fontSize: 10 }}>
                {readiness.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

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
