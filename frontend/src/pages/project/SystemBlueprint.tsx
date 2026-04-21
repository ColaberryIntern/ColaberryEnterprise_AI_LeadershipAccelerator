/**
 * DEMO MODE:
 * Trigger via ?demo=true
 * Used for product walkthroughs and sales demos
 * Uses mock data only — no backend calls
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import * as bpApi from '../../services/portalBusinessProcessApi';
import ProjectSetupWizard from '../../components/project/ProjectSetupWizard';
import ProjectSelectionScreen from '../../components/project/ProjectSelectionScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectData {
  id: string;
  organization_name?: string;
  industry?: string;
  project_stage: string;
  primary_business_problem?: string;
  selected_use_case?: string;
  project_variables?: Record<string, any>;
  requirements_completion_pct?: number;
  setup_status?: {
    requirements_loaded: boolean;
    claude_md_loaded: boolean;
    github_connected: boolean;
    activated: boolean;
  } | null;
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
  priority: number;
  layers: { backend: string; frontend: string; agent: string };
}

interface ProgressData {
  productionReadinessScore: number;
  requirementsCompletionPct: number;
}

type BuildPhase = 'idle' | 'generating' | 'waiting_for_execution' | 'validating' | 'validated';

interface BuildState {
  phase: BuildPhase;
  prompt: string | null;
  reportText: string;
  validationResult: any | null;
  beforeMetrics: { coverage: number; maturityLevel: number; readiness: number } | null;
  pasteDetected: boolean;
}

// ---------------------------------------------------------------------------
// Constants & Intelligence helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  complete: { bg: '#10b98120', text: '#059669', label: 'Complete' },
  in_progress: { bg: '#f59e0b20', text: '#92400e', label: 'In Progress' },
  not_started: { bg: '#e2e8f020', text: '#9ca3af', label: 'Not Started' },
};

const MATURITY_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#8b5cf6',
};

const MATURITY_LABELS: Record<number, string> = {
  0: 'L0 Not Started', 1: 'L1 Prototype', 2: 'L2 Functional',
  3: 'L3 Production', 4: 'L4 Autonomous', 5: 'L5 Self-Optimizing',
};

const TARGET_DESCRIPTIONS: Record<string, string> = {
  backend_improvement: 'This will create backend services and API routes for processing data.',
  frontend_exposure: 'This will create the user interface so people can interact with your system.',
  agent_enhancement: 'This will add an AI agent to automate decisions and operations.',
  add_database: 'This will create database models for persistent, structured data storage.',
  requirement_implementation: 'This will implement specific requirements from your specification.',
  improve_reliability: 'This will add error handling, validation, and retry logic.',
  verify_requirements: 'This will verify that matched requirements are actually implemented.',
  optimize_performance: 'This will optimize database queries, caching, and response times.',
  monitoring_gap: 'This will add logging, metrics tracking, and alerting.',
};

function getSystemLevel(maturityLevels: number[]): { level: string; label: string } {
  if (maturityLevels.length === 0) return { level: 'L0', label: 'Not Started' };
  const avg = maturityLevels.reduce((a, b) => a + b, 0) / maturityLevels.length;
  if (avg >= 4.5) return { level: 'L5', label: 'Self-Optimizing' };
  if (avg >= 3.5) return { level: 'L4', label: 'Autonomous' };
  if (avg >= 2.5) return { level: 'L3', label: 'Production' };
  if (avg >= 1.5) return { level: 'L2', label: 'Functional' };
  if (avg >= 0.5) return { level: 'L1', label: 'Prototype' };
  return { level: 'L0', label: 'Not Started' };
}

function getStepTitle(comp: SystemComponent): string {
  const name = comp.name;
  const target = comp.promptTarget;
  if (!target) return `Build ${name}`;
  const m: Record<string, string> = {
    backend_improvement: `Enable your system to process and manage ${name}`,
    frontend_exposure: `Create the interface for ${name} so users can interact with it`,
    agent_enhancement: `Add intelligent automation to ${name}`,
    add_database: `Set up data persistence for ${name}`,
    requirement_implementation: `Implement core requirements for ${name}`,
    improve_reliability: `Strengthen error handling and reliability for ${name}`,
    verify_requirements: `Verify that ${name} meets its requirements`,
    optimize_performance: `Optimize ${name} for speed and efficiency`,
    monitoring_gap: `Add monitoring and observability to ${name}`,
  };
  return m[target] || `Build ${name}`;
}

function getWhyThisMatters(comp: SystemComponent, sys: { backend: boolean; frontend: boolean; agents: boolean }): string {
  const t = comp.promptTarget;
  if (t === 'backend_improvement' || (!sys.backend && comp.status === 'not_started'))
    return 'Your system currently has no backend logic. Without this, nothing can process data or handle user actions.';
  if (t === 'frontend_exposure' || (sys.backend && !sys.frontend && !comp.isPageBP))
    return 'Your system has logic but no user interface. Users cannot interact with it yet.';
  if (t === 'agent_enhancement' || (sys.backend && sys.frontend && !sys.agents))
    return 'Your system works, but lacks automation. Adding agents will allow it to operate independently.';
  if (t === 'add_database') return 'Without a data layer, your system cannot persist information between sessions.';
  if (comp.completion < 50) return 'Core capabilities are incomplete. This step fills critical gaps in your system functionality.';
  if (t === 'improve_reliability') return 'Reliability improvements ensure your system handles errors gracefully and recovers from failures.';
  if (t === 'verify_requirements') return 'Verification confirms that your implementation actually meets the specification.';
  if (t === 'optimize_performance') return 'Performance optimization ensures your system stays responsive as usage grows.';
  return `Completing this step advances "${comp.name}" toward production readiness.`;
}

function getCelebrationSubtext(result: any): string {
  if (result.parsed?.filesCreated?.length > 0) {
    const hasBackend = result.parsed.filesCreated.some((f: string) => /service|route|controller|api/i.test(f));
    const hasFrontend = result.parsed.filesCreated.some((f: string) => /component|page|\.tsx|\.jsx/i.test(f));
    const hasAgent = result.parsed.filesCreated.some((f: string) => /agent/i.test(f));
    if (hasAgent) return 'Your system is now capable of autonomous actions';
    if (hasFrontend) return 'Users can now interact with your system';
    if (hasBackend) return 'Your system can now process real data';
  }
  return 'Your system is evolving toward production readiness';
}

function getImprovements(result: any, before: { coverage: number; maturityLevel: number; readiness: number } | null): string[] {
  const items: string[] = [];
  const after = result.metrics_after;
  if (!after) return items;
  if (result.parsed?.filesCreated?.length > 0) {
    const hasB = result.parsed.filesCreated.some((f: string) => /service|route|controller|api/i.test(f));
    const hasF = result.parsed.filesCreated.some((f: string) => /component|page|\.tsx|\.jsx/i.test(f));
    const hasA = result.parsed.filesCreated.some((f: string) => /agent/i.test(f));
    if (hasB) items.push('Backend layer established');
    if (hasF) items.push('Frontend layer established');
    if (hasA) items.push('Agent layer established');
  }
  if (before) {
    if (after.reqCoverage > before.coverage) items.push(`Requirements coverage increased from ${before.coverage}% to ${after.reqCoverage}%`);
    if (after.maturityLevel > before.maturityLevel) items.push(`System moved from ${MATURITY_LABELS[before.maturityLevel] || 'L' + before.maturityLevel} to ${MATURITY_LABELS[after.maturityLevel] || 'L' + after.maturityLevel}`);
    if (after.readiness > before.readiness) items.push(`Readiness improved from ${before.readiness}% to ${after.readiness}%`);
  }
  if (result.parsed?.routes?.length > 0) items.push(`${result.parsed.routes.length} API route${result.parsed.routes.length > 1 ? 's' : ''} added`);
  return items;
}

function transformCapabilities(bps: any[]): SystemComponent[] {
  return bps
    .filter((bp: any) => (bp.applicability_status || 'active') === 'active')
    .map((bp: any) => {
      const coverage = bp.metrics?.requirements_coverage || 0;
      const readiness = bp.metrics?.system_readiness || 0;
      const maturityLevel = bp.maturity?.level || 0;
      const isComplete = bp.is_complete === true;
      const isPageBP = bp.source === 'frontend_page' || bp.is_page_bp === true;
      const u = bp.usability || {};
      let status: 'complete' | 'in_progress' | 'not_started';
      if (isComplete) status = 'complete';
      else if (coverage > 10 || readiness > 10 || maturityLevel >= 1) status = 'in_progress';
      else status = 'not_started';
      const completion = Math.round(Math.max(coverage, readiness));
      const firstStep = (bp.execution_plan || []).find((s: any) => !s.blocked);
      return {
        id: bp.id, name: bp.name, description: bp.description || '', status, completion,
        maturity: MATURITY_LABELS[maturityLevel] || `L${maturityLevel}`, maturityLevel,
        nextStep: firstStep?.label || null, promptTarget: firstStep?.prompt_target || null,
        isPageBP, priority: bp.priority_rank || 999,
        layers: { backend: u.backend || 'missing', frontend: u.frontend || 'missing', agent: u.agent || 'missing' },
      };
    })
    .sort((a, b) => {
      if (a.status === 'complete' && b.status !== 'complete') return 1;
      if (a.status !== 'complete' && b.status === 'complete') return -1;
      return a.priority - b.priority;
    });
}

function showToast(msg: string, color: string = '#1a365d') {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:${color};color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-check-circle me-2"></i>${msg}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
}

// ---------------------------------------------------------------------------
// Demo Mode — mock data & step definitions
// ---------------------------------------------------------------------------

const DEMO_MOCK_PROMPT = `You are operating in Claude Code PLAN MODE.

DO NOT start coding immediately. Study the codebase first.

# OBJECTIVE
Build the backend services and API routes for the "Lead Management" business process.

# WHAT TO BUILD
1. Create a LeadService with core CRUD operations
2. Create API routes: POST /api/leads, GET /api/leads, GET /api/leads/:id
3. Create Lead database model with fields: name, email, source, status
4. Register routes in the main router

# CONSTRAINTS
- Follow existing patterns in the codebase
- All changes must be additive

# VALIDATION REPORT (REQUIRED AT END)
After implementation, output the validation report format.`;

const DEMO_MOCK_REPORT = `VALIDATION REPORT

Files Created:
- backend/src/services/leadService.ts
- backend/src/routes/leadRoutes.ts
- backend/src/models/Lead.ts

Routes:
- POST /api/leads
- GET /api/leads
- GET /api/leads/:id

Database:
- leads

Status: COMPLETE`;

const DEMO_MOCK_VALIDATION = {
  requirementsVerified: 4,
  requirementsTotal: 12,
  parsed: {
    filesCreated: ['backend/src/services/leadService.ts', 'backend/src/routes/leadRoutes.ts', 'backend/src/models/Lead.ts'],
    routes: ['POST /api/leads', 'GET /api/leads', 'GET /api/leads/:id'],
  },
  metrics_after: { reqCoverage: 42, maturityLevel: 2, readiness: 38 },
};

interface DemoStep {
  label: string;
  overlay: string;
  duration: number; // ms
}

const DEMO_STEPS: DemoStep[] = [
  { label: 'Current Build Step', overlay: 'Your system already understands what you\'re building — here\'s the next upgrade.', duration: 6000 },
  { label: 'Generate Prompt', overlay: 'With one click, we generate exactly what your system needs next.', duration: 5000 },
  { label: 'Prompt Ready', overlay: 'The prompt is automatically copied — ready for Claude Code to execute.', duration: 6000 },
  { label: 'Paste Result', overlay: 'Claude builds production-ready logic — you bring the result back.', duration: 5000 },
  { label: 'Validate', overlay: 'The system verifies everything that was built.', duration: 5000 },
  { label: 'Celebration', overlay: 'Your system updates itself — no manual tracking required.', duration: 9000 },
  { label: 'Next Step', overlay: 'And immediately guides you to the next step.', duration: 6000 },
];

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

function LayerDot({ status, label }: { status: string; label: string }) {
  const colors: Record<string, string> = { ready: '#10b981', partial: '#f59e0b', missing: '#e2e8f0' };
  const textColors: Record<string, string> = { ready: '#059669', partial: '#92400e', missing: '#9ca3af' };
  const isNA = status === 'n/a';
  return (
    <div className="d-flex align-items-center gap-2">
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isNA ? '#e2e8f0' : (colors[status] || '#e2e8f0'), flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: isNA ? '#9ca3af' : (textColors[status] || '#9ca3af'), fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 10, color: isNA ? '#d1d5db' : (textColors[status] || '#9ca3af') }}>
        {isNA ? 'N/A' : status === 'ready' ? 'Ready' : status === 'partial' ? 'Partial' : 'Missing'}
      </span>
    </div>
  );
}

function DemoOverlay({ text, onExit }: { text: string; onExit: () => void }) {
  return (
    <div className="demo-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 500, textAlign: 'center' }}>
        <p style={{ color: '#fff', fontSize: 16, lineHeight: 1.7, fontWeight: 500, marginBottom: 24 }}>{text}</p>
        <button className="btn btn-sm btn-outline-light" style={{ fontSize: 11 }} onClick={onExit}>
          <i className="bi bi-x-circle me-1"></i>Exit Demo
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Blueprint Page
// ---------------------------------------------------------------------------

const INITIAL_BUILD: BuildState = { phase: 'idle', prompt: null, reportText: '', validationResult: null, beforeMetrics: null, pasteDetected: false };

export default function SystemBlueprint() {
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [components, setComponents] = useState<SystemComponent[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [build, setBuild] = useState<BuildState>(INITIAL_BUILD);
  const [showPrompt, setShowPrompt] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const prevReportLen = useRef(0);

  // Banner state (persisted via localStorage)
  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem('blueprint_banner_dismissed') === 'true');

  // Demo state
  const [demoActive, setDemoActive] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const demoTimerRef = useRef<any>(null);
  const demoStartedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadData = useCallback(() => {
    return Promise.all([
      portalApi.get('/api/portal/project'),
      portalApi.get('/api/portal/project/business-processes'),
      portalApi.get('/api/portal/project/progress').catch(() => ({ data: null })),
    ]).then(([projRes, bpRes, progRes]) => {
      setProject(projRes.data);
      setComponents(transformCapabilities(bpRes.data || []));
      if (progRes.data) setProgress(progRes.data);
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

  // Auto-scroll to results
  useEffect(() => {
    if (build.phase === 'validated' && resultRef.current) {
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [build.phase]);

  // Auto-start demo from URL param (once only, guarded by ref)
  const demoParam = searchParams.get('demo');
  useEffect(() => {
    if (demoParam === 'true' && !loading && !demoStartedRef.current && project) {
      demoStartedRef.current = true;
      startDemo();
    }
  }, [demoParam, loading, project]);

  // ---------------------------------------------------------------------------
  // Demo engine
  // ---------------------------------------------------------------------------

  const startDemo = () => {
    setDemoActive(true);
    setDemoStep(0);
    // Reset build to idle
    setBuild(INITIAL_BUILD);
    setShowPrompt(false);
    runDemoStep(0);
  };

  const runDemoStep = (step: number) => {
    if (step >= DEMO_STEPS.length) {
      // Demo complete
      setDemoActive(false);
      setBuild(INITIAL_BUILD);
      return;
    }
    setDemoStep(step);

    // Apply side-effects per step
    if (step === 1) {
      // Simulate generating
      setBuild(prev => ({ ...prev, phase: 'generating', beforeMetrics: { coverage: 12, maturityLevel: 1, readiness: 12 } }));
    } else if (step === 2) {
      // Prompt ready
      setBuild(prev => ({ ...prev, phase: 'waiting_for_execution', prompt: DEMO_MOCK_PROMPT }));
      setShowPrompt(true);
    } else if (step === 3) {
      // Simulate paste
      setBuild(prev => ({ ...prev, reportText: DEMO_MOCK_REPORT, pasteDetected: true }));
      setShowPrompt(false);
    } else if (step === 4) {
      // Validating
      setBuild(prev => ({ ...prev, phase: 'validating' }));
    } else if (step === 5) {
      // Validated
      setBuild(prev => ({ ...prev, phase: 'validated', validationResult: DEMO_MOCK_VALIDATION }));
    } else if (step === 6) {
      // Show next step
      setBuild(INITIAL_BUILD);
    }

    // Schedule next step
    demoTimerRef.current = setTimeout(() => runDemoStep(step + 1), DEMO_STEPS[step].duration);
  };

  const exitDemo = () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    setDemoActive(false);
    setBuild(INITIAL_BUILD);
    setShowPrompt(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (demoTimerRef.current) clearTimeout(demoTimerRef.current); };
  }, []);

  // ---------------------------------------------------------------------------
  // Build actions (real mode only)
  // ---------------------------------------------------------------------------

  const handleGeneratePrompt = async (comp: SystemComponent) => {
    if (demoActive) return;
    const beforeMetrics = { coverage: comp.completion, maturityLevel: comp.maturityLevel, readiness: comp.completion };
    setBuild(prev => ({ ...prev, phase: 'generating', prompt: null, validationResult: null, beforeMetrics, pasteDetected: false }));
    try {
      let target = comp.promptTarget;
      if (!target) {
        const detail = await bpApi.getProcess(comp.id);
        const firstStep = (detail.data?.execution_plan || []).find((s: any) => !s.blocked);
        target = firstStep?.prompt_target || 'backend_improvement';
      }
      const res = await bpApi.generatePrompt(comp.id, target || 'backend_improvement');
      const promptText = res.data?.prompt_text || '';
      await copyText(promptText);
      showToast('Prompt copied — paste into Claude Code');
      setBuild(prev => ({ ...prev, phase: 'waiting_for_execution', prompt: promptText }));
      setShowPrompt(false);
      prevReportLen.current = 0;
    } catch {
      showToast('Failed to generate prompt', '#ef4444');
      setBuild(prev => ({ ...prev, phase: 'idle' }));
    }
  };

  const handleCopyPrompt = async () => {
    if (!build.prompt || demoActive) return;
    await copyText(build.prompt);
    showToast('Prompt copied to clipboard');
  };

  const handleReportChange = (value: string) => {
    if (demoActive) return;
    const jump = value.length - prevReportLen.current;
    const isPaste = jump > 100;
    prevReportLen.current = value.length;
    setBuild(prev => ({ ...prev, reportText: value, pasteDetected: isPaste || prev.pasteDetected }));
  };

  const handleValidate = async (comp: SystemComponent) => {
    if (!build.reportText.trim() || demoActive) return;
    setBuild(prev => ({ ...prev, phase: 'validating' }));
    try {
      const res = await portalApi.post(`/api/portal/project/business-processes/${comp.id}/validation-report`, {
        reportText: build.reportText.trim(),
      });
      setBuild(prev => ({ ...prev, phase: 'validated', validationResult: res.data }));
      await loadData();
    } catch (err: any) {
      setBuild(prev => ({ ...prev, phase: 'waiting_for_execution', validationResult: { error: err.response?.data?.error || 'Validation failed' } }));
    }
  };

  const handleStartNext = () => {
    setBuild(INITIAL_BUILD);
    setShowPrompt(false);
    prevReportLen.current = 0;
  };

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
        <p className="text-muted mt-2" style={{ fontSize: 13 }}>Loading your system blueprint...</p>
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

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const recommended = components.find(c => c.status !== 'complete');
  const nextAfter = components.filter(c => c.status !== 'complete')[1] || null;
  const completedCount = components.filter(c => c.status === 'complete').length;
  const totalCount = components.length;
  const overallCompletion = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const readiness = progress?.productionReadinessScore || overallCompletion;
  const systemLevel = getSystemLevel(components.map(c => c.maturityLevel));
  const isInFlow = build.phase !== 'idle';

  const systemLayers = {
    backend: components.some(c => c.layers.backend === 'ready' || c.layers.backend === 'partial'),
    frontend: components.some(c => c.layers.frontend === 'ready' || c.layers.frontend === 'partial'),
    agents: components.some(c => c.layers.agent === 'ready' || c.layers.agent === 'partial'),
  };

  const summaryText = project.primary_business_problem
    || project.project_variables?.system_prompt
    || project.selected_use_case
    || 'Your AI system is being built. Select components below to view details and generate implementation prompts.';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Demo overlay */}
      {demoActive && demoStep < DEMO_STEPS.length && (
        <DemoOverlay text={DEMO_STEPS[demoStep].overlay} onExit={exitDemo} />
      )}

      {/* ── Header ── */}
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            {project.organization_name || 'AI Project'}
          </h4>
          <div className="d-flex align-items-center gap-2">
            {project.industry && (
              <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10 }}>{project.industry}</span>
            )}
            <span className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 10 }}>
              {project.project_stage?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
        </div>
        <div className="d-flex gap-2">
          {!demoActive && !isInFlow && (
            <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }} onClick={startDemo}>
              <i className="bi bi-play-circle me-1"></i>Watch 60s Demo
            </button>
          )}
          <Link to="/portal/project/system" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }}>
            <i className="bi bi-grid-3x3-gap me-1"></i>Full System View
          </Link>
        </div>
      </div>

      {/* ── Beta Banner ── */}
      {!bannerDismissed && !demoActive && (
        <div className="d-flex align-items-center justify-content-between mb-3 px-3 py-2" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: 12, color: 'var(--color-primary)' }}>
            <i className="bi bi-stars me-1"></i>
            <strong>New:</strong> Guided Build Mode (Beta) — Build your system step-by-step with AI guidance
          </span>
          <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 14, lineHeight: 1 }} onClick={() => { setBannerDismissed(true); localStorage.setItem('blueprint_banner_dismissed', 'true'); }}>
            <i className="bi bi-x"></i>
          </button>
        </div>
      )}

      {/* ── Progress Bar ── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-3 px-4">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="d-flex align-items-center gap-3">
              <span className="fw-semibold" style={{ fontSize: 13, color: 'var(--color-primary)' }}>Production Readiness</span>
              <span className="badge" style={{ background: `${MATURITY_COLORS[Math.floor(Number(systemLevel.level.replace('L', '')))]}20`, color: MATURITY_COLORS[Math.floor(Number(systemLevel.level.replace('L', '')))], fontSize: 10, fontWeight: 700 }}>
                {systemLevel.level} {systemLevel.label}
              </span>
            </div>
            <span className="fw-bold" style={{ fontSize: 20, color: readiness >= 70 ? '#059669' : readiness >= 40 ? '#d97706' : '#ef4444' }}>
              {Math.round(readiness)}%
            </span>
          </div>
          <div className="progress" style={{ height: 8, borderRadius: 4 }}>
            <div className="progress-bar" style={{ width: `${readiness}%`, background: readiness >= 70 ? '#10b981' : readiness >= 40 ? '#f59e0b' : '#ef4444', borderRadius: 4, transition: 'width 0.6s ease' }} />
          </div>
          <div className="d-flex justify-content-between mt-2" style={{ fontSize: 11, color: '#9ca3af' }}>
            <span>{completedCount} of {totalCount} components complete</span>
            <span>{progress?.requirementsCompletionPct || 0}% requirements matched</span>
          </div>
        </div>
      </div>

      {/* ── IDLE: Summary + Status ── */}
      {!isInFlow && (
        <>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 16 }}>Your System Blueprint</h5>
              <p className="text-muted mb-0" style={{ fontSize: 13, lineHeight: 1.7 }}>
                {summaryText.length > 300 ? summaryText.substring(0, 300) + '...' : summaryText}
              </p>
            </div>
          </div>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body py-3 px-4">
              <span className="fw-semibold" style={{ fontSize: 12, color: 'var(--color-primary)' }}>System Status</span>
              <div className="d-flex gap-4 mt-2">
                <LayerDot status={systemLayers.backend ? 'ready' : 'missing'} label="Backend" />
                <LayerDot status={systemLayers.frontend ? 'ready' : 'missing'} label="Frontend" />
                <LayerDot status={systemLayers.agents ? 'ready' : 'missing'} label="Agents" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Build Flow Card ── */}
      {recommended && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div className="card-body p-4">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="d-flex align-items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {isInFlow ? 'Build Flow' : 'Current Build Step'}
                </span>
                <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 9 }}>{recommended.name}</span>
              </div>
              {isInFlow && !demoActive && (
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 10 }} onClick={handleStartNext}>
                  <i className="bi bi-x-circle me-1"></i>Switch Step
                </button>
              )}
            </div>

            <h6 className="fw-bold mb-1" style={{ color: 'var(--color-text)', fontSize: 15 }}>{getStepTitle(recommended)}</h6>
            <p className="mb-2" style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, fontStyle: 'italic' }}>{getWhyThisMatters(recommended, systemLayers)}</p>

            <div className="d-flex gap-2 mb-3">
              <span className="badge" style={{ background: STATUS_COLORS[recommended.status].bg, color: STATUS_COLORS[recommended.status].text, fontSize: 9 }}>{recommended.completion}% complete</span>
              <span className="badge" style={{ background: `${MATURITY_COLORS[recommended.maturityLevel]}20`, color: MATURITY_COLORS[recommended.maturityLevel], fontSize: 9 }}>{recommended.maturity}</span>
            </div>

            {/* PHASE: idle */}
            {build.phase === 'idle' && (
              <button className="btn btn-primary btn-sm" style={{ fontWeight: 600, fontSize: 12 }} onClick={() => handleGeneratePrompt(recommended)}>
                <i className="bi bi-terminal me-1"></i>Generate Build Prompt
              </button>
            )}

            {/* PHASE: generating */}
            {build.phase === 'generating' && (
              <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: 12 }}>
                <span className="spinner-border spinner-border-sm"></span>Generating prompt...
              </div>
            )}

            {/* PHASE: waiting_for_execution */}
            {build.phase === 'waiting_for_execution' && build.prompt && (
              <div>
                <div className="d-flex align-items-center gap-2 mb-3 p-3" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite', flexShrink: 0 }} />
                  <div>
                    <div className="fw-semibold" style={{ fontSize: 12, color: 'var(--color-primary)' }}>Run this in Claude Code — your system is about to evolve</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Paste this into Claude Code, run it, then bring the result back here</div>
                  </div>
                  <div className="ms-auto">
                    <a href="https://claude.ai/" target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }}>
                      <i className="bi bi-box-arrow-up-right me-1"></i>Open Claude
                    </a>
                  </div>
                </div>

                <div className="mb-2 d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#64748b' }}>
                  <i className="bi bi-info-circle" style={{ fontSize: 10 }}></i>
                  {TARGET_DESCRIPTIONS[recommended.promptTarget || ''] || 'This will implement the next component of your system.'}
                </div>

                <div className="d-flex align-items-center gap-2 mb-2">
                  <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} onClick={() => setShowPrompt(!showPrompt)}>
                    <i className={`bi bi-chevron-${showPrompt ? 'up' : 'down'} me-1`}></i>{showPrompt ? 'Hide Prompt' : 'Show Prompt'}
                  </button>
                  <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }} onClick={handleCopyPrompt}>
                    <i className="bi bi-clipboard me-1"></i>Copy Again
                  </button>
                </div>

                {showPrompt && (
                  <div className="mb-3 p-3" style={{ background: '#1e293b', borderRadius: 8, maxHeight: 250, overflowY: 'auto' }}>
                    <pre style={{ color: '#e2e8f0', fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{build.prompt}</pre>
                  </div>
                )}

                <div className="mt-3">
                  <label className="form-label fw-medium" style={{ fontSize: 12, color: 'var(--color-text)' }}>
                    <i className="bi bi-clipboard-check me-1"></i>Paste Claude Code Response
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={6}
                    placeholder={`VALIDATION REPORT\n\nFiles Created:\n- path/to/file1.ts\n\nRoutes:\n- GET /api/...\n\nStatus: COMPLETE`}
                    value={build.reportText}
                    onChange={e => handleReportChange(e.target.value)}
                    disabled={demoActive}
                    style={{ fontFamily: 'monospace', fontSize: 11, borderColor: build.pasteDetected ? '#10b981' : 'var(--color-border)', transition: 'border-color 0.3s' }}
                  />
                  {build.pasteDetected && build.reportText.trim() && (
                    <div className="d-flex align-items-center gap-1 mt-1" style={{ fontSize: 11, color: '#059669' }}>
                      <i className="bi bi-check-circle-fill"></i> Ready to validate
                    </div>
                  )}
                  <button
                    className="btn btn-sm mt-2"
                    style={{ background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 12, boxShadow: build.pasteDetected ? '0 0 0 3px #10b98140' : 'none', transition: 'box-shadow 0.3s' }}
                    disabled={!build.reportText.trim() || demoActive}
                    onClick={() => handleValidate(recommended)}
                  >
                    <i className="bi bi-check-circle me-1"></i>Validate Build
                  </button>
                </div>
              </div>
            )}

            {/* PHASE: validating */}
            {build.phase === 'validating' && (
              <div className="d-flex align-items-center gap-2 p-3" style={{ background: '#f0fdf4', borderRadius: 8 }}>
                <span className="spinner-border spinner-border-sm" style={{ color: '#10b981' }}></span>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>Analyzing your build...</span>
              </div>
            )}

            {/* PHASE: validated */}
            {build.phase === 'validated' && build.validationResult && (
              <div ref={resultRef}>
                {build.validationResult.error ? (
                  <div className="alert alert-danger py-2" style={{ fontSize: 12 }}>{build.validationResult.error}</div>
                ) : (
                  <div>
                    <div className="p-4 mb-3 text-center celebration-card" style={{ background: 'linear-gradient(135deg, #10b98115, #3b82f615)', borderRadius: 12, border: '1px solid #10b98130' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>
                        <i className="bi bi-rocket-takeoff" style={{ color: '#10b981' }}></i>
                      </div>
                      <h6 className="fw-bold mb-1" style={{ color: '#059669', fontSize: 18 }}>
                        Your system just leveled up
                      </h6>
                      <p className="mb-1" style={{ fontSize: 12, color: '#64748b' }}>
                        {getCelebrationSubtext(build.validationResult)}
                      </p>
                      <p className="mb-3" style={{ fontSize: 11, color: '#94a3b8' }}>
                        You're now closer to a production-ready system.
                      </p>
                      {(() => {
                        const improvements = getImprovements(build.validationResult, build.beforeMetrics);
                        return improvements.length > 0 ? (
                          <div className="d-flex flex-column align-items-center gap-1 mb-3" style={{ fontSize: 12 }}>
                            {improvements.map((item, i) => (
                              <span key={i} className="stagger-item" style={{ color: '#059669' }}><i className="bi bi-check2 me-1"></i>{item}</span>
                            ))}
                          </div>
                        ) : (
                          <div className="mb-3" style={{ fontSize: 12, color: '#059669' }}>
                            <strong>{build.validationResult.requirementsVerified || 0}</strong> of {build.validationResult.requirementsTotal || 0} requirements verified
                          </div>
                        );
                      })()}
                      {build.validationResult.metrics_after && (
                        <div className="d-flex justify-content-center gap-4" style={{ fontSize: 12 }}>
                          <span><strong style={{ color: '#059669', fontSize: 18 }}>{build.validationResult.metrics_after.reqCoverage}%</strong><br /><span className="text-muted" style={{ fontSize: 10 }}>Coverage</span></span>
                          <span><strong style={{ color: '#3b82f6', fontSize: 18 }}>L{build.validationResult.metrics_after.maturityLevel}</strong><br /><span className="text-muted" style={{ fontSize: 10 }}>Maturity</span></span>
                          <span><strong style={{ color: '#8b5cf6', fontSize: 18 }}>{build.validationResult.metrics_after.readiness}%</strong><br /><span className="text-muted" style={{ fontSize: 10 }}>Readiness</span></span>
                        </div>
                      )}
                    </div>

                    <div className="d-flex align-items-center justify-content-between p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12 }}>
                        <strong style={{ color: 'var(--color-text)' }}>You are now {Math.round(readiness)}% complete.</strong>
                        {nextAfter && <span className="text-muted ms-2">Next: {nextAfter.name}</span>}
                      </div>
                      {!demoActive && (
                        <button className="btn btn-primary btn-sm" style={{ fontWeight: 600, fontSize: 12 }} onClick={handleStartNext}>
                          <i className="bi bi-arrow-right me-1"></i>Continue to Next Step
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* After this step (idle only) */}
            {nextAfter && build.phase === 'idle' && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="d-flex align-items-center gap-2" style={{ fontSize: 11, color: '#9ca3af' }}>
                  <i className="bi bi-arrow-right-circle"></i>
                  <span>After this: <strong style={{ color: 'var(--color-text-light)' }}>{getStepTitle(nextAfter)}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All complete */}
      {!recommended && totalCount > 0 && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="card-body p-4 text-center">
            <i className="bi bi-trophy" style={{ fontSize: 32, color: '#10b981' }}></i>
            <h6 className="fw-bold mt-2 mb-1" style={{ color: '#059669' }}>All Components Complete</h6>
            <p className="text-muted mb-0" style={{ fontSize: 12 }}>Your system has reached production readiness.</p>
          </div>
        </div>
      )}

      {/* ── IDLE: Components Grid ── */}
      {!isInFlow && (
        <>
          <div className="mb-2 d-flex justify-content-between align-items-center">
            <h6 className="fw-bold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
              System Components
              <span className="badge ms-2" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10 }}>{totalCount}</span>
            </h6>
            <Link to="/portal/project/system#business-processes" className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }}>
              View details <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
          <div className="row g-3 mb-4">
            {components.map(comp => {
              const ss = STATUS_COLORS[comp.status];
              const mc = MATURITY_COLORS[comp.maturityLevel] || '#9ca3af';
              const isActive = recommended?.id === comp.id;
              return (
                <div key={comp.id} className="col-md-6 col-lg-4">
                  <div className="card border-0 shadow-sm h-100" style={{ borderTop: `3px solid ${isActive ? 'var(--color-primary)' : mc}`, outline: isActive ? '2px solid var(--color-primary)' : 'none', outlineOffset: -1 }}>
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div className="fw-semibold" style={{ fontSize: 13, color: 'var(--color-text)' }}>
                          {comp.isPageBP && <i className="bi bi-layout-wtf me-1" style={{ color: '#8b5cf6', fontSize: 11 }}></i>}
                          {comp.name}
                          {isActive && <i className="bi bi-arrow-left ms-1" style={{ color: 'var(--color-primary)', fontSize: 10 }}></i>}
                        </div>
                        <span className="badge" style={{ background: ss.bg, color: ss.text, fontSize: 9 }}>{ss.label}</span>
                      </div>
                      <div className="mb-2">
                        <div className="d-flex justify-content-between mb-1" style={{ fontSize: 10 }}>
                          <span className="text-muted">Completion</span>
                          <span style={{ color: mc, fontWeight: 600 }}>{comp.completion}%</span>
                        </div>
                        <div className="progress" style={{ height: 4, borderRadius: 2 }}>
                          <div className="progress-bar" style={{ width: `${comp.completion}%`, background: mc, borderRadius: 2 }} />
                        </div>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="badge" style={{ background: `${mc}20`, color: mc, fontSize: 9 }}>{comp.maturity}</span>
                        {comp.nextStep && <span className="text-muted" style={{ fontSize: 9, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Next: {comp.nextStep}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="text-center mb-4">
        <Link to="/portal/project/system" className="btn btn-outline-secondary btn-sm" style={{ fontSize: 11 }}>
          <i className="bi bi-grid-3x3-gap me-1"></i>Open Full System View
        </Link>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes celebrationPop { 0% { transform: scale(0.95); opacity: 0; } 50% { transform: scale(1.03); } 100% { transform: scale(1); opacity: 1; } }
        .celebration-card { animation: celebrationPop 0.6s ease-out; }
        @keyframes fadeSlideUp { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        .stagger-item { opacity: 0; animation: fadeSlideUp 0.4s ease-out forwards; }
        .stagger-item:nth-child(1) { animation-delay: 0.3s; }
        .stagger-item:nth-child(2) { animation-delay: 0.5s; }
        .stagger-item:nth-child(3) { animation-delay: 0.7s; }
        .stagger-item:nth-child(4) { animation-delay: 0.9s; }
        .stagger-item:nth-child(5) { animation-delay: 1.1s; }
        @keyframes demoFadeIn { 0% { opacity: 0; transform: scale(0.98); } 100% { opacity: 1; transform: scale(1); } }
        .demo-overlay { animation: demoFadeIn 0.4s ease-out; }
      `}</style>
    </div>
  );
}
