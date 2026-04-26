/**
 * System View V2 — Foundation Layer
 *
 * 3-section layout: System Map | Work Area | Control Panel
 * Reuses existing APIs — no new backend endpoints
 * componentId sync via URL param + local state
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import ProjectSetupWizard from '../../components/project/ProjectSetupWizard';
import ProjectSelectionScreen from '../../components/project/ProjectSelectionScreen';
import SystemIntelligencePanel from '../../components/project/SystemIntelligencePanel';

// ---------------------------------------------------------------------------
// Types (reused from SystemBlueprint pattern)
// ---------------------------------------------------------------------------

interface UIPage {
  name: string;
  route: string;
  source: 'mapped' | 'discovered';
  verified: boolean;
  confidence: number; // 0-100
  bpId: string;
}

interface SystemComponent {
  id: string;
  name: string;
  description: string;
  status: 'complete' | 'in_progress' | 'not_started';
  completion: number;
  maturity: string;
  maturityLevel: number;
  nextStep: string | null;
  promptTarget: string | null;
  isPageBP: boolean;
  isDiscovered: boolean;
  source: string;
  frontendRoute: string | null;
  coverageRaw: number;
  readinessRaw: number;
  layers: { backend: string; frontend: string; agent: string };
  ui: { pages: UIPage[] };
}

interface ProjectData {
  id: string;
  organization_name?: string;
  industry?: string;
  project_stage: string;
  project_variables?: Record<string, any>;
  setup_status?: { requirements_loaded: boolean; claude_md_loaded: boolean; github_connected: boolean; activated: boolean } | null;
}

// ---------------------------------------------------------------------------
// Transform (same logic as SystemBlueprint — no duplication of business rules)
// ---------------------------------------------------------------------------

const MATURITY_LABELS: Record<number, string> = {
  0: 'L0 Not Started', 1: 'L1 Prototype', 2: 'L2 Functional',
  3: 'L3 Production', 4: 'L4 Autonomous', 5: 'L5 Self-Optimizing',
};

const MATURITY_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#8b5cf6',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  complete: { bg: '#10b98120', text: '#059669', label: 'Complete' },
  in_progress: { bg: '#f59e0b20', text: '#92400e', label: 'In Progress' },
  not_started: { bg: '#e2e8f020', text: '#9ca3af', label: 'Not Started' },
};

function transformBPs(bps: any[]): SystemComponent[] {
  return bps
    .filter((bp: any) => (bp.applicability_status || 'active') === 'active')
    .map((bp: any) => {
      const coverage = bp.metrics?.requirements_coverage || 0;
      const readiness = bp.metrics?.system_readiness || 0;
      const maturityLevel = bp.maturity?.level || 0;
      const isComplete = bp.is_complete === true || (coverage >= 90 && readiness >= 90);
      const isPageBP = bp.source === 'frontend_page' || bp.is_page_bp === true;
      const bpSource = bp.source || 'unknown';
      const hasExecPlan = (bp.execution_plan || []).length > 0;
      const u = bp.usability || {};

      let status: 'complete' | 'in_progress' | 'not_started';
      if (isComplete) status = 'complete';
      else if (coverage > 10 || readiness > 10 || maturityLevel >= 1) status = 'in_progress';
      else status = 'not_started';

      const completion = Math.round(Math.max(coverage, readiness));
      const firstStep = (bp.execution_plan || []).find((s: any) => !s.blocked);

      return {
        id: bp.id,
        name: bp.name,
        description: bp.description || '',
        status,
        completion,
        maturity: MATURITY_LABELS[maturityLevel] || `L${maturityLevel}`,
        maturityLevel,
        nextStep: firstStep?.label || null,
        promptTarget: firstStep?.prompt_target || null,
        isPageBP,
        isDiscovered: bpSource === 'repo_discovered' || (isPageBP && bpSource === 'frontend_page') || (!hasExecPlan && !isComplete && completion === 0 && maturityLevel === 0 && !isPageBP && bpSource !== 'auto'),
        source: bpSource,
        frontendRoute: bp.frontend_route || null,
        coverageRaw: Math.round(coverage),
        readinessRaw: Math.round(readiness),
        layers: {
          backend: u.backend || 'missing',
          frontend: u.frontend || 'missing',
          agent: u.agent || 'missing',
        },
        ui: {
          pages: bp.frontend_route ? [{
            name: bp.name,
            route: bp.frontend_route,
            source: 'mapped' as const,
            verified: true,
            confidence: 100,
            bpId: bp.id,
          }] : [],
        },
      };
    })
    .sort((a, b) => {
      if (a.status === 'complete' && b.status !== 'complete') return 1;
      if (a.status !== 'complete' && b.status === 'complete') return -1;
      return 0;
    });
}

// ---------------------------------------------------------------------------
// Grouping Engine (deterministic, keyword-based)
// ---------------------------------------------------------------------------

interface ComponentGroup {
  key: string;
  title: string;
  icon: string;
  color: string;
  items: SystemComponent[];
  completion: number;
}

const FOUNDATION_KEYWORDS = /data|api|integrat|backend|service|database|model|auth|security|error|resilien|performance|monitor|observ/i;
const USABILITY_KEYWORDS = /page|ui|management|dashboard|landing|contact|enroll|advisory|case.stud|alumni|campaign|lead|setting|detail|overview|success|cancel|freight|utility|champion/i;
const INTELLIGENCE_KEYWORDS = /agent|automat|monitor|analytics|ai\b|intelligen|train|adopt|feedback|engag/i;

export function groupComponents(components: SystemComponent[]): ComponentGroup[] {
  const foundation: SystemComponent[] = [];
  const usability: SystemComponent[] = [];
  const intelligence: SystemComponent[] = [];
  const discovered: SystemComponent[] = [];

  for (const c of components) {
    // Discovered/unmapped go to their own group (unless promoted)
    if (c.isDiscovered) { discovered.push(c); continue; }
    const name = c.name.toLowerCase();
    // Keyword matching with priority
    if (INTELLIGENCE_KEYWORDS.test(name)) { intelligence.push(c); continue; }
    if (FOUNDATION_KEYWORDS.test(name)) { foundation.push(c); continue; }
    if (USABILITY_KEYWORDS.test(name)) { usability.push(c); continue; }
    // Fallback: if it has backend layer → foundation, else usability
    if (c.layers.backend === 'ready' || c.layers.backend === 'partial') { foundation.push(c); }
    else { usability.push(c); }
  }

  const groups: ComponentGroup[] = [];
  const calcCompletion = (items: SystemComponent[]) => items.length > 0 ? Math.round(items.reduce((s, c) => s + c.completion, 0) / items.length) : 0;

  if (foundation.length > 0) groups.push({ key: 'foundation', title: 'Foundation', icon: 'bi-bricks', color: '#3b82f6', items: foundation, completion: calcCompletion(foundation) });
  if (usability.length > 0) groups.push({ key: 'usability', title: 'Usability', icon: 'bi-layout-wtf', color: '#10b981', items: usability, completion: calcCompletion(usability) });
  if (intelligence.length > 0) groups.push({ key: 'intelligence', title: 'Intelligence', icon: 'bi-cpu', color: '#8b5cf6', items: intelligence, completion: calcCompletion(intelligence) });
  if (discovered.length > 0) groups.push({ key: 'discovered', title: `Discovered Pages (${discovered.length})`, icon: 'bi-search', color: '#a855f7', items: discovered, completion: calcCompletion(discovered) });

  return groups;
}

// ---------------------------------------------------------------------------
// Business Domain Grouping (enterprise-oriented alternative)
// ---------------------------------------------------------------------------

const BIZ_REVENUE = /lead|pipeline|campaign|enrollment|enroll|sales|revenue|opportunity|pricing|sponsor/i;
const BIZ_MARKETING = /landing|outreach|engagement|content|marketing|case.stud|advisory|champion|program/i;
const BIZ_OPERATIONS = /user.manage|workflow|onboard|ticket|deploy|error|resilien|security|auth/i;
const BIZ_PRODUCT = /dashboard|page|ui|setting|detail|management|overview|contact|strategy/i;
const BIZ_INTELLIGENCE = /ai\b|agent|automat|monitor|analytics|report|intel|train|adopt|feedback|performance|observ|search|data.*integrat/i;

export function groupByBusinessDomain(components: SystemComponent[]): ComponentGroup[] {
  const revenue: SystemComponent[] = [];
  const marketing: SystemComponent[] = [];
  const operations: SystemComponent[] = [];
  const product: SystemComponent[] = [];
  const intelligence: SystemComponent[] = [];
  const discovered: SystemComponent[] = [];

  for (const c of components) {
    if (c.isDiscovered) { discovered.push(c); continue; }
    const name = c.name.toLowerCase();
    if (BIZ_REVENUE.test(name)) { revenue.push(c); continue; }
    if (BIZ_INTELLIGENCE.test(name)) { intelligence.push(c); continue; }
    if (BIZ_MARKETING.test(name)) { marketing.push(c); continue; }
    if (BIZ_OPERATIONS.test(name)) { operations.push(c); continue; }
    if (BIZ_PRODUCT.test(name)) { product.push(c); continue; }
    // Fallback
    if (c.layers.backend === 'ready' || c.layers.backend === 'partial') operations.push(c);
    else product.push(c);
  }

  const groups: ComponentGroup[] = [];
  const calc = (items: SystemComponent[]) => items.length > 0 ? Math.round(items.reduce((s, c) => s + c.completion, 0) / items.length) : 0;
  if (revenue.length > 0) groups.push({ key: 'revenue', title: 'Revenue', icon: 'bi-currency-dollar', color: '#10b981', items: revenue, completion: calc(revenue) });
  if (operations.length > 0) groups.push({ key: 'operations', title: 'Operations', icon: 'bi-gear', color: '#3b82f6', items: operations, completion: calc(operations) });
  if (marketing.length > 0) groups.push({ key: 'marketing', title: 'Marketing', icon: 'bi-megaphone', color: '#f59e0b', items: marketing, completion: calc(marketing) });
  if (product.length > 0) groups.push({ key: 'product', title: 'Product', icon: 'bi-box', color: '#8b5cf6', items: product, completion: calc(product) });
  if (intelligence.length > 0) groups.push({ key: 'intelligence', title: 'Intelligence', icon: 'bi-cpu', color: '#06b6d4', items: intelligence, completion: calc(intelligence) });
  if (discovered.length > 0) groups.push({ key: 'discovered', title: `Discovered Pages (${discovered.length})`, icon: 'bi-search', color: '#a855f7', items: discovered, completion: calc(discovered) });
  return groups;
}

// ---------------------------------------------------------------------------
// Component Purpose (deterministic, keyword-based)
// ---------------------------------------------------------------------------

export function getComponentPurpose(name: string): string {
  const n = name.toLowerCase();
  if (/lead/i.test(n)) return 'Collect and qualify incoming leads to drive revenue growth.';
  if (/campaign/i.test(n)) return 'Design, execute, and track marketing campaigns to reach your audience.';
  if (/pipeline|opportunity/i.test(n)) return 'Manage sales pipeline stages to convert prospects into customers.';
  if (/enroll/i.test(n)) return 'Handle enrollment workflows from signup to activation.';
  if (/user.*(manage|role)/i.test(n)) return 'Manage user accounts, roles, and permissions across the system.';
  if (/engag|feedback/i.test(n)) return 'Capture and act on user feedback to improve retention and product quality.';
  if (/ai.*adopt|train/i.test(n)) return 'Guide AI adoption and training across your organization.';
  if (/monitor|observ/i.test(n)) return 'Track system health, detect anomalies, and ensure reliable operation.';
  if (/analytics|report/i.test(n)) return 'Generate insights and reports to inform strategic decisions.';
  if (/workflow|automat/i.test(n)) return 'Automate repetitive processes to reduce manual effort.';
  if (/security|compliance/i.test(n)) return 'Protect data and ensure regulatory compliance.';
  if (/error|resilien/i.test(n)) return 'Handle failures gracefully and ensure system reliability.';
  if (/performance|optim/i.test(n)) return 'Optimize system speed and resource efficiency.';
  if (/content/i.test(n)) return 'Create, manage, and deliver content to your audience.';
  if (/onboard/i.test(n)) return 'Guide new users through setup and first-time experience.';
  if (/search|discover/i.test(n)) return 'Enable users to find information quickly and efficiently.';
  if (/deploy|infra/i.test(n)) return 'Manage deployment pipelines and infrastructure.';
  if (/test|quality/i.test(n)) return 'Ensure code quality through testing and validation.';
  if (/api|integrat/i.test(n)) return 'Connect systems through well-defined API interfaces.';
  if (/data.*manage/i.test(n)) return 'Organize, store, and process data reliably.';
  if (/market|outreach/i.test(n)) return 'Reach potential customers through targeted outreach.';
  if (/dashboard/i.test(n)) return 'Provide visual overview of key metrics and system state.';
  return `Enable ${name} capabilities within your system.`;
}

export function getSystemSummary(components: SystemComponent[]): string {
  const mapped = components.filter(c => !c.isDiscovered && !c.isPageBP);
  if (mapped.length === 0) return 'an AI-powered system';
  const domains = new Set<string>();
  for (const c of mapped) {
    const n = c.name.toLowerCase();
    if (/lead|pipeline|campaign|sales|revenue/i.test(n)) domains.add('lead generation');
    if (/train|adopt|learn|curriculum/i.test(n)) domains.add('training');
    if (/monitor|analytics|report/i.test(n)) domains.add('analytics');
    if (/automat|workflow|agent/i.test(n)) domains.add('automation');
    if (/engag|feedback|user/i.test(n)) domains.add('user engagement');
    if (/content|market/i.test(n)) domains.add('content delivery');
  }
  const domainList = [...domains].slice(0, 3);
  if (domainList.length === 0) return 'an AI-powered enterprise system';
  return `an AI-powered ${domainList.join(', ')} platform`;
}

export function getNextComponents(components: SystemComponent[], max: number = 3): Set<string> {
  return new Set(
    components
      .filter(c => c.status !== 'complete')
      .sort((a, b) => a.completion - b.completion)
      .slice(0, max)
      .map(c => c.id)
  );
}

// ---------------------------------------------------------------------------
// System Map Tile
// ---------------------------------------------------------------------------

const LAYER_COLORS: Record<string, string> = { ready: '#10b981', partial: '#f59e0b', missing: '#e2e8f0', 'n/a': '#e2e8f0' };

// ---------------------------------------------------------------------------
// Cory Panel — contextual AI assistant embedded in Work Area tabs
// ---------------------------------------------------------------------------

function CoryInlinePanel({ suggestions, coryInput, setCoryInput, coryMessages, coryAsking, onAsk, onApply, tabContext, chatEndRef }: {
  suggestions: Array<{ title: string; explanation: string; action?: string }>;
  coryInput: string;
  setCoryInput: (v: string) => void;
  coryMessages: Array<{ role: 'user' | 'cory'; text: string }>;
  coryAsking: boolean;
  onAsk: () => void;
  onApply?: (action: string) => void;
  tabContext: string;
  chatEndRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="mt-3 p-3" style={{ background: '#f0f4ff', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <i className="bi bi-robot" style={{ color: '#3b82f6', fontSize: 13 }}></i>
        <span className="fw-semibold" style={{ fontSize: 11, color: '#3b82f6' }}>Cory — {tabContext}</span>
      </div>

      {/* Contextual suggestions */}
      {suggestions.length > 0 && coryMessages.length === 0 && (
        <div className="mb-2">
          {suggestions.map((s, i) => (
            <div key={i} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: '#fff', borderRadius: 6, fontSize: 10 }}>
              <i className="bi bi-lightbulb" style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }}></i>
              <div className="flex-grow-1">
                <div className="fw-medium" style={{ fontSize: 11 }}>{s.title}</div>
                <div className="text-muted">{s.explanation}</div>
              </div>
              {s.action && onApply && (
                <button className="btn btn-sm btn-primary" style={{ fontSize: 9, padding: '2px 8px', flexShrink: 0 }} onClick={() => onApply(s.action!)}>
                  <i className="bi bi-play-fill me-1" style={{ fontSize: 8 }}></i>Run
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chat history */}
      {coryMessages.length > 0 && (
        <div className="mb-2" style={{ maxHeight: 250, overflowY: 'auto' }}>
          {coryMessages.map((msg, i) => (
            <div key={i} className={`d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-2`}>
              <div style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.role === 'user' ? 'var(--color-primary)' : '#fff',
                color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}>
                {msg.role === 'cory' && <div className="d-flex align-items-center gap-1 mb-1"><i className="bi bi-robot" style={{ fontSize: 9, color: '#3b82f6' }}></i><span style={{ fontSize: 9, color: '#3b82f6', fontWeight: 600 }}>Cory</span></div>}
                {msg.text}
              </div>
            </div>
          ))}
          {coryAsking && (
            <div className="d-flex justify-content-start mb-2">
              <div style={{ padding: '8px 12px', borderRadius: '12px 12px 12px 2px', background: '#fff', fontSize: 11 }}>
                <span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}></span>
                <span className="text-muted">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef as any}></div>
        </div>
      )}

      {/* Chat input */}
      <div className="d-flex gap-2">
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Ask Cory anything about this component..."
          value={coryInput}
          onChange={e => setCoryInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAsk()}
          disabled={coryAsking}
          style={{ fontSize: 10, borderColor: '#bfdbfe' }}
        />
        <button className="btn btn-sm btn-primary" style={{ fontSize: 10, whiteSpace: 'nowrap' }} disabled={!coryInput.trim() || coryAsking} onClick={onAsk}>
          {coryAsking ? <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }}></span> : <i className="bi bi-send"></i>}
        </button>
      </div>
    </div>
  );
}

