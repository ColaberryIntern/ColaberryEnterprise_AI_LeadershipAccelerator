/**
 * DEMO MODE:
 * Trigger via ?demo=true
 * Used for product walkthroughs and sales demos
 * Uses mock data only — no backend calls
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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

// ---------------------------------------------------------------------------
// Cory Suggestion Engine (deterministic, from existing data)
// ---------------------------------------------------------------------------

interface CorySuggestion {
  id: string;
  title: string;
  explanation: string;
  impact: 'High' | 'Medium' | 'Low';
  componentId: string;
  promptTarget: string;
}

function generateCorySuggestions(components: SystemComponent[], systemLayers: { backend: boolean; frontend: boolean; agents: boolean }): CorySuggestion[] {
  const suggestions: CorySuggestion[] = [];
  const incomplete = components.filter(c => c.status !== 'complete');
  if (incomplete.length === 0) return [];

  // 1. No backend anywhere → highest priority
  if (!systemLayers.backend) {
    const comp = incomplete[0];
    suggestions.push({
      id: 'suggest-backend',
      title: 'Build your backend foundation',
      explanation: 'Your system has no backend yet. This is the foundation everything else depends on.',
      impact: 'High',
      componentId: comp.id,
      promptTarget: 'backend_improvement',
    });
  }

  // 2. No frontend anywhere
  if (systemLayers.backend && !systemLayers.frontend) {
    const comp = incomplete.find(c => !c.isPageBP) || incomplete[0];
    suggestions.push({
      id: 'suggest-frontend',
      title: 'Add a user interface',
      explanation: 'Your system has logic but no UI. Users need an interface to interact with it.',
      impact: 'High',
      componentId: comp.id,
      promptTarget: 'frontend_exposure',
    });
  }

  // 3. No agents
  if (systemLayers.backend && systemLayers.frontend && !systemLayers.agents) {
    const comp = incomplete[0];
    suggestions.push({
      id: 'suggest-agents',
      title: 'Add intelligent automation',
      explanation: 'Your system works manually. Adding agents enables autonomous operation.',
      impact: 'Medium',
      componentId: comp.id,
      promptTarget: 'agent_enhancement',
    });
  }

  // 4. Low coverage component
  const lowCoverage = incomplete.find(c => c.completion < 30 && c.completion > 0);
  if (lowCoverage && suggestions.length < 3) {
    suggestions.push({
      id: `suggest-coverage-${lowCoverage.id}`,
      title: `Complete ${lowCoverage.name}`,
      explanation: `Only ${lowCoverage.completion}% complete. Implementing core requirements will close critical gaps.`,
      impact: 'High',
      componentId: lowCoverage.id,
      promptTarget: lowCoverage.promptTarget || 'requirement_implementation',
    });
  }

  // 5. Component with next step ready
  const readyStep = incomplete.find(c => c.promptTarget && !suggestions.some(s => s.componentId === c.id));
  if (readyStep && suggestions.length < 3) {
    suggestions.push({
      id: `suggest-next-${readyStep.id}`,
      title: readyStep.nextStep || `Build ${readyStep.name}`,
      explanation: `This is the next recommended step for "${readyStep.name}" based on system analysis.`,
      impact: 'Medium',
      componentId: readyStep.id,
      promptTarget: readyStep.promptTarget || 'backend_improvement',
    });
  }

  return suggestions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Cory Plan Engine (deterministic, from existing data)
// ---------------------------------------------------------------------------

interface CoryPlanStep {
  id: string;
  title: string;
  explanation: string;
  impact: 'High' | 'Medium' | 'Low';
  componentId: string;
  promptTarget: string;
  done: boolean;
}

interface CoryPhase {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  steps: CoryPlanStep[];
}

function generateCoryPlan(components: SystemComponent[], _systemLayers: { backend: boolean; frontend: boolean; agents: boolean }): CoryPhase[] {
  // Use each component's ACTUAL nextStep and promptTarget (computed by backend
  // from execution history, coverage, and blocked steps) instead of guessing.
  // This prevents suggesting already-completed work.
  const incomplete = components
    .filter(c => c.status !== 'complete' && c.completion < 80 && c.nextStep)
    .sort((a, b) => {
      // Priority: missing backend > missing frontend > low coverage > agents
      const pri = (c: SystemComponent) => {
        if (c.layers.backend === 'missing') return 0;
        if (c.layers.backend === 'partial') return 1;
        if (c.layers.frontend === 'missing') return 2;
        if (c.completion < 30) return 3;
        return 4;
      };
      return pri(a) - pri(b);
    })
    .slice(0, 5);

  if (incomplete.length === 0) return [];

  // Single flat phase — steps are the actual next steps from the backend
  const steps: CoryPlanStep[] = incomplete.map((c, i) => {
    const target = c.promptTarget || 'backend_improvement';
    const color = target === 'agent_enhancement' ? '#8b5cf6' : target === 'frontend_exposure' ? '#10b981' : target === 'reliability_improvement' ? '#f59e0b' : '#3b82f6';
    return {
      id: `plan-${c.id}`,
      title: c.nextStep || `Build ${c.name}`,
      explanation: `${c.completion}% complete — ${c.layers.backend === 'missing' ? 'needs backend' : c.layers.backend === 'partial' ? 'backend partial' : c.layers.frontend === 'missing' ? 'needs frontend' : 'fill gaps'}.`,
      impact: (i === 0 ? 'High' : i <= 2 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
      componentId: c.id,
      promptTarget: target,
      done: false,
    };
  });

  return [{ id: 'phase-build', title: 'Build Plan', description: 'Next steps based on current system state', icon: 'bi-hammer', color: '#3b82f6', steps }];
}

function transformCapabilities(bps: any[]): SystemComponent[] {
  return bps
    .filter((bp: any) => (bp.applicability_status || 'active') === 'active')
    .map((bp: any) => {
      const coverage = bp.metrics?.requirements_coverage || 0;
      const readiness = bp.metrics?.system_readiness || 0;
      const maturityLevel = bp.maturity?.level || 0;
      const isComplete = bp.is_complete === true || (coverage >= 90 && readiness >= 90);
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
  const navigate = useNavigate();
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

  // Autonomous mode + Cory suggestions/plan
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [completedPlanSteps, setCompletedPlanSteps] = useState<Set<string>>(new Set());

  // Execution queue state
  const [execQueue, setExecQueue] = useState<CoryPlanStep[]>([]);
  const [execIndex, setExecIndex] = useState(0);
  const [execPaused, setExecPaused] = useState(false);
  const isExecuting = execQueue.length > 0;
  const [showUpNext, setShowUpNext] = useState(false);

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

  const handleLearnAbout = async (comp: SystemComponent) => {
    const projectContext = project?.project_variables?.system_prompt || project?.primary_business_problem || '';
    // Fetch BP detail for rich context
    let featureList = '';
    let reqList = '';
    let gapList = '';
    let totalReqs = 0;
    let featureCount = 0;
    let gapCount = 0;
    try {
      const detail = await bpApi.getProcess(comp.id);
      const d = detail.data || {};
      const features = d.features || [];
      const gaps = d.autonomy_gaps || [];
      featureCount = features.length;
      gapCount = gaps.length;
      totalReqs = d.total_requirements || 0;
      featureList = features.map((f: any) => `- ${f.name}: ${f.description || 'No description'}`).join('\n');
      reqList = features.flatMap((f: any) => (f.requirements || []).map((r: any) => `- ${r.key}: ${r.text}`)).slice(0, 20).join('\n');
      gapList = gaps.slice(0, 10).map((g: any) => `- [${g.gap_type}] ${g.text}`).join('\n');
    } catch { /* proceed with what we have */ }

    const learnPrompt = `You are operating in LEARN MODE.

DO NOT write code. DO NOT give implementation instructions. DO NOT suggest building anything.
Your ONLY job is to help the learner UNDERSTAND what this business process is, why it matters, and how it works.

---

You are a Technical Mentor helping someone deeply understand a business process before they build it.

Assume the learner has NO prior knowledge of this system or the domain. Your job is to help them fully understand what this process is, why it matters, what it does, and how it works — so they can make informed decisions.

---

# PROJECT CONTEXT (THE BIGGER PICTURE)

${projectContext || 'No project system prompt set yet.'}

---

BUSINESS PROCESS: ${comp.name}

DESCRIPTION: ${comp.description || 'No description available.'}

CURRENT STATE:
- Backend: ${comp.layers.backend}
- Frontend: ${comp.layers.frontend}
- Agents: ${comp.layers.agent}
- Completion: ${comp.completion}%
- Maturity: ${comp.maturity}

FEATURES THIS PROCESS NEEDS (${featureCount}):
${featureList || 'None defined yet'}

REQUIREMENTS (${totalReqs}):
${reqList || 'None extracted yet'}

CURRENT GAPS (${gapCount}):
${gapList || 'No gaps detected'}

---

YOUR MISSION:

Help the learner understand:
1. What "${comp.name}" is in plain, non-technical language
2. What business problem it solves and why it matters
3. Each feature listed above — what it does and why it's needed
4. The current gaps — what's missing and what that means
5. How the different layers (backend, frontend, agents, database) work together
6. What questions they should be asking before building

RULES:
- Explain ONE concept at a time
- Use analogies and real-world examples
- Ask comprehension questions before moving to the next concept
- Never assume the learner already knows something
- Focus purely on understanding — do NOT give coding instructions or tell them to build anything
- If the learner asks a question, answer it thoroughly before continuing

Begin by greeting the learner and explaining what "${comp.name}" is and why it matters for their business.`;

    try { await navigator.clipboard.writeText(learnPrompt); } catch {
      const ta = document.createElement('textarea'); ta.value = learnPrompt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    window.open('https://chatgpt.com', '_blank');
    showToast('Learn Mode prompt copied — paste in ChatGPT');
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
      setBuild(prev => ({ ...prev, phase: 'validated', validationResult: { error: err.response?.data?.error || 'Validation failed' } }));
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

  if (error === 'no-project') return <ProjectSetupWizard onActivated={() => window.location.reload()} />;
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

  // Cory plan (filtered by completions)
  const coryPlan = generateCoryPlan(components, systemLayers).map(phase => ({
    ...phase,
    steps: phase.steps.map(s => ({ ...s, done: s.done || completedPlanSteps.has(s.id) })),
  })).filter(phase => phase.steps.some(s => !s.done));
  const totalPlanSteps = coryPlan.reduce((sum, p) => sum + p.steps.length, 0);
  const donePlanSteps = coryPlan.reduce((sum, p) => sum + p.steps.filter(s => s.done).length, 0);

  const handleApplyPlanStep = async (step: CoryPlanStep) => {
    const beforeMetrics = { coverage: 0, maturityLevel: 0, readiness: 0 };
    const comp = components.find(c => c.id === step.componentId);
    if (comp) { beforeMetrics.coverage = comp.completion; beforeMetrics.maturityLevel = comp.maturityLevel; beforeMetrics.readiness = comp.completion; }
    setBuild(prev => ({ ...prev, phase: 'generating', prompt: null, validationResult: null, beforeMetrics, pasteDetected: false }));
    try {
      const res = await bpApi.generatePrompt(step.componentId, step.promptTarget);
      const promptText = res.data?.prompt_text || '';
      await copyText(promptText);
      showToast('Prompt copied — paste into Claude Code');
      setBuild(prev => ({ ...prev, phase: 'waiting_for_execution', prompt: promptText }));
      setShowPrompt(false);
      prevReportLen.current = 0;
      // Mark step as completed when build flow starts
      setCompletedPlanSteps(prev => new Set([...prev, step.id]));
    } catch {
      showToast('Failed to generate prompt', '#ef4444');
      setBuild(prev => ({ ...prev, phase: 'idle' }));
    }
  };

  // ---------------------------------------------------------------------------
  // Execution queue handlers
  // ---------------------------------------------------------------------------

  const handleStartExecution = async () => {
    const allIncomplete = coryPlan.flatMap(p => p.steps.filter(s => !s.done));
    if (allIncomplete.length === 0) return;
    setExecQueue(allIncomplete);
    setExecIndex(0);
    setExecPaused(false);
    await handleApplyPlanStep(allIncomplete[0]);
  };

  const handleExecAdvance = async () => {
    const nextIdx = execIndex + 1;
    if (nextIdx >= execQueue.length) {
      setExecQueue([]);
      setExecIndex(0);
      setBuild(INITIAL_BUILD);
      setShowPrompt(false);
      showToast('Plan execution complete! Your system has evolved.', '#059669');
      await loadData();
      return;
    }
    setExecIndex(nextIdx);
    setBuild(INITIAL_BUILD);
    setShowPrompt(false);
    setTimeout(async () => {
      await handleApplyPlanStep(execQueue[nextIdx]);
    }, 500);
  };

  const handleExecPause = () => { setExecPaused(true); };

  const handleExecResume = async () => {
    setExecPaused(false);
    const current = execQueue[execIndex];
    if (current && build.phase === 'idle') {
      await handleApplyPlanStep(current);
    }
  };

  const handleExecExit = () => {
    setExecQueue([]);
    setExecIndex(0);
    setExecPaused(false);
    setBuild(INITIAL_BUILD);
    setShowPrompt(false);
  };

  // ---------------------------------------------------------------------------
  // Render (main)
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
        <div className="d-flex gap-2 align-items-center">
          {!demoActive && !isInFlow && (
            <>
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <span className="text-muted" style={{ fontWeight: autonomousMode ? 400 : 600 }}>Manual</span>
                <div className="form-check form-switch mb-0" style={{ minHeight: 0 }}>
                  <input className="form-check-input" type="checkbox" role="switch" checked={autonomousMode}
                    onChange={() => setAutonomousMode(!autonomousMode)}
                    style={{ cursor: 'pointer', width: 28, height: 14 }} />
                </div>
                <span style={{ fontWeight: autonomousMode ? 600 : 400, color: autonomousMode ? '#8b5cf6' : '#9ca3af', fontSize: 10 }}>Autonomous</span>
              </div>
              <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }} onClick={startDemo}>
                <i className="bi bi-play-circle me-1"></i>Watch 60s Demo
              </button>
            </>
          )}
          <Link to="/portal/project/system-v2" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }}>
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
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="bi bi-file-text" style={{ color: 'var(--color-primary)', fontSize: 14 }}></i>
                <h5 className="fw-bold mb-0" style={{ color: 'var(--color-primary)', fontSize: 16 }}>Your System Blueprint</h5>
              </div>
              {project.project_variables?.system_prompt ? (
                <div className="p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, borderLeft: '3px solid var(--color-primary)' }}>
                  <div className="fw-medium mb-1" style={{ fontSize: 10, color: 'var(--color-primary)' }}>System Prompt</div>
                  <p className="text-muted mb-0" style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                    {project.project_variables.system_prompt}
                  </p>
                </div>
              ) : (
                <p className="text-muted mb-0" style={{ fontSize: 13, lineHeight: 1.7 }}>{summaryText}</p>
              )}
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

      {/* ── Cory — Unified Build Guide ── */}

      {/* ── Execution Mode Header ── */}
      {isExecuting && (
        <div className="card border-0 shadow-sm mb-3" style={{ background: 'linear-gradient(135deg, #1a365d08, #8b5cf608)', border: '1px solid #8b5cf620' }}>
          <div className="card-body py-3 px-4">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className="bi bi-lightning-fill" style={{ color: '#8b5cf6' }}></i>
                  <span className="fw-bold" style={{ fontSize: 13, color: 'var(--color-primary)' }}>
                    Executing Your System Plan
                  </span>
                </div>
                <div className="d-flex align-items-center gap-3" style={{ fontSize: 11 }}>
                  <span className="text-muted">Step {execIndex + 1} of {execQueue.length}</span>
                  {execQueue[execIndex] && (
                    <span style={{ color: '#8b5cf6', fontWeight: 500 }}>{execQueue[execIndex].title}</span>
                  )}
                  {execPaused && <span className="badge bg-warning text-dark" style={{ fontSize: 8 }}>Paused</span>}
                </div>
              </div>
              <div className="d-flex gap-2">
                {!execPaused ? (
                  <button className="btn btn-sm btn-outline-warning" style={{ fontSize: 10 }} onClick={handleExecPause}>
                    <i className="bi bi-pause-fill me-1"></i>Pause
                  </button>
                ) : (
                  <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }} onClick={handleExecResume}>
                    <i className="bi bi-play-fill me-1"></i>Resume
                  </button>
                )}
                <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} onClick={handleExecExit}>
                  <i className="bi bi-x-circle me-1"></i>Exit Plan
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="progress mt-2" style={{ height: 4, borderRadius: 2 }}>
              <div className="progress-bar" style={{ width: `${((execIndex + (build.phase === 'validated' ? 1 : 0)) / execQueue.length) * 100}%`, background: '#8b5cf6', borderRadius: 2, transition: 'width 0.5s ease' }} />
            </div>
            {/* Completed steps */}
            {execIndex > 0 && (
              <div className="mt-2 d-flex flex-wrap gap-1">
                {execQueue.slice(0, execIndex).map((s, i) => (
                  <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 8 }}>
                    <i className="bi bi-check me-1"></i>{s.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cory — Unified Build Guide (merged Plan + Build Step) ── */}
      {recommended && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: `4px solid ${autonomousMode ? '#8b5cf6' : '#3b82f6'}` }}>
          <div className="card-body p-4">
            {/* Cory header */}
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-robot" style={{ color: autonomousMode ? '#8b5cf6' : '#3b82f6', fontSize: 16 }}></i>
                <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: autonomousMode ? '#8b5cf6' : 'var(--color-primary)' }}>
                  Cory — Your Next Step
                </h6>
                {autonomousMode && <span className="badge" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 8 }}><i className="bi bi-lightning-fill me-1"></i>Autonomous</span>}
              </div>
              {isInFlow && !demoActive && (
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 10 }} onClick={handleStartNext}>
                  <i className="bi bi-arrow-left-right me-1"></i>Switch Step
                </button>
              )}
            </div>

            {/* Step indicator */}
            {(() => {
              const allSteps = coryPlan.flatMap(p => p.steps.filter(s => !s.done));
              const stepNumber = allSteps.length > 0 ? 1 : 0;
              const totalSteps = allSteps.length;
              return totalSteps > 0 ? (
                <div className="mb-2" style={{ fontSize: 10, color: '#64748b' }}>
                  Step {stepNumber} of {totalSteps} remaining
                </div>
              ) : null;
            })()}

            {/* Primary step: what to build */}
            <h6 className="fw-bold mb-1" style={{ color: 'var(--color-text)', fontSize: 15 }}>{getStepTitle(recommended)}</h6>
            <p className="mb-2" style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, fontStyle: 'italic' }}>{getWhyThisMatters(recommended, systemLayers)}</p>

            {/* Layer status + completion badges */}
            <div className="d-flex flex-wrap gap-2 mb-3">
              <span className="badge" style={{ background: STATUS_COLORS[recommended.status].bg, color: STATUS_COLORS[recommended.status].text, fontSize: 9 }}>{recommended.completion}% complete</span>
              <span className="badge" style={{ background: `${MATURITY_COLORS[recommended.maturityLevel]}20`, color: MATURITY_COLORS[recommended.maturityLevel], fontSize: 9 }}>{recommended.maturity}</span>
              {recommended.layers.backend === 'partial' && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 9 }}><i className="bi bi-exclamation-triangle me-1"></i>Backend partial</span>}
              {recommended.layers.backend === 'missing' && <span className="badge" style={{ background: '#ef444420', color: '#ef4444', fontSize: 9 }}><i className="bi bi-x-circle me-1"></i>No backend</span>}
              {recommended.layers.frontend === 'missing' && recommended.layers.backend !== 'missing' && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 9 }}>No frontend</span>}
            </div>

            {/* PHASE: idle — action buttons */}
            {build.phase === 'idle' && (() => {
              const primaryColor = recommended.promptTarget === 'agent_enhancement' ? '#8b5cf6' : recommended.promptTarget === 'frontend_exposure' ? '#10b981' : recommended.promptTarget === 'reliability_improvement' ? '#f59e0b' : '#3b82f6';
              return (
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-sm" style={{ background: primaryColor, color: '#fff', fontWeight: 600, fontSize: 12 }} onClick={() => handleGeneratePrompt(recommended)}>
                  <i className="bi bi-terminal me-1"></i>Generate Build Prompt
                </button>
                <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => handleLearnAbout(recommended)}>
                  <i className="bi bi-book me-1"></i>Learn About This
                </button>
              </div>
              );
            })()}

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
                    {/* Build Summary Header */}
                    <div className="p-4 mb-3 celebration-card" style={{ background: 'linear-gradient(135deg, #10b98115, #3b82f615)', borderRadius: 12, border: '1px solid #10b98130' }}>
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 22 }}></i>
                        <div>
                          <h6 className="fw-bold mb-0" style={{ color: '#059669', fontSize: 16 }}>Build Validated</h6>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{getCelebrationSubtext(build.validationResult)}</span>
                        </div>
                        {build.validationResult.metrics_after && (
                          <div className="ms-auto d-flex gap-3 text-center">
                            <span><strong style={{ color: '#059669', fontSize: 16 }}>{build.validationResult.metrics_after.reqCoverage}%</strong><br /><span className="text-muted" style={{ fontSize: 9 }}>Coverage</span></span>
                            <span><strong style={{ color: '#3b82f6', fontSize: 16 }}>L{build.validationResult.metrics_after.maturityLevel}</strong><br /><span className="text-muted" style={{ fontSize: 9 }}>Maturity</span></span>
                            <span><strong style={{ color: '#8b5cf6', fontSize: 16 }}>{build.validationResult.metrics_after.readiness}%</strong><br /><span className="text-muted" style={{ fontSize: 9 }}>Readiness</span></span>
                          </div>
                        )}
                      </div>

                      {/* Requirements matched */}
                      <div className="mb-3 p-2" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div className="fw-semibold mb-1" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                          <i className="bi bi-clipboard-check me-1"></i>Requirements Matched
                        </div>
                        <div style={{ fontSize: 12, color: '#059669' }}>
                          <strong>{build.validationResult.requirementsVerified || 0}</strong> of {build.validationResult.requirementsTotal || 0} requirements now verified
                        </div>
                        {(() => {
                          const improvements = getImprovements(build.validationResult, build.beforeMetrics);
                          return improvements.length > 0 ? (
                            <ul className="mb-0 mt-1 ps-3" style={{ fontSize: 11, color: '#475569' }}>
                              {improvements.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                          ) : null;
                        })()}
                      </div>

                      {/* Files Created */}
                      {build.validationResult.parsed?.filesCreated?.length > 0 && (
                        <div className="mb-2 p-2" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <div className="fw-semibold mb-1" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                            <i className="bi bi-file-earmark-plus me-1" style={{ color: '#10b981' }}></i>Files Created ({build.validationResult.parsed.filesCreated.length})
                          </div>
                          <ul className="mb-0 ps-3" style={{ fontSize: 11, color: '#475569' }}>
                            {build.validationResult.parsed.filesCreated.map((f: string, i: number) => (
                              <li key={i} style={{ fontFamily: 'monospace', fontSize: 10 }}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Files Modified */}
                      {build.validationResult.parsed?.filesModified?.length > 0 && (
                        <div className="mb-2 p-2" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <div className="fw-semibold mb-1" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                            <i className="bi bi-pencil-square me-1" style={{ color: '#f59e0b' }}></i>Files Modified ({build.validationResult.parsed.filesModified.length})
                          </div>
                          <ul className="mb-0 ps-3" style={{ fontSize: 11, color: '#475569' }}>
                            {build.validationResult.parsed.filesModified.map((f: string, i: number) => (
                              <li key={i} style={{ fontFamily: 'monospace', fontSize: 10 }}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* API Routes */}
                      {build.validationResult.parsed?.routes?.length > 0 && (
                        <div className="mb-2 p-2" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <div className="fw-semibold mb-1" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                            <i className="bi bi-signpost-2 me-1" style={{ color: '#3b82f6' }}></i>API Routes Added ({build.validationResult.parsed.routes.length})
                          </div>
                          <ul className="mb-0 ps-3" style={{ fontSize: 11, color: '#475569' }}>
                            {build.validationResult.parsed.routes.map((r: string, i: number) => (
                              <li key={i} style={{ fontFamily: 'monospace', fontSize: 10 }}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Database Changes */}
                      {build.validationResult.parsed?.database?.length > 0 && (
                        <div className="mb-2 p-2" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <div className="fw-semibold mb-1" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                            <i className="bi bi-database me-1" style={{ color: '#8b5cf6' }}></i>Database Changes
                          </div>
                          <ul className="mb-0 ps-3" style={{ fontSize: 11, color: '#475569' }}>
                            {build.validationResult.parsed.database.map((d: string, i: number) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* No parsed detail fallback */}
                      {!build.validationResult.parsed?.filesCreated?.length && !build.validationResult.parsed?.routes?.length && !build.validationResult.parsed?.filesModified?.length && (
                        <div className="p-2 text-muted" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11 }}>
                          <i className="bi bi-info-circle me-1"></i>Tip: Paste a structured validation report with "Files Created:", "Routes:", and "Database:" sections for a detailed build breakdown.
                        </div>
                      )}
                    </div>

                    <div className="d-flex align-items-center justify-content-between p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12 }}>
                        <strong style={{ color: 'var(--color-text)' }}>You are now {Math.round(readiness)}% complete.</strong>
                        {nextAfter && <span className="text-muted ms-2">Next: {nextAfter.name}</span>}
                      </div>
                      {!demoActive && (
                        isExecuting ? (
                          <button className="btn btn-sm" style={{ background: '#8b5cf6', color: '#fff', fontWeight: 600, fontSize: 12 }} onClick={handleExecAdvance}>
                            {execIndex + 1 < execQueue.length ? (
                              <><i className="bi bi-arrow-right me-1"></i>Next Step ({execIndex + 2}/{execQueue.length})</>
                            ) : (
                              <><i className="bi bi-check-circle me-1"></i>Complete Plan</>
                            )}
                          </button>
                        ) : (
                          <button className="btn btn-primary btn-sm" style={{ fontWeight: 600, fontSize: 12 }} onClick={handleStartNext}>
                            <i className="bi bi-arrow-right me-1"></i>Continue to Next Step
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Up next — collapsible remaining plan steps (idle only) */}
            {build.phase === 'idle' && (() => {
              const allSteps = coryPlan.flatMap(p => p.steps.filter(s => !s.done));
              const upcomingSteps = allSteps.slice(1); // skip first (it's the current primary step)
              if (upcomingSteps.length === 0) return null;
              return (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-2 w-100" style={{ fontSize: 12, color: '#64748b' }} onClick={() => setShowUpNext(!showUpNext)}>
                    <i className={`bi ${showUpNext ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 10 }}></i>
                    <span>Up next ({upcomingSteps.length} more step{upcomingSteps.length > 1 ? 's' : ''})</span>
                  </button>
                  {showUpNext && (
                    <div className="mt-2">
                      {upcomingSteps.map((step, i) => {
                        const stepColor = step.promptTarget === 'agent_enhancement' ? '#8b5cf6' : step.promptTarget === 'frontend_exposure' ? '#10b981' : step.promptTarget === 'reliability_improvement' ? '#f59e0b' : '#3b82f6';
                        const stepComp = components.find(c => c.id === step.componentId);
                        return (
                          <div key={step.id} className="d-flex align-items-start gap-2 mb-1 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, borderLeft: `3px solid ${stepColor}` }}>
                            <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 18, height: 18, background: `${stepColor}20`, color: stepColor, fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 2}</span>
                            <div className="flex-grow-1">
                              <div className="fw-medium" style={{ fontSize: 11 }}>{step.title}</div>
                              <div className="text-muted" style={{ fontSize: 9 }}>{step.explanation}</div>
                            </div>
                            <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
                              <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => stepComp && handleLearnAbout(stepComp)}>
                                <i className="bi bi-book"></i>
                              </button>
                              <button className="btn btn-sm" style={{ fontSize: 8, padding: '1px 6px', background: stepColor, color: '#fff' }} onClick={() => handleApplyPlanStep(step)}>
                                Build
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Execute all — inside collapsible */}
                  {showUpNext && !isExecuting && (
                    <div className="mt-2">
                      <button className="btn btn-sm w-100" style={{ background: autonomousMode ? '#8b5cf6' : 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: 11 }} onClick={handleStartExecution}>
                        <i className="bi bi-play-fill me-1"></i>Execute All ({upcomingSteps.length + 1} steps)
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
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
            <Link to="/portal/project/system-v2" className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }}>
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
                  <div className="card border-0 shadow-sm h-100" style={{ borderTop: `3px solid ${isActive ? 'var(--color-primary)' : mc}`, outline: isActive ? '2px solid var(--color-primary)' : 'none', outlineOffset: -1, cursor: 'pointer' }}
                    onClick={() => navigate(`/portal/project/system-v2?componentId=${comp.id}&tab=build`)}>
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
        <Link to="/portal/project/system-v2" className="btn btn-outline-secondary btn-sm" style={{ fontSize: 11 }}>
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
