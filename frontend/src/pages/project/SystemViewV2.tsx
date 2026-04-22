/**
 * System View V2 — Foundation Layer
 *
 * 3-section layout: System Map | Work Area | Control Panel
 * Reuses existing APIs — no new backend endpoints
 * componentId sync via URL param + local state
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import ProjectSetupWizard from '../../components/project/ProjectSetupWizard';
import ProjectSelectionScreen from '../../components/project/ProjectSelectionScreen';

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
  layers: { backend: string; frontend: string; agent: string };
  ui: { pages: UIPage[] };
}

interface ProjectData {
  id: string;
  organization_name?: string;
  industry?: string;
  project_stage: string;
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
      const isComplete = bp.is_complete === true;
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
        layers: {
          backend: u.backend || 'missing',
          frontend: u.frontend || 'missing',
          agent: u.agent || 'missing',
        },
        ui: {
          pages: isPageBP && bp.frontend_route ? [{
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
    // Discovered/unmapped go to their own group first
    if (c.isDiscovered) { discovered.push(c); continue; }
    const name = c.name.toLowerCase();
    // All auto-discovered page BPs go to discovered regardless of completion
    if (c.isPageBP) { discovered.push(c); continue; }
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
    if (c.isDiscovered || (c.isPageBP && c.source === 'frontend_page')) { discovered.push(c); continue; }
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
  const urlComponentId = searchParams.get('componentId');

  // Global mode
  type SystemMode = 'build' | 'reporting';
  const [systemMode, setSystemModeState] = useState<SystemMode>(() => (localStorage.getItem('system_mode') as SystemMode) || 'build');
  const setSystemMode = (m: SystemMode) => { setSystemModeState(m); localStorage.setItem('system_mode', m); };
  const isReporting = systemMode === 'reporting';

  const [project, setProject] = useState<ProjectData | null>(null);
  const [components, setComponents] = useState<SystemComponent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(urlComponentId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [discoveredExpanded, setDiscoveredExpanded] = useState(false);
  const workAreaRef = useRef<HTMLDivElement>(null);

  // Work Area state
  type WorkTab = 'overview' | 'build' | 'improve' | 'ui' | 'insights' | 'gaps' | 'trends';
  const [workTab, setWorkTab] = useState<WorkTab>('overview');
  const [compDetail, setCompDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Build flow state
  const [buildPrompt, setBuildPrompt] = useState<string | null>(null);
  const [buildGenerating, setBuildGenerating] = useState(false);
  const [buildReport, setBuildReport] = useState('');
  const [buildValidating, setBuildValidating] = useState(false);
  const [buildResult, setBuildResult] = useState<any>(null);

  // UI feedback state
  const [uiAnalyzing, setUiAnalyzing] = useState(false);
  const [uiFeedback, setUiFeedback] = useState<any>(null);

  // Page attachment state
  const [pageAttachments, setPageAttachments] = useState<Record<string, UIPage[]>>({});
  const [defineModal, setDefineModal] = useState<{ discoveredComp: SystemComponent } | null>(null);
  const [defineStep, setDefineStep] = useState<'confirm' | 'action' | 'select' | 'done'>('confirm');
  const [defineTarget, setDefineTarget] = useState<string | null>(null);
  const [verifiedPages, setVerifiedPages] = useState<Set<string>>(new Set()); // route keys
  const [detachedPages, setDetachedPages] = useState<Set<string>>(new Set()); // route keys
  const [groupMode, setGroupMode] = useState<'business' | 'technical'>('business');
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

  // Sync URL param → state
  useEffect(() => {
    if (urlComponentId) setSelectedId(urlComponentId);
  }, [urlComponentId]);

  // Fetch detail + reset work area when component changes
  useEffect(() => {
    setCompDetail(null);
    setBuildPrompt(null);
    setBuildReport('');
    setBuildResult(null);
    setUiFeedback(null);
    setWorkTab('overview');
    if (!selectedId) return;
    setLoadingDetail(true);
    portalApi.get(`/api/portal/project/business-processes/${selectedId}`)
      .then((r: any) => setCompDetail(r.data))
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const loadData = useCallback(() => {
    return Promise.all([
      portalApi.get('/api/portal/project'),
      portalApi.get('/api/portal/project/business-processes'),
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

  // Render guards
  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
        <p className="text-muted mt-2" style={{ fontSize: 13 }}>Loading System View V2...</p>
      </div>
    );
  }

  if (error === 'no-project') return <ProjectSelectionScreen />;
  if (project?.setup_status && !project.setup_status.activated) {
    return <ProjectSetupWizard initialStatus={project.setup_status} onActivated={() => window.location.reload()} />;
  }
  if (error || !project) {
    return <div className="alert alert-danger">{error || 'Failed to load project'}</div>;
  }

  const completedCount = components.filter(c => c.status === 'complete').length;
  const systemLayers = {
    backend: components.some(c => c.layers.backend === 'ready' || c.layers.backend === 'partial'),
    frontend: components.some(c => c.layers.frontend === 'ready' || c.layers.frontend === 'partial'),
    agents: components.some(c => c.layers.agent === 'ready' || c.layers.agent === 'partial'),
  };

  // Merge page attachments + auto-detect page matches into components
  const enrichedComponents = components.map(c => {
    const attached = pageAttachments[c.id] || [];
    const autoPages: UIPage[] = [];
    // Auto-detect: match discovered page BPs to code BPs by name similarity with confidence
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
    return { ...c, ui: { pages: allPages } };
  });
  const visibleComponents = enrichedComponents.filter(c => !ignoredIds.has(c.id));
  const selectedComponent = selectedId ? enrichedComponents.find(c => c.id === selectedId) : null;
  const groups = groupMode === 'business' ? groupByBusinessDomain(visibleComponents) : groupComponents(visibleComponents);
  const nextIds = getNextComponents(visibleComponents);

  // Intelligence helper
  const getWhyMatters = (c: SystemComponent): string => {
    const t = c.promptTarget;
    if (t === 'backend_improvement' || (!systemLayers.backend && c.status === 'not_started')) return 'Your system currently has no backend logic. Without this, nothing can process data or handle user actions.';
    if (t === 'frontend_exposure' || (systemLayers.backend && !systemLayers.frontend && !c.isPageBP)) return 'Your system has logic but no user interface. Users cannot interact with it yet.';
    if (t === 'agent_enhancement' || (systemLayers.backend && systemLayers.frontend && !systemLayers.agents)) return 'Your system works, but lacks automation. Adding agents will allow it to operate independently.';
    if (c.completion < 50) return 'Core capabilities are incomplete. This step fills critical gaps in your system functionality.';
    return `Completing this step advances "${c.name}" toward production readiness.`;
  };

  // Build handlers
  const handleGeneratePrompt = async (comp: SystemComponent) => {
    setBuildGenerating(true);
    setBuildPrompt(null);
    setBuildResult(null);
    try {
      let target = comp.promptTarget;
      if (!target && compDetail) {
        const firstStep = (compDetail.execution_plan || []).find((s: any) => !s.blocked);
        target = firstStep?.prompt_target || 'backend_improvement';
      }
      const res = await portalApi.post(`/api/portal/project/business-processes/${comp.id}/prompt`, { target: target || 'backend_improvement' });
      const text = res.data?.prompt_text || '';
      setBuildPrompt(text);
      try { await navigator.clipboard.writeText(text); } catch {}
    } catch {} finally { setBuildGenerating(false); }
  };

  const handleValidateBuild = async (compId: string) => {
    if (!buildReport.trim()) return;
    setBuildValidating(true);
    try {
      const res = await portalApi.post(`/api/portal/project/business-processes/${compId}/validation-report`, { reportText: buildReport.trim() });
      setBuildResult(res.data);
      await loadData(); // refresh components
    } catch (err: any) {
      setBuildResult({ error: err.response?.data?.error || 'Validation failed' });
    } finally { setBuildValidating(false); }
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
    setTimeout(() => workAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  };

  // Execution queue
  const handleStartExec = async () => {
    if (allPlanSteps.length === 0) return;
    setExecQueue(allPlanSteps);
    setExecIndex(0);
    setExecPaused(false);
    setCoryMode('execute');
    // Start first step
    const first = allPlanSteps[0];
    setSelectedId(first.componentId);
    setWorkTab('build');
    setBuildGenerating(true);
    setBuildPrompt(null);
    setBuildResult(null);
    try {
      const res = await portalApi.post(`/api/portal/project/business-processes/${first.componentId}/prompt`, { target: first.promptTarget });
      const text = res.data?.prompt_text || '';
      setBuildPrompt(text);
      try { await navigator.clipboard.writeText(text); } catch {}
    } catch {} finally { setBuildGenerating(false); }
  };

  const handleExecNext = async () => {
    const next = execIndex + 1;
    if (next >= execQueue.length) { setExecQueue([]); setExecIndex(0); setCoryMode('suggestions'); await loadData(); return; }
    setExecIndex(next);
    const step = execQueue[next];
    setSelectedId(step.componentId);
    setWorkTab('build');
    setBuildPrompt(null);
    setBuildReport('');
    setBuildResult(null);
    setBuildGenerating(true);
    try {
      const res = await portalApi.post(`/api/portal/project/business-processes/${step.componentId}/prompt`, { target: step.promptTarget });
      const text = res.data?.prompt_text || '';
      setBuildPrompt(text);
      try { await navigator.clipboard.writeText(text); } catch {}
    } catch {} finally { setBuildGenerating(false); }
  };

  const handleExecExit = () => { setExecQueue([]); setExecIndex(0); setExecPaused(false); setCoryMode('suggestions'); };

  const handleTileClick = (id: string) => {
    const isDeselect = id === selectedId;
    setSelectedId(isDeselect ? null : id);
    if (!isDeselect) {
      setTimeout(() => workAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
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

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1: SYSTEM MAP
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-3" data-testid="system-map-section" style={{ minHeight: 280 }}>
        <div className="card-body p-4">
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
            <div className="d-flex gap-2">
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemLayers.backend ? '#10b981' : '#e2e8f0' }}></div>
                <span className="text-muted">Backend</span>
              </div>
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemLayers.frontend ? '#10b981' : '#e2e8f0' }}></div>
                <span className="text-muted">Frontend</span>
              </div>
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemLayers.agents ? '#10b981' : '#e2e8f0' }}></div>
                <span className="text-muted">Agents</span>
              </div>
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
          SECTION 2: WORK AREA (Tabbed Workspace)
          ═══════════════════════════════════════════════════════════════════ */}
      <div ref={workAreaRef} className="card border-0 shadow-sm mb-3" data-testid="work-area-section" style={{ minHeight: 200 }}>
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
                    if (c.isDiscovered || c.isPageBP) continue;
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
                <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => { setDefineModal({ discoveredComp: selectedComponent }); setDefineStep('confirm'); setDefineTarget(null); }}>
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
                  <span>Coverage <strong>{selectedComponent.completion}%</strong></span>
                  <span>Readiness <strong>{selectedComponent.completion}%</strong></span>
                </div>
              </div>

              {/* ── Tabs (mode-dependent) ── */}
              <nav className="nav nav-tabs mb-3" style={{ fontSize: 12 }}>
                {(isReporting
                  ? [{ key: 'overview' as WorkTab, icon: 'bi-eye', label: 'Overview' }, { key: 'insights' as WorkTab, icon: 'bi-graph-up', label: 'Insights' }, { key: 'gaps' as WorkTab, icon: 'bi-exclamation-triangle', label: 'Gaps' }, { key: 'trends' as WorkTab, icon: 'bi-activity', label: 'Trends' }]
                  : [{ key: 'overview' as WorkTab, icon: 'bi-eye', label: 'Overview' }, { key: 'build' as WorkTab, icon: 'bi-hammer', label: 'Build' }, { key: 'improve' as WorkTab, icon: 'bi-graph-up-arrow', label: 'Improve' }]
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

              {/* ── TAB: Overview ── */}
              {workTab === 'overview' && (
                <div>
                  {/* Purpose */}
                  <p className="mb-3" style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                    <i className="bi bi-info-circle me-1" style={{ color: '#3b82f6' }}></i>{getComponentPurpose(selectedComponent.name)}
                  </p>
                  {selectedComponent.description && <p className="text-muted mb-3" style={{ fontSize: 11 }}>{selectedComponent.description}</p>}
                  <div className="d-flex gap-3 mb-3" style={{ fontSize: 11 }}>
                    <span className="d-flex align-items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: '50%', background: LAYER_COLORS[selectedComponent.layers.backend] }}></div> Backend: <strong>{selectedComponent.layers.backend}</strong></span>
                    <span className="d-flex align-items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: '50%', background: LAYER_COLORS[selectedComponent.layers.frontend] }}></div> Frontend: <strong>{selectedComponent.layers.frontend}</strong></span>
                    <span className="d-flex align-items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: '50%', background: LAYER_COLORS[selectedComponent.layers.agent] }}></div> Agents: <strong>{selectedComponent.layers.agent}</strong></span>
                  </div>
                  <div className="p-2 mb-3" style={{ background: '#eff6ff', borderRadius: 6, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                    <i className="bi bi-lightbulb me-1" style={{ color: '#3b82f6' }}></i>{getWhyMatters(selectedComponent)}
                  </div>
                  {selectedComponent.nextStep && (
                    <div className="p-2 mb-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 11 }}>
                      <i className="bi bi-arrow-right-circle me-1" style={{ color: 'var(--color-primary)' }}></i>Next step: <strong>{selectedComponent.nextStep}</strong>
                    </div>
                  )}

                  {/* Connected UI section */}
                  {selectedComponent.ui.pages.length > 0 ? (
                    <div>
                      <div className="fw-semibold small mb-2"><i className="bi bi-display me-1" style={{ color: '#3b82f6' }}></i>Connected UI</div>
                      {selectedComponent.ui.pages.map((pg, i) => (
                        <div key={pg.route + i} className="d-flex align-items-center gap-2 mb-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6 }}>
                          <i className="bi bi-display" style={{ color: pg.verified ? '#10b981' : '#f59e0b', fontSize: 12 }}></i>
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-medium" style={{ fontSize: 11 }}>{pg.name}</span>
                              {pg.confidence < 70 && pg.source === 'discovered' && <i className="bi bi-exclamation-triangle" style={{ color: '#f59e0b', fontSize: 10 }} title="Low confidence match"></i>}
                            </div>
                            <div className="d-flex gap-2" style={{ fontSize: 9 }}>
                              <span className="text-muted" style={{ fontFamily: 'monospace' }}>{pg.route}</span>
                              <span style={{ color: pg.verified ? '#059669' : '#f59e0b' }}>{pg.verified ? 'Verified' : 'Unverified'}</span>
                              <span className="text-muted">{pg.source === 'mapped' ? 'Mapped' : `Auto-detected (${pg.confidence}%)`}</span>
                            </div>
                          </div>
                          <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                            {!pg.verified && (
                              <button className="btn btn-sm btn-outline-success" style={{ fontSize: 8, padding: '1px 5px' }} onClick={() => setVerifyModal({ page: pg, compId: selectedComponent.id })}>
                                Verify
                              </button>
                            )}
                            <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 5px' }} onClick={() => setDetachedPages(prev => new Set([...prev, `${selectedComponent.id}:${pg.route}`]))}>
                              Detach
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : selectedComponent.layers.frontend !== 'missing' ? (
                    <div className="p-2" style={{ background: '#fef3c7', borderRadius: 6, fontSize: 11, border: '1px solid #fde68a' }}>
                      <i className="bi bi-exclamation-triangle me-1" style={{ color: '#f59e0b' }}></i>
                      Frontend detected, but no UI page is linked.
                      <button className="btn btn-link btn-sm p-0 ms-2" style={{ fontSize: 10 }} onClick={() => setWorkTab('ui')}>Find Matching Page</button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* ── TAB: Build ── */}
              {workTab === 'build' && (
                <div>
                  {!buildPrompt && !buildGenerating && (
                    <div>
                      <p className="text-muted mb-3" style={{ fontSize: 11 }}>Generate a build prompt for this component. The prompt will be tailored to your codebase and copied to clipboard.</p>
                      <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} disabled={buildGenerating} onClick={() => handleGeneratePrompt(selectedComponent)}>
                        <i className="bi bi-terminal me-1"></i>Generate Build Prompt
                      </button>
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
                      <div className="mb-3 p-3" style={{ background: '#1e293b', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                        <pre style={{ color: '#e2e8f0', fontSize: 10, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{buildPrompt}</pre>
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
                          <div className="fw-bold small mb-1" style={{ color: '#059669' }}><i className="bi bi-check-circle-fill me-1"></i>Build Validated</div>
                          <div style={{ fontSize: 11 }}><strong>{buildResult.requirementsVerified || 0}</strong> of {buildResult.requirementsTotal || 0} requirements verified</div>
                          <button className="btn btn-sm btn-outline-primary mt-2" style={{ fontSize: 10 }} onClick={() => { setBuildPrompt(null); setBuildReport(''); setBuildResult(null); }}>
                            <i className="bi bi-arrow-repeat me-1"></i>Build Again
                          </button>
                        </div>
                      )}
                      {buildResult?.error && <div className="alert alert-danger py-2" style={{ fontSize: 11 }}>{buildResult.error}</div>}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Improve ── */}
              {workTab === 'improve' && (
                <div>
                  {compDetail?.autonomy_gaps?.length > 0 ? (
                    <div>
                      <p className="text-muted mb-2" style={{ fontSize: 11 }}>System-detected gaps for this component:</p>
                      {compDetail.autonomy_gaps.slice(0, 3).map((g: any) => (
                        <div key={g.gap_id} className="d-flex align-items-start gap-2 mb-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 11 }}>
                          <i className={`bi ${g.gap_type === 'behavior' ? 'bi-person-lines-fill' : g.gap_type === 'intelligence' ? 'bi-lightbulb' : g.gap_type === 'optimization' ? 'bi-speedometer2' : 'bi-bar-chart-line'}`} style={{ color: '#8b5cf6', marginTop: 2 }}></i>
                          <div>
                            <div className="fw-medium">{g.title}</div>
                            <div className="text-muted" style={{ fontSize: 10 }}>{g.description?.substring(0, 120)}</div>
                            <span className="badge mt-1" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 8 }}>{g.gap_type}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : loadingDetail ? (
                    <div className="text-muted" style={{ fontSize: 11 }}><span className="spinner-border spinner-border-sm me-1"></span>Loading suggestions...</div>
                  ) : (
                    <p className="text-muted mb-0" style={{ fontSize: 11 }}>No improvement suggestions at this time — this component is on track.</p>
                  )}
                </div>
              )}

              {/* ── TAB: UI (any component with pages) ── */}
              {workTab === 'ui' && selectedComponent.ui.pages.length > 0 && (
                <div>
                  {/* Preview iframe */}
                  {compDetail?.preview_url ? (
                    <div className="mb-3" style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      <iframe src={compDetail.preview_url} title="Page Preview" style={{ width: '100%', height: 300, border: 'none', background: '#fff' }} sandbox="allow-scripts allow-same-origin allow-forms" />
                    </div>
                  ) : (
                    <div className="mb-3 p-3 text-center" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                      <p className="text-muted small mb-0">Preview not available for this page.</p>
                    </div>
                  )}
                  {/* Quick actions */}
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {[
                      { label: 'Improve Layout', feedback: 'Improve the page layout, spacing, and visual hierarchy' },
                      { label: 'Fix UX Issues', feedback: 'Find and fix usability issues and broken interactions' },
                      { label: 'Mobile Responsive', feedback: 'Make the layout responsive for mobile and tablet' },
                    ].map(a => (
                      <button key={a.label} className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} disabled={uiAnalyzing}
                        onClick={() => handleUIAnalyze(selectedComponent.id, a.feedback)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                  {uiAnalyzing && <div className="text-muted" style={{ fontSize: 11 }}><span className="spinner-border spinner-border-sm me-1"></span>Analyzing page...</div>}
                  {/* Issues */}
                  {uiFeedback?.items?.length > 0 && (
                    <div>
                      <div className="fw-semibold small mb-2">Detected Issues</div>
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
                </div>
              )}

              {/* ── REPORTING TABS ── */}

              {/* TAB: Insights */}
              {workTab === 'insights' && (
                <div>
                  <div className="row g-3 mb-3">
                    <div className="col-4">
                      <div className="p-2 text-center" style={{ background: '#eff6ff', borderRadius: 6 }}>
                        <div className="fw-bold" style={{ fontSize: 16, color: 'var(--color-primary)' }}>{selectedComponent.completion}%</div>
                        <div className="text-muted" style={{ fontSize: 9 }}>Coverage</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="p-2 text-center" style={{ background: '#f0fdf4', borderRadius: 6 }}>
                        <div className="fw-bold" style={{ fontSize: 16, color: '#059669' }}>{selectedComponent.maturity}</div>
                        <div className="text-muted" style={{ fontSize: 9 }}>Maturity</div>
                      </div>
                    </div>
                    <div className="col-4">
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

              {/* TAB: Trends */}
              {workTab === 'trends' && (
                <div className="text-center py-4">
                  <i className="bi bi-activity d-block mb-2" style={{ fontSize: 24, color: '#9ca3af' }}></i>
                  <p className="fw-medium mb-1" style={{ fontSize: 12, color: 'var(--color-text)' }}>Trend data will appear as your system evolves</p>
                  <p className="text-muted mb-0" style={{ fontSize: 10 }}>Build and validate components to start tracking coverage, readiness, and maturity over time.</p>
                </div>
              )}
            </div>

          ) : (
            /* ── Empty State ── */
            <div className="text-center py-4" data-testid="work-area-empty">
              <i className="bi bi-cursor-fill d-block mb-2" style={{ fontSize: 24, color: '#9ca3af' }}></i>
              <p className="text-muted mb-0" style={{ fontSize: 12 }}>Select a component from the System Map to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3: CORY COMMAND CENTER
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-4" data-testid="control-panel-section" style={{ minHeight: 220, borderLeft: `4px solid ${isReporting || autonomousMode ? '#8b5cf6' : '#3b82f6'}` }}>
        <div className="card-body p-4">
          {/* Header + Mode Tabs */}
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-robot" style={{ color: autonomousMode ? '#8b5cf6' : '#3b82f6', fontSize: 16 }}></i>
              <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: autonomousMode ? '#8b5cf6' : 'var(--color-primary)' }}>Cory Command Center</h6>
            </div>
            <div className="btn-group" style={{ fontSize: 10 }}>
              {(isReporting
                ? [{ key: 'r-insights' as CoryMode, icon: 'bi-graph-up', label: 'Insights' }, { key: 'r-gaps' as CoryMode, icon: 'bi-exclamation-triangle', label: 'Gaps' }, { key: 'r-recommendations' as CoryMode, icon: 'bi-lightbulb', label: 'Recommendations' }]
                : [{ key: 'suggestions' as CoryMode, icon: 'bi-lightbulb', label: 'Suggestions' }, { key: 'plan' as CoryMode, icon: 'bi-map', label: 'Plan' }, { key: 'execute' as CoryMode, icon: 'bi-play-fill', label: 'Execute' }]
              ).map(m => (
                <button key={m.key} className={`btn btn-sm ${coryMode === m.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                  style={{ fontSize: 10, padding: '2px 10px', ...(coryMode === m.key && isReporting ? { background: '#8b5cf6', borderColor: '#8b5cf6' } : {}) }}
                  onClick={() => setCoryMode(m.key)}>
                  <i className={`bi ${m.icon} me-1`}></i>{m.label}
                </button>
              ))}
            </div>
          </div>

          {autonomousMode && (
            <div className="mb-2" style={{ fontSize: 10, color: '#8b5cf6' }}>
              <i className="bi bi-lightning-fill me-1"></i>Cory is actively guiding your system
            </div>
          )}

          {/* ── SUGGESTIONS MODE ── */}
          {coryMode === 'suggestions' && (
            <div>
              {corySuggestions.length > 0 ? corySuggestions.map(sg => {
                const ic: Record<string, { bg: string; text: string }> = { High: { bg: '#ef444420', text: '#ef4444' }, Medium: { bg: '#f59e0b20', text: '#92400e' }, Low: { bg: '#10b98120', text: '#059669' } };
                const c = ic[sg.impact] || ic.Medium;
                return (
                  <div key={sg.id} className="d-flex align-items-start gap-2 mb-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6 }}>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-semibold" style={{ fontSize: 11 }}>{sg.title}</span>
                        <span className="badge" style={{ background: c.bg, color: c.text, fontSize: 8 }}>{sg.impact}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: 10 }}>{sg.explanation}</div>
                    </div>
                    <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                      <button className="btn btn-sm btn-primary" style={{ fontSize: 9, padding: '2px 8px' }} onClick={() => handleApplySuggestion(sg)}>Apply</button>
                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 9, padding: '2px 8px' }} onClick={() => setDismissedSuggestions(prev => new Set([...prev, sg.id]))}>Dismiss</button>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-muted mb-0" style={{ fontSize: 11 }}>
                  {selectedComponent ? 'No suggestions — this component is on track.' : 'Select a component to see recommendations.'}
                </p>
              )}
            </div>
          )}

          {/* ── PLAN MODE ── */}
          {coryMode === 'plan' && (
            <div>
              {coryPlanPhases.length > 0 ? (
                <div>
                  <p className="text-muted mb-2" style={{ fontSize: 10 }}>{allPlanSteps.length} steps remaining</p>
                  {coryPlanPhases.map((phase, pi) => (
                    <div key={phase.title} className="mb-3">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: phase.color, color: '#fff', fontSize: 9 }}>{pi + 1}</span>
                        <span className="fw-semibold" style={{ fontSize: 11 }}><i className={`bi ${phase.icon} me-1`}></i>{phase.title}</span>
                      </div>
                      {phase.steps.map(step => (
                        <div key={step.id} className="d-flex align-items-center gap-2 ms-4 mb-1" style={{ fontSize: 10, opacity: step.done ? 0.5 : 1 }}>
                          <i className={`bi ${step.done ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ color: step.done ? '#10b981' : '#9ca3af', fontSize: 10 }}></i>
                          <span style={{ textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</span>
                          {!step.done && (
                            <button className="btn btn-sm btn-outline-primary ms-auto" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => handleApplySuggestion({ id: step.id, title: step.title, explanation: '', impact: 'High', componentId: step.componentId, promptTarget: step.promptTarget })}>
                              Apply
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  {allPlanSteps.length > 0 && (
                    <button className="btn btn-sm w-100 mt-2" style={{ background: autonomousMode ? '#8b5cf6' : 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: 11 }} onClick={handleStartExec}>
                      <i className="bi bi-play-fill me-1"></i>Execute Plan ({allPlanSteps.length} steps)
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-muted mb-0" style={{ fontSize: 11 }}><i className="bi bi-check-circle me-1" style={{ color: '#10b981' }}></i>All plan phases complete.</p>
              )}
            </div>
          )}

          {/* ── EXECUTE MODE ── */}
          {coryMode === 'execute' && (
            <div>
              {execQueue.length > 0 ? (
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div>
                      <div className="fw-semibold" style={{ fontSize: 12 }}>Executing Plan — Step {execIndex + 1} of {execQueue.length}</div>
                      <div className="text-muted" style={{ fontSize: 10 }}>{execQueue[execIndex]?.title}</div>
                    </div>
                    <div className="d-flex gap-1">
                      {!execPaused ? (
                        <button className="btn btn-sm btn-outline-warning" style={{ fontSize: 9 }} onClick={() => setExecPaused(true)}><i className="bi bi-pause-fill me-1"></i>Pause</button>
                      ) : (
                        <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 9 }} onClick={() => setExecPaused(false)}><i className="bi bi-play-fill me-1"></i>Resume</button>
                      )}
                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 9 }} onClick={handleExecExit}><i className="bi bi-x-circle me-1"></i>Exit</button>
                    </div>
                  </div>
                  <div className="progress mb-2" style={{ height: 4, borderRadius: 2 }}>
                    <div className="progress-bar" style={{ width: `${((execIndex + (buildResult ? 1 : 0)) / execQueue.length) * 100}%`, background: '#8b5cf6', borderRadius: 2, transition: 'width 0.5s' }}></div>
                  </div>
                  {execIndex > 0 && (
                    <div className="d-flex flex-wrap gap-1 mb-2">
                      {execQueue.slice(0, execIndex).map((s, i) => (
                        <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 8 }}><i className="bi bi-check me-1"></i>{s.title}</span>
                      ))}
                    </div>
                  )}
                  {buildResult && !buildResult.error && (
                    <button className="btn btn-sm w-100" style={{ background: '#8b5cf6', color: '#fff', fontWeight: 600, fontSize: 11 }} onClick={handleExecNext}>
                      {execIndex + 1 < execQueue.length ? <><i className="bi bi-arrow-right me-1"></i>Next Step ({execIndex + 2}/{execQueue.length})</> : <><i className="bi bi-check-circle me-1"></i>Complete Plan</>}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-muted mb-2" style={{ fontSize: 11 }}>No execution in progress.</p>
                  <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }} onClick={() => setCoryMode('plan')}>
                    <i className="bi bi-map me-1"></i>View Plan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── REPORTING: INSIGHTS ── */}
          {coryMode === 'r-insights' && (
            <div>
              <div className="row g-2 mb-3">
                {[
                  { label: 'Components', value: visibleComponents.length, color: 'var(--color-primary)' },
                  { label: 'Complete', value: completedCount, color: '#059669' },
                  { label: 'In Progress', value: visibleComponents.filter(c => c.status === 'in_progress').length, color: '#f59e0b' },
                  { label: 'Not Started', value: visibleComponents.filter(c => c.status === 'not_started').length, color: '#ef4444' },
                ].map(k => (
                  <div key={k.label} className="col-3">
                    <div className="text-center p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6 }}>
                      <div className="fw-bold" style={{ fontSize: 14, color: k.color }}>{k.value}</div>
                      <div className="text-muted" style={{ fontSize: 8 }}>{k.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11 }}>
                <div className="fw-semibold small mb-1">System Health</div>
                <div className="d-flex gap-3 text-muted">
                  <span>Backend: <strong style={{ color: systemLayers.backend ? '#059669' : '#ef4444' }}>{systemLayers.backend ? 'Ready' : 'Missing'}</strong></span>
                  <span>Frontend: <strong style={{ color: systemLayers.frontend ? '#059669' : '#ef4444' }}>{systemLayers.frontend ? 'Ready' : 'Missing'}</strong></span>
                  <span>Agents: <strong style={{ color: systemLayers.agents ? '#059669' : '#ef4444' }}>{systemLayers.agents ? 'Ready' : 'Missing'}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* ── REPORTING: GAPS ── */}
          {coryMode === 'r-gaps' && (
            <div>
              {(() => {
                const gapComponents = visibleComponents.filter(c => c.status !== 'complete');
                const missingLayers = visibleComponents.filter(c => c.layers.backend === 'missing' && !c.isPageBP && !c.isDiscovered);
                return gapComponents.length > 0 ? (
                  <div>
                    {missingLayers.length > 0 && (
                      <div className="mb-2">
                        <div className="fw-semibold small mb-1" style={{ color: '#ef4444' }}>Missing Backend ({missingLayers.length})</div>
                        {missingLayers.slice(0, 3).map(c => (
                          <div key={c.id} className="d-flex align-items-center gap-2 mb-1 p-1" style={{ background: '#fef2f2', borderRadius: 4, fontSize: 10 }}>
                            <i className="bi bi-exclamation-circle" style={{ color: '#ef4444', fontSize: 9 }}></i>
                            <span>{c.name} — {c.completion}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="fw-semibold small mb-1">Low Coverage ({gapComponents.filter(c => c.completion < 50).length})</div>
                    {gapComponents.filter(c => c.completion < 50).slice(0, 5).map(c => (
                      <div key={c.id} className="d-flex align-items-center justify-content-between mb-1 p-1" style={{ background: 'var(--color-bg-alt)', borderRadius: 4, fontSize: 10 }}>
                        <span>{c.name}</span>
                        <span className="fw-semibold" style={{ color: c.completion < 20 ? '#ef4444' : '#f59e0b' }}>{c.completion}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted mb-0" style={{ fontSize: 11 }}>No gaps detected — all components are on track.</p>
                );
              })()}
            </div>
          )}

          {/* ── REPORTING: RECOMMENDATIONS ── */}
          {coryMode === 'r-recommendations' && (
            <div>
              {corySuggestions.length > 0 ? corySuggestions.map(sg => {
                const ic: Record<string, { bg: string; text: string }> = { High: { bg: '#ef444420', text: '#ef4444' }, Medium: { bg: '#f59e0b20', text: '#92400e' }, Low: { bg: '#10b98120', text: '#059669' } };
                const c = ic[sg.impact] || ic.Medium;
                return (
                  <div key={sg.id} className="d-flex align-items-start gap-2 mb-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6 }}>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2"><span className="fw-semibold" style={{ fontSize: 11 }}>{sg.title}</span><span className="badge" style={{ background: c.bg, color: c.text, fontSize: 8 }}>{sg.impact}</span></div>
                      <div className="text-muted" style={{ fontSize: 10 }}>{sg.explanation}</div>
                    </div>
                    <button className="btn btn-sm btn-primary" style={{ fontSize: 9, padding: '2px 8px', flexShrink: 0 }} onClick={() => { setSystemMode('build'); setCoryMode('suggestions'); handleApplySuggestion(sg); }}>Apply</button>
                  </div>
                );
              }) : (
                <p className="text-muted mb-0" style={{ fontSize: 11 }}>No recommendations at this time — system is on track.</p>
              )}
            </div>
          )}

          {/* Footer: Mode Toggle */}
          <div className="mt-3 pt-3 d-flex align-items-center justify-content-between" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
              <span style={{ fontWeight: autonomousMode ? 400 : 600, color: autonomousMode ? '#9ca3af' : 'var(--color-text)' }}>Manual</span>
              <div className="form-check form-switch mb-0" style={{ minHeight: 0 }}>
                <input className="form-check-input" type="checkbox" role="switch" checked={autonomousMode} onChange={() => setAutonomousMode(!autonomousMode)} style={{ cursor: 'pointer', width: 28, height: 14 }} />
              </div>
              <span style={{ fontWeight: autonomousMode ? 600 : 400, color: autonomousMode ? '#8b5cf6' : '#9ca3af', fontSize: 10 }}>Autonomous</span>
            </div>
            {selectedComponent && (
              <span className="text-muted" style={{ fontSize: 9 }}>Context: {selectedComponent.name}</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DEFINE COMPONENT MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {defineModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={() => setDefineModal(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header py-2" style={{ borderBottom: '3px solid #8b5cf6' }}>
                <h6 className="modal-title fw-bold" style={{ color: '#8b5cf6' }}>
                  <i className="bi bi-plus-circle me-2"></i>Define Component
                </h6>
                <button className="btn-close" onClick={() => setDefineModal(null)}></button>
              </div>
              <div className="modal-body p-4">
                {/* Step 1: Confirm page */}
                {defineStep === 'confirm' && (
                  <div>
                    <p className="fw-semibold mb-2" style={{ fontSize: 13 }}>Is this the correct page?</p>
                    <div className="p-3 mb-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                      <div className="fw-medium" style={{ fontSize: 12 }}>{defineModal.discoveredComp.name}</div>
                      {defineModal.discoveredComp.frontendRoute && (
                        <div className="text-muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>{defineModal.discoveredComp.frontendRoute}</div>
                      )}
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => setDefineStep('action')}>
                        <i className="bi bi-check me-1"></i>Yes, this is correct
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
                        // Attach to itself as a standalone
                        setIgnoredIds(prev => { const n = new Set(prev); n.delete(defineModal.discoveredComp.id); return n; });
                        setDefineStep('done');
                      }}>
                        <i className="bi bi-plus-lg me-2"></i><strong>Keep as Standalone Component</strong>
                        <div className="text-muted" style={{ fontSize: 10 }}>Keep this page as its own system component</div>
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
                        const page: UIPage = { name: defineModal.discoveredComp.name, route: defineModal.discoveredComp.frontendRoute || '/', source: 'discovered', verified: true, confidence: 100, bpId: defineModal.discoveredComp.id };
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