function SystemMapTile({ comp, isSelected, isNext, isReportingMode, onClick }: { comp: SystemComponent; isSelected: boolean; isNext: boolean; isReportingMode?: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const statusColor = comp.status === 'complete' ? '#10b981' : comp.status === 'in_progress' ? '#f59e0b' : '#ef4444';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: isSelected ? '#eff6ff' : hovered ? '#f8fafc' : '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minWidth: 150,
        maxWidth: 220,
        flex: '1 1 150px',
        boxShadow: isSelected ? '0 2px 12px rgba(26,54,93,0.15)' : hovered ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
        position: 'relative' as const,
      }}
    >
      {/* NEXT badge (build mode) */}
      {isNext && !isSelected && !isReportingMode && (
        <div style={{ position: 'absolute', top: -6, right: -6, background: '#3b82f6', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4, letterSpacing: 0.5 }}>
          NEXT
        </div>
      )}
      {/* Reporting overlay: gap/risk indicator */}
      {isReportingMode && comp.status !== 'complete' && (
        <div style={{ position: 'absolute', top: -6, right: -6, background: comp.completion < 30 ? '#ef4444' : comp.completion < 70 ? '#f59e0b' : '#10b981', color: '#fff', fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
          {comp.completion < 30 ? 'GAP' : comp.completion < 70 ? 'PARTIAL' : 'OK'}
        </div>
      )}

      {/* Name + status dot */}
      <div className="d-flex align-items-center gap-2 mb-1">
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }}></div>
        <span className="fw-medium" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {comp.isPageBP && <i className="bi bi-layout-wtf me-1" style={{ color: '#8b5cf6', fontSize: 9 }}></i>}
          {comp.ui.pages.length > 0 && !comp.isPageBP && (
            comp.ui.pages.some(p => !p.verified)
              ? <i className="bi bi-exclamation-triangle me-1" style={{ color: '#f59e0b', fontSize: 9 }} title="Unverified page"></i>
              : comp.ui.pages.length > 1
                ? <i className="bi bi-link-45deg me-1" style={{ color: '#3b82f6', fontSize: 9 }} title={`${comp.ui.pages.length} pages`}></i>
                : <i className="bi bi-display me-1" style={{ color: '#3b82f6', fontSize: 9 }}></i>
          )}
          {comp.name}
        </span>
      </div>

      {/* Progress bar */}
      <div className="d-flex align-items-center gap-2 mb-1">
        <div className="progress flex-grow-1" style={{ height: 4, borderRadius: 2 }}>
          <div className="progress-bar" style={{ width: `${comp.completion}%`, background: statusColor, borderRadius: 2, transition: 'width 0.4s ease' }}></div>
        </div>
        <span style={{ fontSize: 9, color: statusColor, fontWeight: 600, minWidth: 26, textAlign: 'right' as const }}>{comp.completion}%</span>
      </div>

      {/* Layer indicators */}
      <div className="d-flex align-items-center gap-2">
        <div className="d-flex align-items-center gap-1" title="Backend">
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: LAYER_COLORS[comp.layers.backend] || '#e2e8f0' }}></div>
          <span style={{ fontSize: 8, color: '#9ca3af' }}>B</span>
        </div>
        <div className="d-flex align-items-center gap-1" title="Frontend">
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: LAYER_COLORS[comp.layers.frontend] || '#e2e8f0' }}></div>
          <span style={{ fontSize: 8, color: '#9ca3af' }}>F</span>
        </div>
        <div className="d-flex align-items-center gap-1" title="Agents">
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: LAYER_COLORS[comp.layers.agent] || '#e2e8f0' }}></div>
          <span style={{ fontSize: 8, color: '#9ca3af' }}>A</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && !isSelected && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--color-border)', fontSize: 9, color: '#64748b', lineHeight: 1.4 }}>
          {getComponentPurpose(comp.name)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// System View V2 Page
// ---------------------------------------------------------------------------

// Error boundary for debugging
class V2ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) { return { error: err.message + '\n' + err.stack }; }
  render() {
    if (this.state.error) return <div className="alert alert-danger m-4"><h6>System View V2 Error</h6><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{this.state.error}</pre></div>;
    return this.props.children;
  }
}

function SystemViewV2Inner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlComponentId = searchParams.get('componentId');

  // Global mode — force 'build' if URL has a build-mode tab param
  type SystemMode = 'build' | 'reporting';
  const [systemMode, setSystemModeState] = useState<SystemMode>(() => {
    const urlT = searchParams.get('tab');
    if (urlT && ['overview','build','improve','health','ui'].includes(urlT)) return 'build';
    return (localStorage.getItem('system_mode') as SystemMode) || 'build';
  });
  const setSystemMode = (m: SystemMode) => { setSystemModeState(m); localStorage.setItem('system_mode', m); };
  const isReporting = systemMode === 'reporting';

  const [project, setProject] = useState<ProjectData | null>(null);
  const [components, setComponents] = useState<SystemComponent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(urlComponentId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIdsRaw] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('system_v2_ignored_ids') || '[]')); } catch { return new Set(); } });
  const setIgnoredIds = (fn: (prev: Set<string>) => Set<string>) => { setIgnoredIdsRaw(prev => { const next = fn(prev); localStorage.setItem('system_v2_ignored_ids', JSON.stringify([...next])); return next; }); };
  const [discoveredExpanded, setDiscoveredExpanded] = useState(false);
  const workAreaRef = useRef<HTMLDivElement>(null);

  // Work Area state
  type WorkTab = 'overview' | 'build' | 'improve' | 'health' | 'ui' | 'insights' | 'gaps' | 'trends';
  const urlTab = searchParams.get('tab') as WorkTab | null;
  const [workTab, setWorkTab] = useState<WorkTab>(urlTab && ['overview','build','improve','health','ui'].includes(urlTab) ? urlTab : 'overview');
  const [compDetail, setCompDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Build flow state
  const [buildPrompt, setBuildPrompt] = useState<string | null>(null);
  const [buildGenerating, setBuildGenerating] = useState(false);
  const [buildReport, setBuildReport] = useState('');
  const [buildValidating, setBuildValidating] = useState(false);
  const [buildResult, setBuildResult] = useState<any>(null);

  // Build tab "up next" state
  const [showBuildUpNext, setShowBuildUpNext] = useState(false);
  const [showOverviewUpNext, setShowOverviewUpNext] = useState(false);
  const [showHealthUpNext, setShowHealthUpNext] = useState(false);
  const [showImproveUpNext, setShowImproveUpNext] = useState(false);

  // UI feedback state
  const [uiAnalyzing, setUiAnalyzing] = useState(false);
  const [uiFeedback, setUiFeedback] = useState<any>(null);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);

  // Page attachment state
  const [pageAttachments, setPageAttachmentsRaw] = useState<Record<string, UIPage[]>>(() => { try { return JSON.parse(localStorage.getItem('system_v2_page_attachments') || '{}'); } catch { return {}; } });
  const setPageAttachments = (fn: (prev: Record<string, UIPage[]>) => Record<string, UIPage[]>) => { setPageAttachmentsRaw(prev => { const next = fn(prev); localStorage.setItem('system_v2_page_attachments', JSON.stringify(next)); return next; }); };
  const [defineModal, setDefineModal] = useState<{ discoveredComp: SystemComponent } | null>(null);
  const [defineStep, setDefineStep] = useState<'confirm' | 'action' | 'select' | 'done'>('confirm');
  const [defineTarget, setDefineTarget] = useState<string | null>(null);
  const [defineCustomUrl, setDefineCustomUrl] = useState('');
  const [verifiedPages, setVerifiedPagesRaw] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('system_v2_verified_pages') || '[]')); } catch { return new Set(); } });
  const setVerifiedPages = (fn: (prev: Set<string>) => Set<string>) => { setVerifiedPagesRaw(prev => { const next = fn(prev); localStorage.setItem('system_v2_verified_pages', JSON.stringify([...next])); return next; }); };
  const [detachedPages, setDetachedPagesRaw] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('system_v2_detached_pages') || '[]')); } catch { return new Set(); } });
  const setDetachedPages = (fn: (prev: Set<string>) => Set<string>) => { setDetachedPagesRaw(prev => { const next = fn(prev); localStorage.setItem('system_v2_detached_pages', JSON.stringify([...next])); return next; }); };
  const [promotedIdsRaw, setPromotedIdsRaw] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('system_v2_promoted_ids') || '[]')); } catch { return new Set(); } });
  const setPromotedIds = (fn: (prev: Set<string>) => Set<string>) => { setPromotedIdsRaw(prev => { const next = fn(prev); localStorage.setItem('system_v2_promoted_ids', JSON.stringify([...next])); return next; }); };
  const [groupMode, setGroupMode] = useState<'business' | 'technical'>('business');
  type MapFilter = 'all' | 'backend' | 'frontend' | 'agents' | 'incomplete' | 'complete';
  const [mapFilter, setMapFilter] = useState<MapFilter>('all');
  const [verifyModal, setVerifyModal] = useState<{ page: UIPage; compId: string } | null>(null);
  const [mergeModal, setMergeModal] = useState<{ page: UIPage; existingCompId: string; targetCompId: string } | null>(null);

  // Cory Command Center state
  type CoryMode = 'suggestions' | 'plan' | 'execute' | 'r-insights' | 'r-gaps' | 'r-recommendations';
  const [coryMode, setCoryMode] = useState<CoryMode>('suggestions');
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [execQueue, setExecQueue] = useState<Array<{ id: string; title: string; componentId: string; promptTarget: string }>>([]);
  const [execIndex, setExecIndex] = useState(0);
  const [execPaused, setExecPaused] = useState(false);

  // Execution Session (persisted)
  interface ExecSession { id: string; status: 'running' | 'paused' | 'completed'; steps: Array<{ id: string; title: string; componentId: string; promptTarget: string; ticketId?: string; ticketStatus?: string }>; currentStepIndex: number }
  const [execSession, setExecSessionRaw] = useState<ExecSession | null>(() => { try { const s = localStorage.getItem('system_v2_execution_session'); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const setExecSession = (s: ExecSession | null) => { setExecSessionRaw(s); if (s) localStorage.setItem('system_v2_execution_session', JSON.stringify(s)); else localStorage.removeItem('system_v2_execution_session'); };

  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState<number>(() => localStorage.getItem('system_v2_seen_intro') ? -1 : 0);
  const isOnboarding = onboardingStep >= 0 && onboardingStep < 4;
  const hasCompletedFirstBuild = buildResult && !buildResult.error;

  // Execution ticket tracking
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeTicketNumber, setActiveTicketNumber] = useState<number | null>(null);
  const [ticketWarning, setTicketWarning] = useState<string | null>(null);
  const [executionSnapshot, setExecutionSnapshot] = useState<{ coverage: number; readiness: number; maturity: number } | null>(null);
  const [executionActivity, setExecutionActivity] = useState<any[]>([]);

  // Sync URL param → state + set tab + force build mode from URL
  useEffect(() => {
    if (urlComponentId) {
      setSelectedId(urlComponentId);
      if (urlTab && ['overview','build','improve','health','ui'].includes(urlTab)) {
        setWorkTab(urlTab);
        setSystemMode('build'); // Force build mode when arriving via URL (not reporting)
      }
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 200);
    }
  }, [urlComponentId, urlTab]);

  // Fetch detail + reset work area when component changes
  useEffect(() => {
    setCompDetail(null);
    setBuildPrompt(null);
    setBuildReport('');
    setBuildResult(null);
    setUiFeedback(null);
    // Preserve URL tab on first load, reset to overview on subsequent selections
    const preserveTab = urlTab && ['overview','build','improve','health','ui'].includes(urlTab) && selectedId === urlComponentId;
    if (!preserveTab) setWorkTab('overview');
    if (!selectedId) return;
    setLoadingDetail(true);
    portalApi.get(`/api/portal/project/business-processes/${selectedId}`)
      .then((r: any) => setCompDetail(r.data))
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  // Sync coryMode when systemMode changes
  useEffect(() => {
    if (isReporting && !coryMode.startsWith('r-')) setCoryMode('r-insights');
    if (!isReporting && coryMode.startsWith('r-')) setCoryMode('suggestions');
  }, [isReporting, coryMode]);

  // Resume detection: check for active session on load
  useEffect(() => {
    if (execSession && execSession.status === 'running' && !showResumePrompt && execQueue.length === 0) {
      setShowResumePrompt(true);
    }
  }, []); // only on mount

  const loadData = useCallback(() => {
    return Promise.all([
      portalApi.get('/api/portal/project'),
      portalApi.get('/api/portal/project/business-processes').catch(() => ({ data: [] })),
    ]).then(([projRes, bpRes]) => {
      setProject(projRes.data);
      setComponents(transformBPs(bpRes.data || []));
    });
  }, []);

  useEffect(() => {
    loadData()
      .catch((err: any) => {
        if (err.response?.status === 404) setError('no-project');
        else setError(err.response?.data?.error || 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [loadData]);

  // Derived data (hooks MUST be before conditional returns)
  const enrichedComponents = useMemo(() => components.map(c => {
    const attached = pageAttachments[c.id] || [];
    const autoPages: UIPage[] = [];
    if (!c.isPageBP && !c.isDiscovered) {
      const nameWords = c.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      for (const d of components) {
        if (!d.isDiscovered || !d.frontendRoute) continue;
        const dWords = d.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (nameWords.length === 0 || dWords.length === 0) continue;
        const overlap = nameWords.filter(w => dWords.some(dw => dw.includes(w) || w.includes(dw)));
        const confidence = Math.round((overlap.length / Math.max(nameWords.length, dWords.length)) * 100);
        if (overlap.length >= 1 && confidence >= 30 && !attached.some(a => a.route === d.frontendRoute)) {
          autoPages.push({ name: d.name, route: d.frontendRoute, source: 'discovered', verified: false, confidence, bpId: d.id });
        }
      }
    }
    const allPages = [...c.ui.pages, ...attached, ...autoPages]
      .filter(p => !detachedPages.has(`${c.id}:${p.route}`))
      .map(p => ({ ...p, verified: p.verified || verifiedPages.has(`${c.id}:${p.route}`) }));
    const promoted = promotedIdsRaw.has(c.id);
    return { ...c, isDiscovered: promoted ? false : c.isDiscovered, ui: { pages: allPages } };
  }), [components, pageAttachments, detachedPages, verifiedPages, promotedIdsRaw]);
  const visibleComponents = enrichedComponents.filter(c => !ignoredIds.has(c.id));
  const selectedComponent = selectedId ? enrichedComponents.find(c => c.id === selectedId) : null;
  const completedCount = components.filter(c => c.status === 'complete').length;
  const systemLayers = {
    backend: components.some(c => c.layers.backend === 'ready' || c.layers.backend === 'partial'),
    frontend: components.some(c => c.layers.frontend === 'ready' || c.layers.frontend === 'partial'),
    agents: components.some(c => c.layers.agent === 'ready' || c.layers.agent === 'partial'),
  };
  const filteredComponents = mapFilter === 'all' ? visibleComponents
    : mapFilter === 'backend' ? visibleComponents.filter(c => c.layers.backend === 'ready' || c.layers.backend === 'partial')
    : mapFilter === 'frontend' ? visibleComponents.filter(c => c.layers.frontend === 'ready' || c.layers.frontend === 'partial' || c.isPageBP)
    : mapFilter === 'agents' ? visibleComponents.filter(c => c.layers.agent === 'ready')
    : mapFilter === 'incomplete' ? visibleComponents.filter(c => c.status !== 'complete')
    : mapFilter === 'complete' ? visibleComponents.filter(c => c.status === 'complete')
    : visibleComponents;
  const groups = groupMode === 'business' ? groupByBusinessDomain(filteredComponents) : groupComponents(filteredComponents);
  const nextIds = getNextComponents(visibleComponents);

  // Onboarding effects
  useEffect(() => {
    if (onboardingStep === 1 && visibleComponents.length > 0) {
      const first = visibleComponents.find(c => c.status !== 'complete' && !c.isDiscovered);
      if (first) { setSelectedId(first.id); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 200); }
    }
  }, [onboardingStep, visibleComponents]);
  useEffect(() => {
    if (onboardingStep === 2 && hasCompletedFirstBuild) setOnboardingStep(3);
  }, [hasCompletedFirstBuild, onboardingStep]);

  // Ask Cory state (must be before render guards)
  const [coryInput, setCoryInput] = useState('');
  const [coryMessages, setCoryMessages] = useState<Array<{ role: 'user' | 'cory'; text: string }>>([]);
  const [coryAsking, setCoryAsking] = useState(false);
  const [corySessionId, setCorySessionId] = useState<string | null>(null);
  const coryResponse = coryMessages.length > 0 ? coryMessages[coryMessages.length - 1].text : null;
  const coryEndRef = useRef<HTMLDivElement>(null);

  // Render guards
  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
        <p className="text-muted mt-2" style={{ fontSize: 13 }}>Loading System View V2...</p>
      </div>
    );
  }

  if (error === 'no-project') return <ProjectSetupWizard onActivated={() => window.location.reload()} />;
  if (project?.setup_status && !project.setup_status.activated) {
    return <ProjectSetupWizard initialStatus={project.setup_status} onActivated={() => window.location.reload()} />;
  }
  if (error || !project) {
    return <div className="alert alert-danger">{error || 'Failed to load project'}</div>;
  }

  // Component-aware suggestions
  const getComponentSuggestions = (comp: SystemComponent | null, detail: any): Array<{ title: string; explanation: string; action?: string; color: string }> => {
    if (!comp) return [];
    const s: Array<{ title: string; explanation: string; action?: string; color: string }> = [];
    // Backend suggestions — highest priority when backend is weak
    if (comp.layers.backend === 'missing' && !comp.isPageBP) {
      s.push({ title: `Build backend for ${comp.name}`, explanation: 'No backend logic detected. This component needs services, models, and API routes.', action: 'backend_improvement', color: '#3b82f6' });
    } else if (comp.layers.backend === 'partial') {
      s.push({ title: `Strengthen backend for ${comp.name}`, explanation: 'Backend is partially built — missing services, routes, or data models need completion.', action: 'backend_improvement', color: '#3b82f6' });
    }
    // Requirements coverage
    if (comp.coverageRaw < 50) {
      s.push({ title: `Implement requirements (${comp.coverageRaw}% covered)`, explanation: `${100 - comp.coverageRaw}% of requirements unmatched. Build the missing backend/frontend logic to close gaps.`, action: 'requirement_implementation', color: '#3b82f6' });
    }
    // Frontend — only suggest if backend is at least partial
    if (comp.layers.frontend === 'missing' && comp.layers.backend !== 'missing') {
      s.push({ title: `Add user interface`, explanation: 'Backend exists but no UI. Users need a way to interact with this component.', action: 'frontend_exposure', color: '#10b981' });
    } else if (comp.layers.frontend === 'partial' && comp.layers.backend !== 'missing') {
      s.push({ title: `Complete frontend for ${comp.name}`, explanation: 'Frontend is partially built — pages or components are missing.', action: 'frontend_exposure', color: '#10b981' });
    }
    // UI page connection
    if (comp.ui.pages.length === 0 && comp.layers.frontend !== 'missing') s.push({ title: 'Connect a UI page', explanation: 'Frontend files exist but no page is linked for preview and feedback.', color: '#10b981' });
    // Agents — only when both backend and frontend are at least partial
    if (comp.layers.agent === 'missing' && comp.layers.backend !== 'missing' && comp.layers.frontend !== 'missing') {
      s.push({ title: 'Add intelligent automation', explanation: 'System works manually. Agents enable autonomous, self-managing operation.', action: 'agent_enhancement', color: '#8b5cf6' });
    }
    // Autonomy gaps from the detail data
    if (detail?.autonomy_gaps?.length > 0 && s.length < 3) {
      const topGap = detail.autonomy_gaps[0];
      s.push({ title: topGap.title, explanation: topGap.description?.substring(0, 100) || 'Autonomy gap detected', color: '#8b5cf6' });
    }
    return s.slice(0, 5);
  };

  const handleAskCory = async () => {
    if (!coryInput.trim()) return;
    const userMsg = coryInput.trim();
    setCoryMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setCoryInput('');
    setCoryAsking(true);
    try {
      let sid = corySessionId;
      if (!sid) {
        const startRes = await portalApi.post('/api/portal/project/architect/start');
        sid = startRes.data.session_id;
        setCorySessionId(sid);
      }
      let context = userMsg;
      if (selectedComponent) {
        const compCtx = `[Context: Component "${selectedComponent.name}" — ${selectedComponent.maturity}, ${selectedComponent.completion}% complete, Backend: ${selectedComponent.layers.backend}, Frontend: ${selectedComponent.layers.frontend}, Agents: ${selectedComponent.layers.agent}]`;
        const promptCtx = (workTab === 'build' && buildPrompt) ? `\n[Current Build Prompt (first 800 chars):\n${buildPrompt.substring(0, 800)}...]` : '';
        context = `${compCtx}${promptCtx}\n\n${userMsg}`;
      }
      const res = await portalApi.post('/api/portal/project/architect/turn', { session_id: sid, input: context });
      const reply = res.data.message || res.data.response || 'No response';
      setCoryMessages(prev => [...prev, { role: 'cory', text: reply }]);
    } catch {
      setCoryMessages(prev => [...prev, { role: 'cory', text: 'Unable to reach Cory right now. Try again.' }]);
    } finally { setCoryAsking(false); setTimeout(() => coryEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
  };

  // Intelligence helper
  const getWhyMatters = (c: SystemComponent): string => {
    const t = c.promptTarget;
    if (t === 'backend_improvement' || c.layers.backend === 'missing') return 'This component has no backend logic. Without services and routes, nothing can process data or handle user actions.';
    if (c.layers.backend === 'partial') return 'Backend is partially built — key services, routes, or data models are missing. Completing them enables full functionality.';
    if (t === 'frontend_exposure' || (c.layers.backend !== 'missing' && c.layers.frontend === 'missing' && !c.isPageBP)) return 'Backend exists but no user interface. Users cannot interact with this component yet.';
    if (c.layers.frontend === 'partial') return 'Frontend is partially built — pages or components are missing. Completing them gives users full access.';
    if (t === 'agent_enhancement' || (c.layers.backend !== 'missing' && c.layers.frontend !== 'missing' && c.layers.agent === 'missing')) return 'This component works but lacks automation. Adding agents will allow it to operate independently.';
    if (c.completion < 50) return 'Core capabilities are incomplete. This step fills critical gaps in your system functionality.';
    return `Completing this step advances "${c.name}" toward production readiness.`;
  };

  // Build handlers
  const handleGeneratePrompt = async (comp: SystemComponent) => {
    setBuildGenerating(true);
    setBuildPrompt(null);
    setBuildResult(null);
    setActiveTicketId(null);
    setActiveTicketNumber(null);
    setTicketWarning(null);

    // Capture pre-execution snapshot
    const snapshot = { coverage: comp.coverageRaw, readiness: comp.readinessRaw, maturity: comp.maturityLevel };
    setExecutionSnapshot(snapshot);

    try {
      let target = comp.promptTarget;
      if (!target && compDetail) {
        const firstStep = (compDetail.execution_plan || []).find((s: any) => !s.blocked);
        target = firstStep?.prompt_target || 'backend_improvement';
      }
      const res = await portalApi.post(`/api/portal/project/business-processes/${comp.id}/prompt`, { target: target || 'backend_improvement' });
      const text = res.data?.prompt_text || '';
      setBuildPrompt(text);
      try { await navigator.clipboard.writeText(text); } catch { /* clipboard non-critical */ }

      // Create execution ticket with component state + replay data
      try {
        const ticketRes = await portalApi.post('/api/portal/project/execution-ticket', {
          action: 'create',
          componentId: comp.id,
          componentName: comp.name,
          stepLabel: comp.nextStep || `Build ${comp.name}`,
          promptTarget: target || 'backend_improvement',
          snapshot,
          replayData: { prompt: text.substring(0, 500), component_id: comp.id, step_type: target || 'backend_improvement' },
        });
        setActiveTicketId(ticketRes.data.ticket_id);
        setActiveTicketNumber(ticketRes.data.ticket_number);
      } catch (ticketErr: any) {
        console.warn('[V2] Ticket creation failed:', ticketErr?.message || ticketErr);
        setActiveTicketId('local-only');
        setTicketWarning('Execution logged locally but ticket tracking failed');
      }
    } catch { /* prompt generation failed — UI shows no prompt */ } finally { setBuildGenerating(false); }
  };

  const handleValidateBuild = async (compId: string) => {
    if (!buildReport.trim()) return;
    setBuildValidating(true);
    try {
      const res = await portalApi.post(`/api/portal/project/business-processes/${compId}/validation-report`, { reportText: buildReport.trim() });
      setBuildResult(res.data);
      await loadData();
      try {
        const detailRes = await portalApi.get(`/api/portal/project/business-processes/${compId}`);
        setCompDetail(detailRes.data);
      } catch (detailErr: any) {
        console.warn('[V2] Detail refresh failed:', detailErr?.message);
      }

      // Complete execution ticket with before/after snapshot
      if (activeTicketId && activeTicketId !== 'local-only') {
        try {
          const afterMetrics = res.data.metrics_after || {};
          await portalApi.post('/api/portal/project/execution-ticket', {
            action: 'complete',
            ticketId: activeTicketId,
            result: {
              requirementsVerified: res.data.requirementsVerified || 0,
              requirementsTotal: res.data.requirementsTotal || 0,
              filesCreated: res.data.parsed?.filesCreated || [],
              routesAdded: res.data.parsed?.routes || [],
              snapshot_before: executionSnapshot,
              snapshot_after: { coverage: afterMetrics.reqCoverage, readiness: afterMetrics.readiness, maturity: afterMetrics.maturityLevel },
            },
          });
        } catch (ticketErr: any) {
          console.warn('[V2] Ticket completion failed:', ticketErr?.message || ticketErr);
          setTicketWarning('Build validated but ticket tracking update failed');
        }
      }
    } catch (err: any) {
      setBuildResult({ error: err.response?.data?.error || 'Validation failed' });
      if (activeTicketId && activeTicketId !== 'local-only') {
        try {
          await portalApi.post('/api/portal/project/execution-ticket', {
            action: 'fail',
            ticketId: activeTicketId,
            result: { error: err.response?.data?.error || 'Validation failed' },
          });
        } catch (ticketErr: any) {
          console.warn('[V2] Ticket failure update failed:', ticketErr?.message || ticketErr);
        }
      }
    } finally { setBuildValidating(false); }
  };

  // Learn about a component — opens Cory fullscreen in Learn Mode
  const handleLearnAbout = (comp: SystemComponent) => {
    navigate(`/portal/project/cory?mode=learn&componentId=${comp.id}&stepName=${encodeURIComponent(comp.name)}`);
  };

  // UI feedback handlers
  const handleUIAnalyze = async (compId: string, feedback: string) => {
    setUiAnalyzing(true);
    try {
      const feFiles = (compDetail?.implementation_links?.frontend || []) as string[];
      const elements = feFiles.map((f: string, i: number) => {
        const name = f.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || f;
        return { element_id: `component-${i}`, type: 'component', tag: 'div', selector: name, text: name, depth: 0 };
      });
      await portalApi.post(`/api/portal/project/business-processes/${compId}/element-map`, { elements, route: compDetail?.frontend_route || '/' });
      await portalApi.post(`/api/portal/project/business-processes/${compId}/analyze-page`, { user_feedback: feedback });
      const fbRes = await portalApi.get(`/api/portal/project/business-processes/${compId}/element-feedback`);
      setUiFeedback(fbRes.data);
    } catch {} finally { setUiAnalyzing(false); }
  };

  // Cory suggestions (deterministic)
  const corySuggestions = (() => {
    const s: Array<{ id: string; title: string; explanation: string; impact: 'High' | 'Medium' | 'Low'; componentId: string; promptTarget: string }> = [];
    const inc = visibleComponents.filter(c => c.status !== 'complete');
    if (inc.length === 0) return s;
    if (!systemLayers.backend) s.push({ id: 'sg-backend', title: 'Build your backend foundation', explanation: 'No backend detected. This is the foundation everything depends on.', impact: 'High', componentId: inc[0].id, promptTarget: 'backend_improvement' });
    if (systemLayers.backend && !systemLayers.frontend) { const c = inc.find(x => !x.isPageBP) || inc[0]; s.push({ id: 'sg-frontend', title: 'Add a user interface', explanation: 'Backend exists but no UI. Users need an interface.', impact: 'High', componentId: c.id, promptTarget: 'frontend_exposure' }); }
    if (systemLayers.backend && systemLayers.frontend && !systemLayers.agents) s.push({ id: 'sg-agents', title: 'Add intelligent automation', explanation: 'System works manually. Agents enable autonomous operation.', impact: 'Medium', componentId: inc[0].id, promptTarget: 'agent_enhancement' });
    const low = inc.find(c => c.completion < 30 && c.completion > 0);
    if (low && s.length < 3) s.push({ id: `sg-low-${low.id}`, title: `Complete ${low.name}`, explanation: `Only ${low.completion}% complete. Fill critical gaps.`, impact: 'High', componentId: low.id, promptTarget: low.promptTarget || 'requirement_implementation' });
    return s.filter(x => !dismissedSuggestions.has(x.id)).slice(0, 3);
  })();

  // Cory plan (deterministic phases)
  const coryPlanPhases = (() => {
    const inc = visibleComponents.filter(c => c.status !== 'complete');
    const phases: Array<{ title: string; icon: string; color: string; steps: Array<{ id: string; title: string; componentId: string; promptTarget: string; done: boolean }> }> = [];
    // Foundation
    const fSteps: typeof phases[0]['steps'] = [];
    if (!systemLayers.backend) fSteps.push({ id: 'p-backend', title: 'Build backend services', componentId: inc[0]?.id || '', promptTarget: 'backend_improvement', done: systemLayers.backend });
    const lowCov = inc.filter(c => c.completion < 50 && c.completion > 0).slice(0, 2);
    for (const lc of lowCov) fSteps.push({ id: `p-req-${lc.id}`, title: `Implement ${lc.name}`, componentId: lc.id, promptTarget: lc.promptTarget || 'requirement_implementation', done: false });
    if (fSteps.some(s => !s.done)) phases.push({ title: 'Foundation', icon: 'bi-bricks', color: '#3b82f6', steps: fSteps });
    // Usability
    const uSteps: typeof phases[0]['steps'] = [];
    if (!systemLayers.frontend) uSteps.push({ id: 'p-frontend', title: 'Create user interface', componentId: (inc.find(c => !c.isPageBP) || inc[0])?.id || '', promptTarget: 'frontend_exposure', done: systemLayers.frontend });
    if (uSteps.some(s => !s.done)) phases.push({ title: 'Usability', icon: 'bi-layout-wtf', color: '#10b981', steps: uSteps });
    // Intelligence
    const iSteps: typeof phases[0]['steps'] = [];
    if (!systemLayers.agents && systemLayers.backend) iSteps.push({ id: 'p-agents', title: 'Add AI agents', componentId: inc[0]?.id || '', promptTarget: 'agent_enhancement', done: systemLayers.agents });
    if (iSteps.some(s => !s.done)) phases.push({ title: 'Intelligence', icon: 'bi-cpu', color: '#8b5cf6', steps: iSteps });
    return phases;
  })();

  const allPlanSteps = coryPlanPhases.flatMap(p => p.steps.filter(s => !s.done));

  // Cory apply suggestion → generate prompt + switch to Build tab
  const handleApplySuggestion = async (sg: typeof corySuggestions[0]) => {
    setSelectedId(sg.componentId);
    setWorkTab('build');
    setBuildGenerating(true);
    setBuildPrompt(null);
    setBuildResult(null);
    try {
      const res = await portalApi.post(`/api/portal/project/business-processes/${sg.componentId}/prompt`, { target: sg.promptTarget });
      const text = res.data?.prompt_text || '';
      setBuildPrompt(text);
      try { await navigator.clipboard.writeText(text); } catch {}
    } catch {} finally { setBuildGenerating(false); }
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 200);
  };

  // Execution queue + session
  const handleStartExec = async () => {
    if (allPlanSteps.length === 0) return;
    // Create session
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const session: ExecSession = { id: sessionId, status: 'running', steps: allPlanSteps.map(s => ({ ...s, ticketId: undefined, ticketStatus: undefined })), currentStepIndex: 0 };
    setExecSession(session);
    setExecQueue(allPlanSteps);
    setExecIndex(0);
    setExecPaused(false);
    setCoryMode('execute');
    // Start first step
    const first = allPlanSteps[0];
    setSelectedId(first.componentId);
    setWorkTab('build');
    await handleGeneratePrompt(visibleComponents.find(c => c.id === first.componentId) || visibleComponents[0]);
  };

  const handleResumeExec = () => {
    if (!execSession) return;
    setShowResumePrompt(false);
    setExecQueue(execSession.steps);
    setExecIndex(execSession.currentStepIndex);
    setCoryMode('execute');
    const step = execSession.steps[execSession.currentStepIndex];
    if (step) {
      setSelectedId(step.componentId);
      setWorkTab('build');
    }
  };

  const handleDiscardSession = () => {
    setShowResumePrompt(false);
    setExecSession(null);
  };

  const handleExecNext = async () => {
    const next = execIndex + 1;
    if (next >= execQueue.length) {
      setExecQueue([]); setExecIndex(0); setCoryMode('suggestions');
      if (execSession) setExecSession({ ...execSession, status: 'completed', currentStepIndex: next });
      setTimeout(() => setExecSession(null), 1000); // Clear after brief display
      await loadData();
      return;
    }
    setExecIndex(next);
    // Persist session progress
    if (execSession) {
      const updated = { ...execSession, currentStepIndex: next };
      if (activeTicketId && activeTicketId !== 'local-only') {
        updated.steps = updated.steps.map((s, i) => i === execIndex ? { ...s, ticketId: activeTicketId || undefined, ticketStatus: 'done' } : s);
      }
      setExecSession(updated);
    }
    const step = execQueue[next];
    setSelectedId(step.componentId);
    setWorkTab('build');
    await handleGeneratePrompt(visibleComponents.find(c => c.id === step.componentId) || visibleComponents[0]);
  };

  const handleExecExit = () => {
    setExecQueue([]); setExecIndex(0); setExecPaused(false); setCoryMode('suggestions');
    if (execSession) setExecSession({ ...execSession, status: 'paused' });
  };

  const handleTileClick = (id: string) => {
    const isDeselect = id === selectedId;
    setSelectedId(isDeselect ? null : id);
    if (!isDeselect) {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 200);
    }
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            {project.organization_name || 'AI Project'}
            <span className="badge ms-2" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 10, verticalAlign: 'middle' }}>V2</span>
          </h4>
          <div className="d-flex align-items-center gap-2">
            {project.industry && (
              <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10 }}>{project.industry}</span>
            )}
            <span className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 10 }}>
              {project.project_stage?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span className="text-muted" style={{ fontSize: 10 }}>{completedCount}/{components.length} components complete</span>
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <div className="btn-group">
            <button className={`btn btn-sm ${!isReporting ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => { setSystemMode('build'); setWorkTab('overview'); setCoryMode('suggestions'); }}>
              <i className="bi bi-hammer me-1"></i>Build
            </button>
            <button className={`btn btn-sm ${isReporting ? '' : 'btn-outline-secondary'}`} style={{ fontSize: 10, padding: '3px 10px', ...(isReporting ? { background: '#8b5cf6', borderColor: '#8b5cf6', color: '#fff' } : {}) }} onClick={() => { setSystemMode('reporting'); setWorkTab('overview'); setCoryMode('r-insights'); }}>
              <i className="bi bi-bar-chart-line me-1"></i>Reporting
            </button>
          </div>
          <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }}>
            <i className="bi bi-map me-1"></i>Blueprint
          </Link>
        </div>
      </div>

      {/* Sections wrapper — work area renders first via CSS order when component selected */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ═══════════════════════════════════════════════════════════════════
          SYSTEM MAP (order: 2 when component selected, 1 when not)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-3" data-testid="system-map-section" style={{ minHeight: 280, order: selectedId ? 2 : 1 }}>
        <div className="card-body p-4">
          {/* Resume execution banner */}
          {showResumePrompt && execSession && (
            <div className="mb-3 p-3 d-flex align-items-center justify-content-between" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <div>
                <div className="fw-semibold" style={{ fontSize: 12, color: 'var(--color-primary)' }}>
                  <i className="bi bi-play-circle me-1"></i>Resume your previous execution?
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>
                  Step {execSession.currentStepIndex + 1} of {execSession.steps.length} — {execSession.steps[execSession.currentStepIndex]?.title || 'Unknown'}
                </div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} onClick={handleResumeExec}>
                  <i className="bi bi-play-fill me-1"></i>Resume
                </button>
                <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} onClick={handleDiscardSession}>
                  <i className="bi bi-x me-1"></i>Discard
                </button>
              </div>
            </div>
          )}

          {/* Orientation header */}
          <div className="mb-3 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
            <i className="bi bi-rocket-takeoff me-1" style={{ color: 'var(--color-primary)' }}></i>
            You are building <strong style={{ color: 'var(--color-text)' }}>{getSystemSummary(visibleComponents)}</strong>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h6 className="fw-bold mb-1" style={{ fontSize: 14, color: 'var(--color-primary)' }}>
                <i className="bi bi-diagram-3 me-2"></i>Your AI Business System
              </h6>
              <p className="text-muted mb-0 d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
                <span>{visibleComponents.filter(c => !c.isDiscovered).length} components</span>
                <span className="text-muted">|</span>
                <button className="btn btn-link btn-sm p-0" style={{ fontSize: 10, color: groupMode === 'business' ? 'var(--color-primary)' : '#9ca3af' }} onClick={() => setGroupMode('business')}>Business</button>
                <button className="btn btn-link btn-sm p-0" style={{ fontSize: 10, color: groupMode === 'technical' ? 'var(--color-primary)' : '#9ca3af' }} onClick={() => setGroupMode('technical')}>Technical</button>
              </p>
            </div>
            {/* Filter chips */}
            <div className="d-flex gap-1 flex-wrap">
              {([
                { key: 'all', label: 'All', icon: 'bi-grid-3x3-gap', color: '#3b82f6' },
                { key: 'backend', label: 'Backend', icon: 'bi-server', color: '#3b82f6' },
                { key: 'frontend', label: 'Frontend', icon: 'bi-layout-wtf', color: '#10b981' },
                { key: 'agents', label: 'Agents', icon: 'bi-cpu', color: '#8b5cf6' },
                { key: 'incomplete', label: 'In Progress', icon: 'bi-hourglass-split', color: '#f59e0b' },
                { key: 'complete', label: 'Complete', icon: 'bi-check-circle', color: '#059669' },
              ] as Array<{ key: MapFilter; label: string; icon: string; color: string }>).map(f => (
                <button
                  key={f.key}
                  className="btn btn-sm"
                  style={{
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: mapFilter === f.key ? f.color : 'transparent',
                    color: mapFilter === f.key ? '#fff' : '#9ca3af',
                    border: `1px solid ${mapFilter === f.key ? f.color : '#e2e8f0'}`,
                    fontWeight: mapFilter === f.key ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                  onClick={() => setMapFilter(mapFilter === f.key ? 'all' : f.key)}
                >
                  <i className={`bi ${f.icon} me-1`} style={{ fontSize: 8 }}></i>{f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grouped component tiles */}
          {groups.length > 0 ? groups.map(group => {
            const isDiscoveredGroup = group.key === 'discovered';
            const isCollapsed = isDiscoveredGroup && !discoveredExpanded;
            return (
            <div key={group.key} className="mb-3" style={{ opacity: isDiscoveredGroup ? 0.7 : 1 }}>
              <div className="d-flex align-items-center gap-2 mb-2" style={{ cursor: isDiscoveredGroup ? 'pointer' : 'default' }}
                onClick={isDiscoveredGroup ? () => setDiscoveredExpanded(!discoveredExpanded) : undefined}>
                {isDiscoveredGroup && <i className={`bi bi-chevron-${discoveredExpanded ? 'down' : 'right'}`} style={{ color: group.color, fontSize: 10 }}></i>}
                <i className={`bi ${group.icon}`} style={{ color: group.color, fontSize: 13 }}></i>
                <span className="fw-semibold" style={{ fontSize: 12, color: group.color }}>{group.title}</span>
                {isDiscoveredGroup ? (
                  <span className="badge" style={{ background: `${group.color}20`, color: group.color, fontSize: 8 }}>Auto-discovered from repo</span>
                ) : (
                  <span className="badge" style={{ background: `${group.color}20`, color: group.color, fontSize: 8 }}>{group.completion}%</span>
                )}
                {!isDiscoveredGroup && <span className="text-muted" style={{ fontSize: 9 }}>{group.items.length} components</span>}
              </div>
              {!isCollapsed && (
                <div className="d-flex flex-wrap gap-2">
                  {group.items.map(comp => (
                    <SystemMapTile
                      key={comp.id}
                      comp={comp}
                      isSelected={comp.id === selectedId}
                      isNext={nextIds.has(comp.id)}
                      isReportingMode={isReporting}
                      onClick={() => handleTileClick(comp.id)}
                    />
                  ))}
                </div>
              )}
            </div>
            );
          }) : (
            <div className="text-center py-4" data-testid="system-map-empty">
              <i className="bi bi-inbox d-block mb-2" style={{ fontSize: 24, color: '#9ca3af' }}></i>
              <p className="text-muted mb-0" style={{ fontSize: 12 }}>No system components available</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          WORK AREA (order: 1 — renders above map when component selected)
          ═══════════════════════════════════════════════════════════════════ */}
      <div ref={workAreaRef} className="card border-0 shadow-sm mb-3" data-testid="work-area-section" style={{ minHeight: selectedId ? 200 : 0, order: 1, display: selectedId ? 'block' : 'none' }}>
        <div className="card-body p-4">

          {selectedComponent?.isDiscovered ? (
            /* ── Discovered / Unmapped ── */
            <div>
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="bi bi-search" style={{ color: '#a855f7', fontSize: 14 }}></i>
                <span className="fw-bold" style={{ fontSize: 15 }}>{selectedComponent.name}</span>
                <span className="badge" style={{ background: '#a855f720', color: '#a855f7', fontSize: 9 }}>Unmapped</span>
              </div>
              <div className="p-3 mb-3" style={{ background: '#faf5ff', borderRadius: 8, border: '1px solid #a855f720' }}>
                <p className="mb-2 fw-medium" style={{ fontSize: 13, color: '#7c3aed' }}><i className="bi bi-info-circle me-1"></i>Unmapped UI Layer</p>
                {selectedComponent.frontendRoute && (
                  <div className="mb-2" style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>Route: {selectedComponent.frontendRoute}</div>
                )}
                {/* Show suggested BP match */}
                {(() => {
                  const nameWords = selectedComponent.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
                  let bestMatch: { name: string; confidence: number } | null = null;
                  for (const c of visibleComponents) {
                    if (c.isDiscovered) continue;
                    const cWords = c.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
                    const overlap = nameWords.filter((w: string) => cWords.some((cw: string) => cw.includes(w) || w.includes(cw)));
                    const conf = cWords.length > 0 ? Math.round((overlap.length / Math.max(nameWords.length, cWords.length)) * 100) : 0;
                    if (conf > 0 && (!bestMatch || conf > bestMatch.confidence)) bestMatch = { name: c.name, confidence: conf };
                  }
                  return bestMatch ? (
                    <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 10, color: '#7c3aed' }}>
                      <i className="bi bi-link-45deg"></i>
                      Suggested match: <strong>{bestMatch.name}</strong>
                      <span className="badge" style={{ background: bestMatch.confidence >= 70 ? '#10b98120' : '#f59e0b20', color: bestMatch.confidence >= 70 ? '#059669' : '#92400e', fontSize: 8 }}>
                        {bestMatch.confidence}% confidence
                      </span>
                      {bestMatch.confidence < 70 && <i className="bi bi-exclamation-triangle" style={{ color: '#f59e0b', fontSize: 9 }}></i>}
                    </div>
                  ) : null;
                })()}
                <p className="text-muted mb-0" style={{ fontSize: 11 }}>This page was discovered in your repo but isn't linked to a system component.</p>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => { setDefineModal({ discoveredComp: selectedComponent }); setDefineStep('confirm'); setDefineTarget(null); setDefineCustomUrl(selectedComponent.frontendRoute || ''); }}>
                  <i className="bi bi-plus-circle me-1"></i>Define Component
                </button>
                <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => { setIgnoredIds(prev => new Set([...prev, selectedComponent.id])); setSelectedId(null); }}>
                  <i className="bi bi-eye-slash me-1"></i>Ignore
                </button>
              </div>
            </div>

          ) : selectedComponent ? (
            <div>
              {/* ── Header: Name + Status + Metrics ── */}
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2">
                  {selectedComponent.isPageBP && <i className="bi bi-layout-wtf" style={{ color: '#8b5cf6' }}></i>}
                  <span className="fw-bold" style={{ fontSize: 15 }}>{selectedComponent.name}</span>
                  <span className="badge" style={{ background: STATUS_STYLES[selectedComponent.status].bg, color: STATUS_STYLES[selectedComponent.status].text, fontSize: 9 }}>{STATUS_STYLES[selectedComponent.status].label}</span>
                  <span className="badge" style={{ background: `${MATURITY_COLORS[selectedComponent.maturityLevel]}20`, color: MATURITY_COLORS[selectedComponent.maturityLevel], fontSize: 9 }}>{selectedComponent.maturity}</span>
                </div>
                <div className="d-flex gap-3" style={{ fontSize: 10 }}>
                  <span>Coverage <strong>{selectedComponent.coverageRaw}%</strong></span>
                  <span>Readiness <strong>{selectedComponent.readinessRaw}%</strong></span>
                </div>
              </div>

              {/* ── Tabs (mode-dependent) ── */}
              <nav className="nav nav-tabs mb-3" style={{ fontSize: 12 }}>
                {(isReporting
                  ? [{ key: 'overview' as WorkTab, icon: 'bi-eye', label: 'Overview' }, { key: 'insights' as WorkTab, icon: 'bi-graph-up', label: 'Insights' }, { key: 'gaps' as WorkTab, icon: 'bi-exclamation-triangle', label: 'Gaps' }, { key: 'trends' as WorkTab, icon: 'bi-activity', label: 'Trends' }]
                  : [{ key: 'overview' as WorkTab, icon: 'bi-eye', label: 'Overview' }, { key: 'build' as WorkTab, icon: 'bi-hammer', label: 'Build' }, { key: 'health' as WorkTab, icon: 'bi-heart-pulse', label: 'Health' }, { key: 'improve' as WorkTab, icon: 'bi-graph-up-arrow', label: 'Improve' }]
                ).map(t => (
                  <button key={t.key} className={`nav-link py-1 px-3 ${workTab === t.key ? 'active' : ''}`} style={{ fontSize: 11 }} onClick={() => setWorkTab(t.key)}>
                    <i className={`bi ${t.icon} me-1`}></i>{t.label}
                  </button>
                ))}
                {!isReporting && selectedComponent.ui.pages.length > 0 && (
                  <button className={`nav-link py-1 px-3 ${workTab === 'ui' ? 'active' : ''}`} style={{ fontSize: 11 }} onClick={() => setWorkTab('ui')}>
                    <i className="bi bi-palette me-1"></i>UI ({selectedComponent.ui.pages.length})
                  </button>
                )}
              </nav>

              {/* ── TAB: Overview (Cory left + System Intelligence right) ── */}
              {workTab === 'overview' && (
                <div className="row g-3">
                  {/* Left: Cory recommendations (powered by Cory Orchestrator) */}
                  <div className={compDetail ? 'col-lg-7' : 'col-12'}>
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <i className="bi bi-robot" style={{ color: '#3b82f6', fontSize: 16 }}></i>
                      <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: 'var(--color-primary)' }}>Cory — What You Should Do Next</h6>
                    </div>

                    {(() => {
                      // Use orchestrator output if available, fall back to local suggestions
                      const coryTasks: Array<{ id: string; title: string; description: string; source: string; color: string; prompt_target?: string; blocked?: boolean; block_reason?: string; priority?: number; decision_trace?: any }> = compDetail?.cory_tasks || [];
                      const fallbackSuggestions = getComponentSuggestions(selectedComponent, compDetail);
                      const tasks = coryTasks.length > 0
                        ? coryTasks.map(t => ({ title: t.title, explanation: t.description, color: t.color, action: t.prompt_target, source: t.source, blocked: t.blocked, blockReason: t.block_reason, trace: t.decision_trace }))
                        : fallbackSuggestions.map(s => ({ ...s, explanation: s.explanation, source: 'build' as string, blocked: false, blockReason: undefined, trace: undefined }));
                      const primary = tasks[0];
                      const upNext = tasks.slice(1);
                      const SOURCE_LABELS: Record<string, { label: string; bg: string; color: string }> = {
                        build: { label: 'Build', bg: '#3b82f620', color: '#3b82f6' },
                        health: { label: 'Health', bg: '#f59e0b20', color: '#92400e' },
                        improve: { label: 'Improve', bg: '#8b5cf620', color: '#8b5cf6' },
                        ui: { label: 'UI', bg: '#10b98120', color: '#059669' },
                      };
                      return primary ? (
                        <>
                          <div className="mb-2" style={{ fontSize: 10, color: '#64748b' }}>
                            Step 1 of {tasks.length} for {selectedComponent.name}
                            {coryTasks.length > 0 && <span className="ms-2 badge" style={{ background: '#3b82f610', color: '#94a3b8', fontSize: 7 }}>Orchestrated</span>}
                          </div>
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <h6 className="fw-bold mb-0" style={{ fontSize: 15 }}>{primary.title}</h6>
                            {primary.source && SOURCE_LABELS[primary.source] && (
                              <span className="badge" style={{ background: SOURCE_LABELS[primary.source].bg, color: SOURCE_LABELS[primary.source].color, fontSize: 8 }}>{SOURCE_LABELS[primary.source].label}</span>
                            )}
                            {primary.blocked && <span className="badge" style={{ background: '#ef444420', color: '#ef4444', fontSize: 8 }}>Blocked</span>}
                          </div>
                          <p className="mb-2" style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{primary.explanation}</p>
                          {primary.blocked && primary.blockReason && (
                            <div className="mb-2 p-2" style={{ background: '#fef2f2', borderRadius: 6, fontSize: 10, color: '#991b1b' }}>
                              <i className="bi bi-exclamation-triangle me-1"></i>{primary.blockReason}
                            </div>
                          )}

                          <div className="d-flex flex-wrap gap-2 mb-3">
                            <span className="badge" style={{ background: `${primary.color}20`, color: primary.color, fontSize: 9 }}>{selectedComponent.completion}% complete</span>
                            <span className="badge" style={{ background: `${MATURITY_COLORS[selectedComponent.maturityLevel]}20`, color: MATURITY_COLORS[selectedComponent.maturityLevel], fontSize: 9 }}>{selectedComponent.maturity}</span>
                          </div>

                          {!primary.blocked && (
                            <div className="d-flex flex-wrap gap-2 mb-3">
                              <button className="btn btn-sm" style={{ background: primary.color, color: '#fff', fontWeight: 600, fontSize: 12 }} onClick={() => { setWorkTab('build'); if (primary.action) handleGeneratePrompt(selectedComponent); }}>
                                <i className="bi bi-terminal me-1"></i>{primary.action ? 'Generate Build Prompt' : 'Go to Build'}
                              </button>
                              <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => handleLearnAbout(selectedComponent)}>
                                <i className="bi bi-book me-1"></i>Learn About This
                              </button>
                            </div>
                          )}

                          {/* Decision trace (expandable) */}
                          {primary.trace && (
                            <details className="mb-3" style={{ fontSize: 9, color: '#94a3b8' }}>
                              <summary style={{ cursor: 'pointer' }}><i className="bi bi-info-circle me-1"></i>Why this recommendation?</summary>
                              <div className="mt-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 4, fontFamily: 'monospace' }}>
                                <div>{primary.trace.reason}</div>
                                <div className="mt-1">Coverage: {primary.trace.inputs?.coverage}% | Readiness: {primary.trace.inputs?.readiness}% | Mode: {primary.trace.inputs?.mode} | Layers: {primary.trace.inputs?.layer_status}</div>
                                {primary.trace.scoring_breakdown && <div className="mt-1">Score: impact({primary.trace.scoring_breakdown.impact_score}) + urgency({primary.trace.scoring_breakdown.urgency_score}) + confidence({primary.trace.scoring_breakdown.confidence_score}) + blocking({primary.trace.scoring_breakdown.blocking_bonus}) + mode({primary.trace.scoring_breakdown.mode_weight}) = {primary.trace.scoring_breakdown.total}</div>}
                              </div>
                            </details>
                          )}

                          {upNext.length > 0 && (
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                              <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-2 w-100" style={{ fontSize: 12, color: '#64748b' }} onClick={() => setShowOverviewUpNext(!showOverviewUpNext)}>
                                <i className={`bi ${showOverviewUpNext ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 10 }}></i>
                                <span>Up next ({upNext.length} more step{upNext.length > 1 ? 's' : ''})</span>
                              </button>
                              {showOverviewUpNext && (
                                <div className="mt-2">
                                  {upNext.map((s, i) => (
                                    <div key={i} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: s.blocked ? '#fef2f210' : 'var(--color-bg-alt)', borderRadius: 6, borderLeft: `3px solid ${s.color}`, opacity: s.blocked ? 0.6 : 1 }}>
                                      <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: `${s.color}20`, color: s.color, fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 2}</span>
                                      <div className="flex-grow-1">
                                        <div className="d-flex align-items-center gap-1">
                                          <span className="fw-medium" style={{ fontSize: 11 }}>{s.title}</span>
                                          {s.source && SOURCE_LABELS[s.source] && <span className="badge" style={{ background: SOURCE_LABELS[s.source].bg, color: SOURCE_LABELS[s.source].color, fontSize: 7 }}>{SOURCE_LABELS[s.source].label}</span>}
                                          {s.blocked && <span className="badge" style={{ background: '#ef444420', color: '#ef4444', fontSize: 7 }}>Blocked</span>}
                                        </div>
                                        <div className="text-muted" style={{ fontSize: 9 }}>{s.explanation}</div>
                                      </div>
                                      {!s.blocked && (
                                        <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                                          <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => handleLearnAbout(selectedComponent)}>
                                            <i className="bi bi-book"></i>
                                          </button>
                                          <button className="btn btn-sm" style={{ fontSize: 8, padding: '1px 6px', background: s.color, color: '#fff' }} onClick={() => { setWorkTab('build'); handleGeneratePrompt(selectedComponent); }}>
                                            Run
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-muted" style={{ fontSize: 12 }}>This component is on track — no immediate recommendations.</p>
                      );
                    })()}
                  </div>

                  {/* Right: System Intelligence */}
                  {compDetail && (
                    <div className="col-lg-5">
                      <SystemIntelligencePanel
                        links={compDetail.implementation_links || {}}
                        usability={compDetail.usability || {}}
                        metrics={compDetail.metrics}
                        repoUrl={null}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Build ── */}
              {workTab === 'build' && (
                <div>
                  {!buildPrompt && !buildGenerating && (
                    <div>
                      {/* Cory — Your Next Step (matches Blueprint exactly) */}
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <i className="bi bi-robot" style={{ color: '#3b82f6', fontSize: 16 }}></i>
                        <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: 'var(--color-primary)' }}>Cory — Your Next Step</h6>
                      </div>

                      {/* Step counter */}
                      {(() => {
                        const execSteps = (compDetail?.execution_plan || []).filter((s: any) => !s.blocked);
                        return execSteps.length > 0 ? (
                          <div className="mb-2" style={{ fontSize: 10, color: '#64748b' }}>Step 1 of {Math.min(execSteps.length, 3)} for {selectedComponent.name}</div>
                        ) : null;
                      })()}

                      {/* Primary step */}
                      <h6 className="fw-bold mb-1" style={{ fontSize: 15, color: 'var(--color-text)' }}>{selectedComponent.nextStep || `Build ${selectedComponent.name}`}</h6>
                      <p className="mb-2" style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, fontStyle: 'italic' }}>{getWhyMatters(selectedComponent)}</p>

                      {/* Layer status + completion badges */}
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        <span className="badge" style={{ background: selectedComponent.status === 'complete' ? '#10b98120' : selectedComponent.status === 'in_progress' ? '#f59e0b20' : '#e2e8f020', color: selectedComponent.status === 'complete' ? '#059669' : selectedComponent.status === 'in_progress' ? '#92400e' : '#9ca3af', fontSize: 9 }}>{selectedComponent.completion}% complete</span>
                        <span className="badge" style={{ background: `${MATURITY_COLORS[selectedComponent.maturityLevel]}20`, color: MATURITY_COLORS[selectedComponent.maturityLevel], fontSize: 9 }}>{selectedComponent.maturity}</span>
                        {selectedComponent.layers.backend === 'partial' && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 9 }}><i className="bi bi-exclamation-triangle me-1"></i>Backend partial</span>}
                        {selectedComponent.layers.backend === 'missing' && <span className="badge" style={{ background: '#ef444420', color: '#ef4444', fontSize: 9 }}><i className="bi bi-x-circle me-1"></i>No backend</span>}
                        {selectedComponent.layers.frontend === 'missing' && selectedComponent.layers.backend !== 'missing' && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 9 }}>No frontend</span>}
                        {selectedComponent.layers.frontend === 'partial' && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 9 }}>Frontend partial</span>}
                      </div>

                      {/* Action buttons */}
                      <div className="d-flex flex-wrap gap-2">
                        <button className="btn btn-primary btn-sm" style={{ fontWeight: 600, fontSize: 12 }} disabled={buildGenerating} onClick={() => handleGeneratePrompt(selectedComponent)}>
                          <i className="bi bi-terminal me-1"></i>Generate Build Prompt
                        </button>
                        <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => handleLearnAbout(selectedComponent)}>
                          <i className="bi bi-book me-1"></i>Learn About This
                        </button>
                      </div>

                      {/* Up next — component-specific execution plan steps */}
                      {(() => {
                        const execSteps = (compDetail?.execution_plan || []).filter((s: any) => !s.blocked);
                        const upcomingSteps = execSteps.slice(1, 3);
                        if (upcomingSteps.length === 0) return null;
                        return (
                          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-2 w-100" style={{ fontSize: 12, color: '#64748b' }} onClick={() => setShowBuildUpNext(!showBuildUpNext)}>
                              <i className={`bi ${showBuildUpNext ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 10 }}></i>
                              <span>Up next ({upcomingSteps.length} more step{upcomingSteps.length > 1 ? 's' : ''})</span>
                            </button>
                            {showBuildUpNext && (
                              <div className="mt-2">
                                {upcomingSteps.map((step: any, i: number) => (
                                  <div key={step.prompt_target + i} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, borderLeft: `3px solid ${step.prompt_target === 'agent_enhancement' ? '#8b5cf6' : step.prompt_target === 'frontend_exposure' ? '#10b981' : '#3b82f6'}` }}>
                                    <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: `${step.prompt_target === 'agent_enhancement' ? '#8b5cf6' : step.prompt_target === 'frontend_exposure' ? '#10b981' : '#3b82f6'}20`, color: step.prompt_target === 'agent_enhancement' ? '#8b5cf6' : step.prompt_target === 'frontend_exposure' ? '#10b981' : '#3b82f6', fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 2}</span>
                                    <div className="flex-grow-1">
                                      <div className="fw-medium" style={{ fontSize: 11 }}>{step.label}</div>
                                      <div className="text-muted" style={{ fontSize: 9 }}>
                                        {step.prompt_target === 'backend_improvement' ? 'Build backend services and API routes' :
                                         step.prompt_target === 'frontend_exposure' ? 'Create user interface components' :
                                         step.prompt_target === 'agent_enhancement' ? 'Add intelligent automation agents' :
                                         step.prompt_target === 'requirement_implementation' ? 'Implement remaining requirements' :
                                         'Advance toward production readiness'}
                                      </div>
                                    </div>
                                    <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => handleLearnAbout(selectedComponent)}>
                                        <i className="bi bi-book"></i>
                                      </button>
                                      <button className="btn btn-sm btn-primary" style={{ fontSize: 8, padding: '1px 6px' }} onClick={async () => {
                                        setBuildGenerating(true);
                                        try {
                                          const res = await portalApi.post(`/api/portal/project/business-processes/${selectedComponent.id}/prompt`, { target: step.prompt_target || 'backend_improvement' });
                                          const text = res.data?.prompt_text || '';
                                          setBuildPrompt(text);
                                          try { await navigator.clipboard.writeText(text); } catch {}
                                        } catch {} finally { setBuildGenerating(false); }
                                      }}>
                                        Build
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {buildGenerating && <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: 12 }}><span className="spinner-border spinner-border-sm"></span>Generating prompt...</div>}
                  {buildPrompt && (
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <span className="badge bg-success" style={{ fontSize: 9 }}>Copied to clipboard</span>
                        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} onClick={() => { navigator.clipboard.writeText(buildPrompt).catch(() => {}); }}>
                          <i className="bi bi-clipboard me-1"></i>Copy Again
                        </button>
                        <a href="https://claude.ai/" target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }}>
                          <i className="bi bi-box-arrow-up-right me-1"></i>Open Claude
                        </a>
                      </div>
                      {/* Editable prompt — user can refine before copying */}
                      <div className="mb-3">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <span className="text-muted" style={{ fontSize: 9 }}><i className="bi bi-pencil me-1"></i>Edit the prompt below, then copy again</span>
                        </div>
                        <textarea
                          className="form-control form-control-sm"
                          rows={8}
                          value={buildPrompt}
                          onChange={e => setBuildPrompt(e.target.value)}
                          style={{ fontFamily: 'monospace', fontSize: 10, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, lineHeight: 1.5, resize: 'vertical' }}
                        />
                      </div>
                      {!buildResult && (
                        <div>
                          <label className="form-label fw-medium" style={{ fontSize: 11 }}><i className="bi bi-clipboard-check me-1"></i>Paste Claude Code Response</label>
                          <textarea className="form-control form-control-sm" rows={5} value={buildReport} onChange={e => setBuildReport(e.target.value)}
                            placeholder="VALIDATION REPORT&#10;&#10;Files Created:&#10;- ..." style={{ fontFamily: 'monospace', fontSize: 10 }} />
                          <button className="btn btn-sm mt-2" style={{ background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 11 }}
                            disabled={!buildReport.trim() || buildValidating} onClick={() => handleValidateBuild(selectedComponent.id)}>
                            {buildValidating ? <><span className="spinner-border spinner-border-sm me-1"></span>Validating...</> : <><i className="bi bi-check-circle me-1"></i>Validate Build</>}
                          </button>
                        </div>
                      )}
                      {buildResult && !buildResult.error && (
                        <div className="p-3" style={{ background: '#10b98115', borderRadius: 8, border: '1px solid #10b98130' }}>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <div className="fw-bold small" style={{ color: '#059669' }}><i className="bi bi-check-circle-fill me-1"></i>Build Validated</div>
                            <div className="d-flex gap-2">
                              {(() => {
                                const nextComp = visibleComponents.find(c => c.status !== 'complete' && c.id !== selectedComponent.id && c.completion < 80);
                                return nextComp ? (
                                  <button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} onClick={() => { setSelectedId(nextComp.id); setWorkTab('build'); setBuildPrompt(null); setBuildReport(''); setBuildResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                                    <i className="bi bi-arrow-right me-1"></i>Next: {nextComp.name.substring(0, 25)}{nextComp.name.length > 25 ? '...' : ''}
                                  </button>
                                ) : null;
                              })()}
                              <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} onClick={() => { setBuildPrompt(null); setBuildReport(''); setBuildResult(null); }}>
                                <i className="bi bi-arrow-repeat me-1"></i>Build Again
                              </button>
                            </div>
                          </div>
                          <div className="mb-2" style={{ fontSize: 11 }}><strong>{buildResult.requirementsVerified || 0}</strong> of {buildResult.requirementsTotal || 0} requirements verified</div>
                          {buildResult.parsed?.filesCreated?.length > 0 && (
                            <div className="mb-2">
                              <div className="fw-semibold" style={{ fontSize: 10, color: 'var(--color-primary)' }}><i className="bi bi-file-earmark-plus me-1" style={{ color: '#10b981' }}></i>Files Created</div>
                              <ul className="mb-0 ps-3" style={{ fontSize: 10, color: '#475569' }}>
                                {buildResult.parsed.filesCreated.map((f: string, i: number) => <li key={i} style={{ fontFamily: 'monospace' }}>{f}</li>)}
                              </ul>
                            </div>
                          )}
                          {buildResult.parsed?.filesModified?.length > 0 && (
                            <div className="mb-2">
                              <div className="fw-semibold" style={{ fontSize: 10, color: 'var(--color-primary)' }}><i className="bi bi-pencil-square me-1" style={{ color: '#f59e0b' }}></i>Files Modified</div>
                              <ul className="mb-0 ps-3" style={{ fontSize: 10, color: '#475569' }}>
                                {buildResult.parsed.filesModified.map((f: string, i: number) => <li key={i} style={{ fontFamily: 'monospace' }}>{f}</li>)}
                              </ul>
                            </div>
                          )}
                          {buildResult.parsed?.routes?.length > 0 && (
                            <div className="mb-2">
                              <div className="fw-semibold" style={{ fontSize: 10, color: 'var(--color-primary)' }}><i className="bi bi-signpost-2 me-1" style={{ color: '#3b82f6' }}></i>API Routes</div>
                              <ul className="mb-0 ps-3" style={{ fontSize: 10, color: '#475569' }}>
                                {buildResult.parsed.routes.map((r: string, i: number) => <li key={i} style={{ fontFamily: 'monospace' }}>{r}</li>)}
                              </ul>
                            </div>
                          )}
                          {buildResult.parsed?.database?.length > 0 && (
                            <div className="mb-2">
                              <div className="fw-semibold" style={{ fontSize: 10, color: 'var(--color-primary)' }}><i className="bi bi-database me-1" style={{ color: '#8b5cf6' }}></i>Database</div>
                              <ul className="mb-0 ps-3" style={{ fontSize: 10, color: '#475569' }}>
                                {buildResult.parsed.database.map((d: string, i: number) => <li key={i}>{d}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {buildResult?.error && <div className="alert alert-danger py-2" style={{ fontSize: 11 }}>{buildResult.error}</div>}

                      {/* Execution ticket indicator */}
                      {activeTicketId && (
                        <div className="mt-2 p-2" style={{ background: ticketWarning ? '#fef3c7' : 'var(--color-bg-alt)', borderRadius: 6, border: ticketWarning ? '1px solid #fde68a' : 'none' }}>
                          <div className="d-flex align-items-center gap-2" style={{ fontSize: 10 }}>
                            {activeTicketId === 'local-only' ? (
                              <>
                                <i className="bi bi-exclamation-triangle" style={{ color: '#f59e0b' }}></i>
                                <span style={{ color: '#92400e' }}>Untracked Execution</span>
                              </>
                            ) : (
                              <>
                                <i className="bi bi-ticket-detailed" style={{ color: '#3b82f6' }}></i>
                                <span>Ticket #{activeTicketNumber}</span>
                                <span className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 8 }}>Tracked</span>
                              </>
                            )}
                            <span className="badge" style={{ background: buildResult && !buildResult.error ? '#10b98120' : buildResult?.error ? '#ef444420' : '#f59e0b20', color: buildResult && !buildResult.error ? '#059669' : buildResult?.error ? '#ef4444' : '#92400e', fontSize: 8 }}>
                              {buildResult && !buildResult.error ? 'Completed' : buildResult?.error ? 'Failed' : 'In Progress'}
                            </span>
                          </div>
                          {ticketWarning && <div className="mt-1" style={{ fontSize: 9, color: '#92400e' }}><i className="bi bi-info-circle me-1"></i>{ticketWarning}</div>}
                          {executionSnapshot && buildResult?.metrics_after && (
                            <div className="mt-1 d-flex gap-3" style={{ fontSize: 9, color: '#64748b' }}>
                              <span>Coverage: {executionSnapshot.coverage}% → {buildResult.metrics_after.reqCoverage || '?'}%</span>
                              <span>Maturity: L{executionSnapshot.maturity} → L{buildResult.metrics_after.maturityLevel || '?'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Health (unified Cory format — quality + gaps) ── */}
              {workTab === 'health' && (
                <div>
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <i className="bi bi-robot" style={{ color: '#f59e0b', fontSize: 16 }}></i>
                    <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: '#92400e' }}>Cory — Health Check</h6>
                  </div>

                  {/* Quality scores grid */}
                  {compDetail?.quality && (
                    <div className="row g-2 mb-3">
                      {[
                        { label: 'Determinism', value: compDetail.quality.determinism || 0, max: 10 },
                        { label: 'Reliability', value: compDetail.quality.reliability || 0, max: 10 },
                        { label: 'UX Exposure', value: compDetail.quality.ux_exposure || 0, max: 10 },
                        { label: 'Automation', value: compDetail.quality.automation || 0, max: 10 },
                        { label: 'Observability', value: compDetail.quality.observability || 0, max: 10 },
                        { label: 'Prod Ready', value: compDetail.quality.production_readiness || 0, max: 10 },
                      ].map(q => (
                        <div key={q.label} className="col-4">
                          <div className="text-center p-2" style={{ background: q.value >= 7 ? '#f0fdf420' : q.value >= 4 ? '#fffbeb' : '#fef2f2', borderRadius: 6, border: `1px solid ${q.value >= 7 ? '#10b98130' : q.value >= 4 ? '#f59e0b30' : '#ef444430'}` }}>
                            <div className="fw-bold" style={{ fontSize: 16, color: q.value >= 7 ? '#059669' : q.value >= 4 ? '#92400e' : '#ef4444' }}>{q.value}/{q.max}</div>
                            <div className="text-muted" style={{ fontSize: 9 }}>{q.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Primary improvement recommendation */}
                  {(() => {
                    const healthSteps: Array<{ title: string; explanation: string; color: string }> = [];
                    const q = compDetail?.quality;
                    if (q) {
                      if ((q.determinism || 0) < 3) healthSteps.push({ title: 'Improve determinism', explanation: 'Move logic from LLM responses to deterministic code paths for reliability.', color: '#3b82f6' });
                      if ((q.reliability || 0) < 3) healthSteps.push({ title: 'Add error handling and retry logic', explanation: 'Improve graceful failure recovery and data persistence guarantees.', color: '#3b82f6' });
                      if ((q.observability || 0) < 3) healthSteps.push({ title: 'Add monitoring and logging', explanation: 'No observability detected — add structured logging, metrics, and alerting.', color: '#3b82f6' });
                      if ((q.ux_exposure || 0) < 3 && selectedComponent.layers.frontend !== 'missing') healthSteps.push({ title: 'Improve user interface coverage', explanation: 'Frontend exists but UX exposure is low — expand page functionality.', color: '#10b981' });
                      if ((q.automation || 0) < 3 && selectedComponent.layers.backend !== 'missing') healthSteps.push({ title: 'Add automation agents', explanation: 'Manual operation detected — add agents for self-managing behavior.', color: '#8b5cf6' });
                      if ((q.production_readiness || 0) < 5) healthSteps.push({ title: 'Improve production readiness', explanation: 'System is not production-ready — address missing layers and quality gaps.', color: '#f59e0b' });
                    }
                    // Add layer gaps
                    if (selectedComponent.layers.backend === 'missing') healthSteps.unshift({ title: 'Build backend services', explanation: 'No backend layer detected — this is the most critical gap.', color: '#ef4444' });
                    if (selectedComponent.layers.frontend === 'missing' && selectedComponent.layers.backend !== 'missing') healthSteps.push({ title: 'Add frontend layer', explanation: 'Backend exists but no user interface — users cannot interact.', color: '#ef4444' });
                    // Add detected autonomy gaps
                    (compDetail?.autonomy_gaps || []).slice(0, 2).forEach((g: any) => {
                      if (!healthSteps.find(s => s.title === g.title)) healthSteps.push({ title: g.title, explanation: g.description?.substring(0, 120) || 'Detected gap', color: '#8b5cf6' });
                    });

                    const primary = healthSteps[0];
                    const upNext = healthSteps.slice(1, 3);

                    if (!primary) return <p className="text-muted" style={{ fontSize: 12 }}>All quality dimensions are healthy — no immediate improvements needed.</p>;

                    return (
                      <>
                        <div className="mb-2" style={{ fontSize: 10, color: '#64748b' }}>Top improvement: 1 of {Math.min(healthSteps.length, 3)}</div>
                        <h6 className="fw-bold mb-1" style={{ fontSize: 15 }}>{primary.title}</h6>
                        <p className="mb-2" style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{primary.explanation}</p>

                        <div className="d-flex flex-wrap gap-2 mb-3">
                          <button className="btn btn-sm" style={{ background: primary.color, color: '#fff', fontWeight: 600, fontSize: 12 }} onClick={() => handleGeneratePrompt(selectedComponent)}>
                            <i className="bi bi-terminal me-1"></i>Generate Fix Prompt
                          </button>
                          <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => handleLearnAbout(selectedComponent)}>
                            <i className="bi bi-book me-1"></i>Learn About This
                          </button>
                        </div>

                        {upNext.length > 0 && (
                          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-2 w-100" style={{ fontSize: 12, color: '#64748b' }} onClick={() => setShowHealthUpNext(!showHealthUpNext)}>
                              <i className={`bi ${showHealthUpNext ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 10 }}></i>
                              <span>Up next ({upNext.length} more step{upNext.length > 1 ? 's' : ''})</span>
                            </button>
                            {showHealthUpNext && (
                              <div className="mt-2">
                                {upNext.map((s, i) => (
                                  <div key={i} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, borderLeft: `3px solid ${s.color}` }}>
                                    <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: `${s.color}20`, color: s.color, fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 2}</span>
                                    <div className="flex-grow-1">
                                      <div className="fw-medium" style={{ fontSize: 11 }}>{s.title}</div>
                                      <div className="text-muted" style={{ fontSize: 9 }}>{s.explanation}</div>
                                    </div>
                                    <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => handleLearnAbout(selectedComponent)}>
                                        <i className="bi bi-book"></i>
                                      </button>
                                      <button className="btn btn-sm" style={{ fontSize: 8, padding: '1px 6px', background: s.color, color: '#fff' }} onClick={() => handleGeneratePrompt(selectedComponent)}>
                                        Run
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ── TAB: Improve (unified Cory format — forward-thinking AI) ── */}
              {workTab === 'improve' && (
                <div>
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <i className="bi bi-robot" style={{ color: '#8b5cf6', fontSize: 16 }}></i>
                    <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: '#8b5cf6' }}>Cory — Path to Autonomous</h6>
                  </div>

                  {(() => {
                    // Build improvement steps — mix of prerequisites (blue) and autonomy gaps (purple)
                    const improveSteps: Array<{ title: string; explanation: string; color: string; gapType?: string }> = [];
                    const hasBackend = selectedComponent.layers.backend !== 'missing';
                    const hasFrontend = selectedComponent.layers.frontend !== 'missing';

                    // Prerequisites first (blue)
                    if (!hasBackend) improveSteps.push({ title: 'Build backend services', explanation: 'Backend is missing — build services and routes before adding AI automation.', color: '#3b82f6' });
                    if (hasBackend && !hasFrontend) improveSteps.push({ title: 'Add frontend layer', explanation: 'Frontend is missing — add a user interface before optimizing with AI.', color: '#10b981' });

                    // Autonomy gaps (purple)
                    (compDetail?.autonomy_gaps || []).slice(0, 4).forEach((g: any) => {
                      improveSteps.push({ title: g.title, explanation: g.description?.substring(0, 150) || 'Autonomy gap — addressing this moves toward self-managing operation.', color: '#8b5cf6', gapType: g.gap_type });
                    });

                    // If no gaps, suggest agent enhancement
                    if (improveSteps.length === 0 && selectedComponent.layers.agent === 'missing' && hasBackend && hasFrontend) {
                      improveSteps.push({ title: 'Add intelligent automation agents', explanation: 'System works manually. Agents enable autonomous, self-managing operation.', color: '#8b5cf6' });
                    }

                    if (loadingDetail) return <div className="text-muted" style={{ fontSize: 11 }}><span className="spinner-border spinner-border-sm me-1"></span>Analyzing...</div>;

                    const primary = improveSteps[0];
                    const upNext = improveSteps.slice(1, 3);

                    if (!primary) return <p className="text-muted" style={{ fontSize: 12 }}>No improvements needed — this component is well-positioned for autonomous operation.</p>;

                    return (
                      <>
                        <div className="mb-2" style={{ fontSize: 10, color: '#64748b' }}>Step 1 of {Math.min(improveSteps.length, 3)} for {selectedComponent.name}</div>
                        <h6 className="fw-bold mb-1" style={{ fontSize: 15 }}>{primary.title}</h6>
                        <p className="mb-2" style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{primary.explanation}</p>

                        {primary.gapType && <span className="badge mb-3" style={{ background: `${primary.color}20`, color: primary.color, fontSize: 9 }}>{primary.gapType}</span>}

                        <div className="d-flex flex-wrap gap-2 mb-3">
                          <button className="btn btn-sm" style={{ background: primary.color, color: '#fff', fontWeight: 600, fontSize: 12 }} onClick={() => primary.color === '#3b82f6' ? setWorkTab('build') : handleGeneratePrompt(selectedComponent)}>
                            <i className={`bi ${primary.color === '#3b82f6' ? 'bi-hammer' : 'bi-terminal'} me-1`}></i>
                            {primary.color === '#3b82f6' ? 'Go to Build' : 'Generate Improvement Prompt'}
                          </button>
                          <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => handleLearnAbout(selectedComponent)}>
                            <i className="bi bi-book me-1"></i>Learn About This
                          </button>
                        </div>

                        {upNext.length > 0 && (
                          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-2 w-100" style={{ fontSize: 12, color: '#64748b' }} onClick={() => setShowImproveUpNext(!showImproveUpNext)}>
                              <i className={`bi ${showImproveUpNext ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 10 }}></i>
                              <span>Up next ({upNext.length} more step{upNext.length > 1 ? 's' : ''})</span>
                            </button>
                            {showImproveUpNext && (
                              <div className="mt-2">
                                {upNext.map((s, i) => (
                                  <div key={i} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, borderLeft: `3px solid ${s.color}` }}>
                                    <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: `${s.color}20`, color: s.color, fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 2}</span>
                                    <div className="flex-grow-1">
                                      <div className="fw-medium" style={{ fontSize: 11 }}>{s.title}</div>
                                      <div className="text-muted" style={{ fontSize: 9 }}>{s.explanation}</div>
                                    </div>
                                    <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => handleLearnAbout(selectedComponent)}>
                                        <i className="bi bi-book"></i>
                                      </button>
                                      <button className="btn btn-sm" style={{ fontSize: 8, padding: '1px 6px', background: s.color, color: '#fff' }} onClick={() => s.color === '#3b82f6' ? setWorkTab('build') : handleGeneratePrompt(selectedComponent)}>
                                        Run
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}

                </div>
              )}

              {/* ── TAB: UI (unified Cory format) ── */}
              {workTab === 'ui' && selectedComponent.ui.pages.length > 0 && (() => {
                const pages = selectedComponent.ui.pages;
                const safeIdx = Math.min(selectedPageIdx, pages.length - 1);
                const previewUrl = compDetail?.preview_url || undefined;
                const uiActions = [
                  { title: 'Improve page layout and hierarchy', explanation: 'Analyze spacing, visual hierarchy, and component structure.', feedback: 'Improve the page layout, spacing, and visual hierarchy' },
                  { title: 'Fix usability issues', explanation: 'Detect broken interactions, missing feedback, and accessibility gaps.', feedback: 'Find and fix usability issues and broken interactions' },
                  { title: 'Check mobile responsiveness', explanation: 'Ensure the UI works across all screen sizes and devices.', feedback: 'Make the layout responsive for mobile and tablet' },
                ];
                const primary = uiActions[0];
                const upNext = uiActions.slice(1);
                return (
                <div>
                  {/* Cory header */}
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <i className="bi bi-robot" style={{ color: '#10b981', fontSize: 16 }}></i>
                    <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: '#059669' }}>Cory — UI Advisor</h6>
                  </div>

                  {/* Page selector */}
                  {pages.length > 1 && (
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="text-muted" style={{ fontSize: 10 }}>Page:</span>
                      <select className="form-select form-select-sm" style={{ maxWidth: 220, fontSize: 10 }} value={safeIdx} onChange={e => setSelectedPageIdx(parseInt(e.target.value))}>
                        {pages.map((pg: UIPage, i: number) => <option key={pg.route + i} value={i}>{pg.name} ({pg.route})</option>)}
                      </select>
                    </div>
                  )}

                  {/* Preview iframe */}
                  {previewUrl ? (
                    <div className="mb-3" style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      <iframe key={`preview-${safeIdx}`} src={previewUrl} title="Page Preview" style={{ width: '100%', height: 500, border: 'none', background: '#fff' }} sandbox="allow-scripts allow-same-origin allow-forms" />
                    </div>
                  ) : (
                    <div className="mb-3 p-3 text-center" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                      <p className="text-muted small mb-0">Preview not available for this page.</p>
                    </div>
                  )}

                  {/* Primary recommendation */}
                  <div className="mb-2" style={{ fontSize: 10, color: '#64748b' }}>Step 1 of {uiActions.length} UI improvements</div>
                  <h6 className="fw-bold mb-1" style={{ fontSize: 15 }}>{primary.title}</h6>
                  <p className="mb-2" style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{primary.explanation}</p>

                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 12 }} disabled={uiAnalyzing}
                      onClick={() => handleUIAnalyze(selectedComponent.id, primary.feedback)}>
                      <i className="bi bi-play-fill me-1"></i>{uiAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                    </button>
                    <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => handleLearnAbout(selectedComponent)}>
                      <i className="bi bi-book me-1"></i>Learn About This
                    </button>
                  </div>

                  {/* Detected issues */}
                  {uiFeedback?.items?.length > 0 && (
                    <div className="mb-3">
                      <div className="fw-semibold small mb-2">Detected Issues ({uiFeedback.items.filter((f: any) => f.status !== 'dismissed').length})</div>
                      {uiFeedback.items.filter((f: any) => f.status !== 'dismissed').slice(0, 5).map((f: any) => (
                        <div key={f.id} className="d-flex gap-2 align-items-start py-1 mb-1" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 10 }}>
                          <span className="badge" style={{ fontSize: 8, background: f.severity === 'high' ? '#ef444420' : f.severity === 'medium' ? '#f59e0b20' : '#10b98120', color: f.severity === 'high' ? '#ef4444' : f.severity === 'medium' ? '#f59e0b' : '#10b981' }}>{f.severity}</span>
                          <div className="flex-grow-1">
                            <div className="fw-medium">{f.title}</div>
                            {f.suggestion && <div className="text-muted" style={{ fontSize: 9 }}>{f.suggestion.substring(0, 80)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Up next UI actions */}
                  <div className="pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="mb-2" style={{ fontSize: 12, color: '#64748b' }}>
                      <i className="bi bi-chevron-right me-1" style={{ fontSize: 10 }}></i>Up next ({upNext.length} more)
                    </div>
                    {upNext.map((a, i) => (
                      <div key={i} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6 }}>
                        <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: '#10b98120', color: '#059669', fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 2}</span>
                        <div className="flex-grow-1">
                          <div className="fw-medium" style={{ fontSize: 11 }}>{a.title}</div>
                          <div className="text-muted" style={{ fontSize: 9 }}>{a.explanation}</div>
                        </div>
                        <button className="btn btn-sm btn-outline-success" style={{ fontSize: 8, padding: '1px 6px', flexShrink: 0 }} disabled={uiAnalyzing}
                          onClick={() => handleUIAnalyze(selectedComponent.id, a.feedback)}>
                          Run
                        </button>
                      </div>
                    ))}
                  </div>

                </div>
                );
              })()}

              {/* ── REPORTING TABS ── */}

              {/* TAB: Insights */}
              {workTab === 'insights' && (
                <div>
                  <div className="row g-3 mb-3">
                    <div className="col-3">
                      <div className="p-2 text-center" style={{ background: '#eff6ff', borderRadius: 6 }}>
                        <div className="fw-bold" style={{ fontSize: 16, color: 'var(--color-primary)' }}>{selectedComponent.coverageRaw}%</div>
                        <div className="text-muted" style={{ fontSize: 9 }}>Coverage</div>
                      </div>
                    </div>
                    <div className="col-3">
                      <div className="p-2 text-center" style={{ background: '#e0f2fe', borderRadius: 6 }}>
                        <div className="fw-bold" style={{ fontSize: 16, color: '#0284c7' }}>{selectedComponent.readinessRaw}%</div>
                        <div className="text-muted" style={{ fontSize: 9 }}>Readiness</div>
                      </div>
                    </div>
                    <div className="col-3">
                      <div className="p-2 text-center" style={{ background: '#f0fdf4', borderRadius: 6 }}>
                        <div className="fw-bold" style={{ fontSize: 16, color: '#059669' }}>{selectedComponent.maturity}</div>
                        <div className="text-muted" style={{ fontSize: 9 }}>Maturity</div>
                      </div>
                    </div>
                    <div className="col-3">
                      <div className="p-2 text-center" style={{ background: selectedComponent.status === 'complete' ? '#f0fdf4' : '#fef3c7', borderRadius: 6 }}>
                        <div className="fw-bold" style={{ fontSize: 16, color: selectedComponent.status === 'complete' ? '#059669' : '#92400e' }}>{STATUS_STYLES[selectedComponent.status].label}</div>
                        <div className="text-muted" style={{ fontSize: 9 }}>Status</div>
                      </div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="fw-semibold small mb-1">Layer Health</div>
                    <div className="d-flex gap-3" style={{ fontSize: 11 }}>
                      {[{ label: 'Backend', val: selectedComponent.layers.backend }, { label: 'Frontend', val: selectedComponent.layers.frontend }, { label: 'Agents', val: selectedComponent.layers.agent }].map(l => (
                        <span key={l.label} className="d-flex align-items-center gap-1">
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: LAYER_COLORS[l.val] }}></div>
                          {l.label}: <strong style={{ color: l.val === 'ready' ? '#059669' : '#9ca3af' }}>{l.val}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                  {selectedComponent.description && <p className="text-muted mb-2" style={{ fontSize: 11 }}>{selectedComponent.description}</p>}
                  {/* System-wide metrics */}
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="fw-semibold small mb-2">System Overview</div>
                    <div className="row g-2">
                      {[
                        { label: 'Total', value: visibleComponents.filter(c => !c.isDiscovered).length, color: 'var(--color-primary)' },
                        { label: 'Completed', value: `${Math.round((completedCount / Math.max(visibleComponents.filter(c => !c.isDiscovered).length, 1)) * 100)}%`, color: '#059669' },
                        { label: 'No Backend', value: visibleComponents.filter(c => !c.isDiscovered && !c.isPageBP && c.layers.backend === 'missing').length, color: '#ef4444' },
                        { label: 'No UI', value: visibleComponents.filter(c => !c.isDiscovered && !c.isPageBP && c.layers.frontend === 'missing').length, color: '#f59e0b' },
                        { label: 'No Agents', value: visibleComponents.filter(c => !c.isDiscovered && !c.isPageBP && c.layers.agent === 'missing').length, color: '#9ca3af' },
                      ].map(k => (
                        <div key={k.label} className="col">
                          <div className="text-center p-1" style={{ background: 'var(--color-bg-alt)', borderRadius: 4 }}>
                            <div className="fw-bold" style={{ fontSize: 13, color: k.color }}>{k.value}</div>
                            <div className="text-muted" style={{ fontSize: 8 }}>{k.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: Gaps */}
              {workTab === 'gaps' && (
                <div>
                  {compDetail?.autonomy_gaps?.length > 0 ? (() => {
                    const gaps = compDetail.autonomy_gaps;
                    const high = gaps.filter((g: any) => g.severity >= 7);
                    const medium = gaps.filter((g: any) => g.severity >= 4 && g.severity < 7);
                    const low = gaps.filter((g: any) => g.severity < 4);
                    const renderGroup = (label: string, items: any[], color: string) => items.length > 0 ? (
                      <div className="mb-3">
                        <div className="fw-semibold small mb-1" style={{ color }}>{label} ({items.length})</div>
                        {items.map((g: any) => (
                          <div key={g.gap_id} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 10 }}>
                            <span className="badge" style={{ background: `${color}20`, color, fontSize: 8 }}>{g.severity}/10</span>
                            <div><div className="fw-medium">{g.title}</div><div className="text-muted" style={{ fontSize: 9 }}>{g.description?.substring(0, 100)}</div></div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                    return <>{renderGroup('High Severity', high, '#ef4444')}{renderGroup('Medium Severity', medium, '#f59e0b')}{renderGroup('Low Severity', low, '#10b981')}</>;
                  })() : (
                    <div>
                      {/* Layer gaps */}
                      {(selectedComponent.layers.backend === 'missing' || selectedComponent.layers.frontend === 'missing' || selectedComponent.layers.agent === 'missing') ? (
                        <div>
                          <div className="fw-semibold small mb-2">Missing Layers</div>
                          {selectedComponent.layers.backend === 'missing' && <div className="d-flex align-items-center gap-2 mb-1 p-2" style={{ background: '#fef2f2', borderRadius: 6, fontSize: 10 }}><i className="bi bi-exclamation-circle" style={{ color: '#ef4444' }}></i><span>Backend layer not detected</span></div>}
                          {selectedComponent.layers.frontend === 'missing' && <div className="d-flex align-items-center gap-2 mb-1 p-2" style={{ background: '#fef2f2', borderRadius: 6, fontSize: 10 }}><i className="bi bi-exclamation-circle" style={{ color: '#ef4444' }}></i><span>Frontend layer not detected</span></div>}
                          {selectedComponent.layers.agent === 'missing' && <div className="d-flex align-items-center gap-2 mb-1 p-2" style={{ background: '#fffbeb', borderRadius: 6, fontSize: 10 }}><i className="bi bi-exclamation-triangle" style={{ color: '#f59e0b' }}></i><span>Agent layer not detected</span></div>}
                        </div>
                      ) : (
                        <p className="text-muted mb-0" style={{ fontSize: 11 }}>No gaps detected for this component.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Trends / Execution History */}
              {workTab === 'trends' && (
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div className="fw-semibold small">Execution History</div>
                    <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 9 }}
                      onClick={() => portalApi.get('/api/portal/project/execution-activity').then((r: any) => setExecutionActivity(r.data.activities || [])).catch(() => {})}>
                      <i className="bi bi-arrow-clockwise me-1"></i>Load
                    </button>
                  </div>
                  {executionActivity.length > 0 ? (() => {
                    // Group by ticket
                    const grouped: Record<string, any[]> = {};
                    for (const a of executionActivity) {
                      const key = a.ticket_title || a.ticket_id;
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(a);
                    }
                    return Object.entries(grouped).map(([title, activities]) => (
                      <div key={title} className="mb-2">
                        <div className="fw-medium mb-1" style={{ fontSize: 11 }}>{title}</div>
                        {activities.map((a: any, i: number) => (
                          <div key={a.id || i} className="d-flex gap-2 py-1 ms-3" style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 8, fontSize: 10 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: a.action === 'created' ? '#3b82f6' : a.action === 'status_changed' ? '#f59e0b' : '#10b981', marginTop: 4, flexShrink: 0 }}></div>
                            <div>
                              <span className="text-muted">{a.action}{a.to_value ? ` → ${a.to_value}` : ''}</span>
                              <span className="text-muted ms-2" style={{ fontSize: 9 }}>{new Date(a.created_at).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                  })() : (
                    <div className="text-center py-3">
                      <i className="bi bi-activity d-block mb-1" style={{ fontSize: 20, color: '#9ca3af' }}></i>
                      <p className="text-muted mb-0" style={{ fontSize: 10 }}>Click "Load" to fetch execution history</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          ) : (
            /* ── Empty State ── */
            <div data-testid="work-area-empty"></div>
          )}
        </div>
      </div>

      </div>{/* end flex wrapper for map + work area */}

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3: EXECUTION BAR + MODE TOGGLE (Cory now embedded in tabs)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-4" data-testid="control-panel-section" style={{ borderLeft: `3px solid ${isReporting || autonomousMode ? '#8b5cf6' : '#3b82f6'}` }}>
        <div className="card-body py-3 px-4">
          {/* Slim execution bar */}
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-robot" style={{ color: autonomousMode ? '#8b5cf6' : '#3b82f6', fontSize: 14 }}></i>
              <span className="fw-semibold" style={{ fontSize: 12, color: autonomousMode ? '#8b5cf6' : 'var(--color-primary)' }}>Cory</span>
              {autonomousMode && <span className="badge" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 8 }}>Autonomous</span>}
              {execQueue.length > 0 && <span className="badge bg-primary" style={{ fontSize: 8 }}>Executing {execIndex + 1}/{execQueue.length}</span>}
            </div>
            <div className="d-flex align-items-center gap-2">
              {execQueue.length > 0 && (
                <div className="d-flex gap-1">
                  {!execPaused ? (
                    <button className="btn btn-sm btn-outline-warning" style={{ fontSize: 9 }} onClick={() => setExecPaused(true)}><i className="bi bi-pause-fill"></i></button>
                  ) : (
                    <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 9 }} onClick={() => setExecPaused(false)}><i className="bi bi-play-fill"></i></button>
                  )}
                  <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 9 }} onClick={handleExecExit}><i className="bi bi-x"></i></button>
                </div>
              )}
              {/* Mode toggle */}
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 9 }}>
                <span style={{ color: autonomousMode ? '#9ca3af' : 'var(--color-text)', fontWeight: autonomousMode ? 400 : 600 }}>Manual</span>
                <div className="form-check form-switch mb-0" style={{ minHeight: 0 }}>
                  <input className="form-check-input" type="checkbox" role="switch" checked={autonomousMode} onChange={() => setAutonomousMode(!autonomousMode)} style={{ cursor: 'pointer', width: 24, height: 12 }} />
                </div>
                <span style={{ color: autonomousMode ? '#8b5cf6' : '#9ca3af', fontWeight: autonomousMode ? 600 : 400 }}>Auto</span>
              </div>
            </div>
          </div>

          {/* Execution progress bar */}
          {execQueue.length > 0 && (
            <div className="mt-2">
              <div className="progress" style={{ height: 3, borderRadius: 2 }}>
                <div className="progress-bar" style={{ width: `${((execIndex + (buildResult ? 1 : 0)) / execQueue.length) * 100}%`, background: '#8b5cf6', borderRadius: 2, transition: 'width 0.5s' }}></div>
              </div>
              {execIndex > 0 && (
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {execQueue.slice(0, execIndex).map((s, i) => (
                    <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 7 }}><i className="bi bi-check me-1"></i>{s.title}</span>
                  ))}
                </div>
              )}
              {buildResult && !buildResult.error && (
                <button className="btn btn-sm w-100 mt-2" style={{ background: '#8b5cf6', color: '#fff', fontWeight: 600, fontSize: 10 }} onClick={handleExecNext}>
                  {execIndex + 1 < execQueue.length ? <><i className="bi bi-arrow-right me-1"></i>Next Step ({execIndex + 2}/{execQueue.length})</> : <><i className="bi bi-check-circle me-1"></i>Complete Plan</>}
                </button>
              )}
            </div>
          )}

          {/* Cory is now embedded in Work Area tabs — this panel is just execution control */}
          {/* Cory content moved to Work Area tabs */}
          {/* Cory suggestions + plan + reporting content moved to Work Area tabs */}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DEFINE COMPONENT MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {defineModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={() => setDefineModal(null)}>
          <div className="modal-dialog modal-dialog-centered modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header py-2" style={{ borderBottom: '3px solid #8b5cf6' }}>
                <h6 className="modal-title fw-bold" style={{ color: '#8b5cf6' }}>
                  <i className="bi bi-plus-circle me-2"></i>Define Component
                </h6>
                <button className="btn-close" onClick={() => setDefineModal(null)}></button>
              </div>
              <div className="modal-body p-4">
                {/* Step 1: Confirm page with editable URL + preview */}
                {defineStep === 'confirm' && (
                  <div>
                    <p className="fw-semibold mb-2" style={{ fontSize: 13 }}>Verify the page URL and preview</p>
                    <div className="fw-medium mb-2" style={{ fontSize: 12 }}>{defineModal.discoveredComp.name}</div>

                    {/* Editable URL */}
                    <div className="d-flex gap-2 mb-3">
                      <div className="flex-grow-1">
                        <label className="form-label" style={{ fontSize: 10, color: '#64748b' }}>Page URL</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={defineCustomUrl}
                          onChange={e => setDefineCustomUrl(e.target.value)}
                          placeholder="/utility-ai or https://enterprise.colaberry.ai/utility-ai"
                          style={{ fontSize: 11, fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>

                    {/* Live preview iframe */}
                    {defineCustomUrl ? (
                      <div className="mb-3" style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                        <iframe
                          key={defineCustomUrl}
                          src={defineCustomUrl.startsWith('http') ? defineCustomUrl : `https://enterprise.colaberry.ai${defineCustomUrl.startsWith('/') ? '' : '/'}${defineCustomUrl}`}
                          title="Page Preview"
                          style={{ width: '100%', height: 300, border: 'none', background: '#fff' }}
                          sandbox="allow-scripts allow-same-origin allow-forms"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 p-3 text-center" style={{ background: '#f8fafc', borderRadius: 8, border: '1px dashed var(--color-border)' }}>
                        <i className="bi bi-display d-block mb-1" style={{ fontSize: 20, color: '#9ca3af' }}></i>
                        <p className="text-muted mb-0" style={{ fontSize: 10 }}>Enter a URL above to see a preview</p>
                      </div>
                    )}
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => setDefineStep('action')}>
                        <i className="bi bi-check me-1"></i>This looks correct
                      </button>
                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => setDefineModal(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Step 2: Choose action */}
                {defineStep === 'action' && (
                  <div>
                    <p className="fw-semibold mb-3" style={{ fontSize: 13 }}>What would you like to do?</p>
                    <div className="d-flex flex-column gap-2">
                      <button className="btn btn-outline-primary text-start p-3" style={{ fontSize: 12 }} onClick={() => {
                        // Promote to business group (override isDiscovered)
                        setPromotedIds(prev => new Set([...prev, defineModal.discoveredComp.id]));
                        setDefineStep('done');
                      }}>
                        <i className="bi bi-plus-lg me-2"></i><strong>Keep as Standalone Component</strong>
                        <div className="text-muted" style={{ fontSize: 10 }}>Move this page into the appropriate system group</div>
                      </button>
                      <button className="btn btn-outline-secondary text-start p-3" style={{ fontSize: 12 }} onClick={() => setDefineStep('select')}>
                        <i className="bi bi-link-45deg me-2"></i><strong>Attach to Existing Component</strong>
                        <div className="text-muted" style={{ fontSize: 10 }}>Add this page's UI to an existing system component</div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Select target */}
                {defineStep === 'select' && (
                  <div>
                    <p className="fw-semibold mb-2" style={{ fontSize: 13 }}>Select a component to attach to:</p>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                      {visibleComponents.filter(c => !c.isDiscovered && !c.isPageBP).map(c => (
                        <div key={c.id} className="d-flex align-items-center gap-2 p-2 mb-1" style={{ background: defineTarget === c.id ? '#eff6ff' : 'var(--color-bg-alt)', borderRadius: 6, cursor: 'pointer', border: defineTarget === c.id ? '2px solid var(--color-primary)' : '2px solid transparent' }} onClick={() => setDefineTarget(c.id)}>
                          <i className="bi bi-circle" style={{ color: defineTarget === c.id ? 'var(--color-primary)' : '#9ca3af', fontSize: 10 }}></i>
                          <span style={{ fontSize: 11 }}>{c.name}</span>
                          <span className="badge ms-auto" style={{ background: STATUS_STYLES[c.status].bg, color: STATUS_STYLES[c.status].text, fontSize: 8 }}>{c.completion}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="d-flex gap-2 mt-3">
                      <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} disabled={!defineTarget} onClick={() => {
                        if (!defineTarget) return;
                        const page: UIPage = { name: defineModal.discoveredComp.name, route: defineCustomUrl || defineModal.discoveredComp.frontendRoute || '/', source: 'discovered', verified: true, confidence: 100, bpId: defineModal.discoveredComp.id };
                        setPageAttachments(prev => ({ ...prev, [defineTarget]: [...(prev[defineTarget] || []), page] }));
                        setIgnoredIds(prev => new Set([...prev, defineModal.discoveredComp.id]));
                        setDefineStep('done');
                      }}>
                        <i className="bi bi-link me-1"></i>Attach
                      </button>
                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => setDefineStep('action')}>Back</button>
                    </div>
                  </div>
                )}

                {/* Step 4: Done */}
                {defineStep === 'done' && (
                  <div className="text-center py-3">
                    <i className="bi bi-check-circle-fill d-block mb-2" style={{ fontSize: 28, color: '#10b981' }}></i>
                    <p className="fw-semibold mb-1" style={{ fontSize: 13 }}>Component defined</p>
                    <p className="text-muted mb-3" style={{ fontSize: 11 }}>The page has been mapped to your system.</p>
                    <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => { setDefineModal(null); setSelectedId(null); }}>Close</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          GUIDED ONBOARDING OVERLAY
          ═══════════════════════════════════════════════════════════════════ */}
      {isOnboarding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99990, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 460, background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            {/* Step indicator */}
            <div className="d-flex gap-1 mb-3 justify-content-center">
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= onboardingStep ? 'var(--color-primary)' : '#e2e8f0' }}></div>
              ))}
            </div>

            {onboardingStep === 0 && (
              <div className="text-center">
                <i className="bi bi-diagram-3 d-block mb-2" style={{ fontSize: 36, color: 'var(--color-primary)' }}></i>
                <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Welcome to Your AI System</h5>
                <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                  This is your AI system map. Each block represents a capability your system can build — backend services, user interfaces, intelligent agents.
                </p>
                <div className="d-flex gap-2 justify-content-center">
                  <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => setOnboardingStep(1)}>
                    <i className="bi bi-arrow-right me-1"></i>Show Me
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 10 }} onClick={() => { setOnboardingStep(-1); localStorage.setItem('system_v2_seen_intro', 'true'); }}>
                    Skip Tour
                  </button>
                </div>
              </div>
            )}

            {onboardingStep === 1 && (
              <div className="text-center">
                <i className="bi bi-cursor-fill d-block mb-2" style={{ fontSize: 36, color: '#f59e0b' }}></i>
                <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Your Next Upgrade</h5>
                <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                  We've selected the most impactful component to build next. The Work Area below now shows its details, layers, and recommended action.
                </p>
                <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => { setOnboardingStep(2); setWorkTab('build'); }}>
                  <i className="bi bi-hammer me-1"></i>Let's Build
                </button>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="text-center">
                <i className="bi bi-terminal d-block mb-2" style={{ fontSize: 36, color: '#10b981' }}></i>
                <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Generate Your First Prompt</h5>
                <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                  Click <strong>"Generate Build Prompt"</strong> in the Build tab below. It creates a tailored prompt for Claude Code — copy it, run it, then paste the result back here.
                </p>
                <button className="btn btn-outline-primary btn-sm" style={{ fontSize: 12 }} onClick={() => { setOnboardingStep(-1); localStorage.setItem('system_v2_seen_intro', 'true'); }}>
                  <i className="bi bi-check me-1"></i>Got It — Close Tour
                </button>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="text-center">
                <i className="bi bi-check-circle-fill d-block mb-2" style={{ fontSize: 36, color: '#10b981' }}></i>
                <h5 className="fw-bold mb-2" style={{ color: '#059669' }}>You Just Upgraded Your System!</h5>
                <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                  Your system improved. Coverage, maturity, and readiness have been recalculated. Every build step moves you closer to production readiness.
                </p>
                <div className="d-flex gap-2 justify-content-center">
                  <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => { setOnboardingStep(-1); localStorage.setItem('system_v2_seen_intro', 'true'); }}>
                    <i className="bi bi-hammer me-1"></i>Continue Building
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 10 }} onClick={() => { setOnboardingStep(-1); localStorage.setItem('system_v2_seen_intro', 'true'); setSystemMode('reporting'); setWorkTab('overview'); setCoryMode('r-insights'); }}>
                    Explore Insights
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verify Page Modal */}
      {verifyModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={() => setVerifyModal(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header py-2" style={{ borderBottom: '3px solid #10b981' }}>
                <h6 className="modal-title fw-bold" style={{ color: '#059669' }}><i className="bi bi-check-circle me-2"></i>Verify Page</h6>
                <button className="btn-close" onClick={() => setVerifyModal(null)}></button>
              </div>
              <div className="modal-body p-4">
                <p className="fw-medium mb-2" style={{ fontSize: 13 }}>Does this page represent this component?</p>
                <div className="p-3 mb-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                  <div className="fw-medium" style={{ fontSize: 12 }}>{verifyModal.page.name}</div>
                  <div className="text-muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>{verifyModal.page.route}</div>
                  {verifyModal.page.confidence < 100 && <div className="mt-1" style={{ fontSize: 10, color: verifyModal.page.confidence >= 70 ? '#059669' : '#f59e0b' }}>Match confidence: {verifyModal.page.confidence}%</div>}
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-success" style={{ fontSize: 11 }} onClick={() => { setVerifiedPages(prev => new Set([...prev, `${verifyModal.compId}:${verifyModal.page.route}`])); setVerifyModal(null); }}>
                    <i className="bi bi-check me-1"></i>Yes — Verify
                  </button>
                  <button className="btn btn-sm btn-outline-danger" style={{ fontSize: 11 }} onClick={() => { setDetachedPages(prev => new Set([...prev, `${verifyModal.compId}:${verifyModal.page.route}`])); setVerifyModal(null); }}>
                    <i className="bi bi-x me-1"></i>No — Detach
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Merge Detection Modal */}
      {mergeModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={() => setMergeModal(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header py-2" style={{ borderBottom: '3px solid #f59e0b' }}>
                <h6 className="modal-title fw-bold" style={{ color: '#92400e' }}><i className="bi bi-exclamation-triangle me-2"></i>Page Overlap Detected</h6>
                <button className="btn-close" onClick={() => setMergeModal(null)}></button>
              </div>
              <div className="modal-body p-4">
                <p className="mb-3" style={{ fontSize: 12 }}>This page may already belong to another component.</p>
                <div className="d-flex flex-column gap-2">
                  <button className="btn btn-outline-primary btn-sm text-start p-2" style={{ fontSize: 11 }} onClick={() => { setMergeModal(null); }}>
                    <i className="bi bi-link me-2"></i>Attach to both components
                  </button>
                  <button className="btn btn-outline-warning btn-sm text-start p-2" style={{ fontSize: 11 }} onClick={() => { setDetachedPages(prev => new Set([...prev, `${mergeModal.existingCompId}:${mergeModal.page.route}`])); setMergeModal(null); }}>
                    <i className="bi bi-arrow-right me-2"></i>Move to this component only
                  </button>
                  <button className="btn btn-outline-secondary btn-sm text-start p-2" style={{ fontSize: 11 }} onClick={() => setMergeModal(null)}>
                    <i className="bi bi-x me-2"></i>Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemViewV2() {
  return <V2ErrorBoundary><SystemViewV2Inner /></V2ErrorBoundary>;
}
