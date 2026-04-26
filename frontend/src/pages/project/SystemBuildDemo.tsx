/**
 * SystemBuildDemo — Progressive AI System Build Experience
 *
 * Runs a scripted 5-phase animation IMMEDIATELY (no API wait).
 * Preview data loads in background and enriches the final reveal.
 * Nav links are hidden by PortalLayout during demo.
 */
import React, { useState, useEffect, useRef } from 'react';
import portalApi from '../../utils/portalApi';
import AgentNetworkGraph from '../../components/cory/AgentNetworkGraph';

interface Agent { name: string; role: string; type: string }
interface Department { name: string; description: string; color: string; agents: Agent[] }
interface Capability { name: string; category: string; description: string }
interface SimEvent { agent: string; department: string; action: string; type: string }

// Scripted phases — run immediately, no data dependency
const SCRIPTED_PHASES = [
  {
    id: 'understanding', title: 'Understanding Your Idea', subtitle: 'Analyzing your vision and mapping the system scope',
    icon: 'bi-lightbulb', color: '#3b82f6',
    steps: ['Identifying core problem and value proposition', 'Mapping target users and stakeholders', 'Defining system scope and boundaries', 'Analyzing technical requirements'],
    stepDelay: 1200,
  },
  {
    id: 'capabilities', title: 'Designing Capabilities', subtitle: 'Creating intelligent features for your system',
    icon: 'bi-puzzle', color: '#8b5cf6',
    steps: ['Intelligent automation engine', 'Real-time data processing', 'Decision support system', 'Workflow orchestration', 'Reporting & analytics'],
    stepDelay: 1000,
  },
  {
    id: 'organization', title: 'Building AI Organization', subtitle: 'Assembling your team of AI agents',
    icon: 'bi-diagram-3', color: '#10b981',
    steps: ['AI Control Tower created', 'Operations department initialized', 'Intelligence department initialized', 'Automation department initialized', 'Integration layer connected'],
    stepDelay: 1100,
  },
  {
    id: 'architecture', title: 'System Architecture', subtitle: 'Designing the technical foundation',
    icon: 'bi-bricks', color: '#f59e0b',
    steps: ['Data Layer — storage and persistence', 'Processing Layer — business logic', 'Decision Engine — AI intelligence', 'Automation Engine — workflows', 'API Layer — integrations'],
    stepDelay: 900,
  },
  {
    id: 'finalizing', title: 'Finalizing Your System', subtitle: 'Assembling the complete blueprint',
    icon: 'bi-rocket-takeoff', color: '#ef4444',
    steps: ['Requirements document generated', 'System blueprint created', 'AI organization assembled', 'Quality validation passed'],
    stepDelay: 1000,
  },
];

export default function SystemBuildDemo() {
  const [idea, setIdea] = useState('');
  const [projectName, setProjectName] = useState('');

  // Phase animation state
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(0);
  const [revealedSteps, setRevealedSteps] = useState<Record<number, number>>({}); // phaseIdx → revealed count
  const [progress, setProgress] = useState(3);
  const [buildComplete, setBuildComplete] = useState(false);
  const [showFinalReveal, setShowFinalReveal] = useState(false);
  const [buildMessage, setBuildMessage] = useState('Initializing...');

  // Preview data (loaded in background)
  const [departments, setDepartments] = useState<Department[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [simEvents, setSimEvents] = useState<SimEvent[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const pollRef = useRef<any>(null);
  const phaseTimerRef = useRef<any>(null);

  // Load project info + start preview in background
  useEffect(() => {
    (async () => {
      try {
        const projRes = await portalApi.get('/api/portal/project');
        const proj = projRes.data;
        setIdea(proj?.setup_status?.build_idea || proj?.primary_business_problem || 'your AI system');
        setProjectName(proj?.organization_name || 'Your Project');
        if (proj?.setup_status?.activated) { setBuildComplete(true); setShowFinalReveal(true); setProgress(100); }
      } catch {}
    })();

    // Load preview in background (don't block animation)
    (async () => {
      try {
        const projRes = await portalApi.get('/api/portal/project');
        const previewIdea = projRes.data?.setup_status?.build_idea || projRes.data?.primary_business_problem || 'AI system';
        const previewRes = await portalApi.post('/api/portal/project/build-preview', { idea: previewIdea });
        setDepartments(previewRes.data.departments || []);
        setCapabilities(previewRes.data.capabilities || []);
        setSimEvents(previewRes.data.simulation_events || []);
        setTotalAgents(previewRes.data.total_agents || 0);
        setPreviewLoaded(true);
      } catch {}
    })();

    // Poll build status
    pollRef.current = setInterval(async () => {
      try {
        const res = await portalApi.get('/api/portal/project/architect-status');
        setBuildMessage(res.data.message || 'Building...');
        if (res.data.complete) { clearInterval(pollRef.current); setBuildComplete(true); }
      } catch {}
    }, 10000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // SCRIPTED PHASE ANIMATION — runs immediately, no data dependency
  useEffect(() => {
    if (showFinalReveal) return;

    let phaseIdx = 0;
    let stepIdx = 0;

    const revealNext = () => {
      const phase = SCRIPTED_PHASES[phaseIdx];
      if (!phase) {
        // All phases done → show final reveal
        setProgress(100);
        setTimeout(() => setShowFinalReveal(true), 800);
        return;
      }

      if (stepIdx < phase.steps.length) {
        // Reveal next step
        setRevealedSteps(prev => ({ ...prev, [phaseIdx]: stepIdx + 1 }));
        setProgress(Math.round(((phaseIdx * 20) + ((stepIdx + 1) / phase.steps.length * 20))));
        stepIdx++;
        phaseTimerRef.current = setTimeout(revealNext, phase.stepDelay);
      } else {
        // Move to next phase
        phaseIdx++;
        stepIdx = 0;
        setCurrentPhaseIdx(phaseIdx);
        setProgress(phaseIdx * 20);
        phaseTimerRef.current = setTimeout(revealNext, 600);
      }
    };

    // Start after 800ms
    phaseTimerRef.current = setTimeout(() => {
      setRevealedSteps({ 0: 1 });
      setCurrentPhaseIdx(0);
      stepIdx = 1;
      phaseTimerRef.current = setTimeout(revealNext, SCRIPTED_PHASES[0].stepDelay);
    }, 800);

    return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
  }, [showFinalReveal]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between px-4 py-3" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <div className="d-flex align-items-center gap-3">
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-robot" style={{ fontSize: 18, color: '#fff' }}></i>
          </div>
          <div>
            <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: 'var(--color-primary)' }}>
              {showFinalReveal ? 'Your AI System' : 'Designing Your AI System'}
            </h6>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{projectName}</span>
          </div>
        </div>
        {showFinalReveal && buildComplete && (
          <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', fontWeight: 600, borderRadius: 8, fontSize: 12 }}
            onClick={() => { window.location.href = '/portal/project/blueprint'; }}>
            Your System is Ready → Enter <i className="bi bi-arrow-right ms-1"></i>
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 py-2" style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        <div className="progress" style={{ height: 4, borderRadius: 4 }}>
          <div className="progress-bar" style={{ width: `${progress}%`, background: progress === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 4, transition: 'width 0.6s ease' }}></div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
        {/* Idea context */}
        {!showFinalReveal && idea && (
          <div className="text-center mb-4">
            <p className="text-muted mb-1" style={{ fontSize: 11 }}>Building system for:</p>
            <p style={{ fontSize: 13, color: 'var(--color-text)', fontStyle: 'italic', maxWidth: 500, margin: '0 auto' }}>
              "{idea.length > 120 ? idea.substring(0, 120) + '...' : idea}"
            </p>
          </div>
        )}

        {/* PROGRESSIVE PHASES */}
        {!showFinalReveal && (
          <div>
            {SCRIPTED_PHASES.map((phase, pi) => {
              const revealed = revealedSteps[pi] || 0;
              const isActive = pi === currentPhaseIdx;
              const isDone = pi < currentPhaseIdx;
              const isFuture = pi > currentPhaseIdx;

              if (isFuture) return null;

              return (
                <div key={phase.id} className="card border-0 shadow-sm mb-3" style={{ opacity: isDone ? 0.5 : 1, transition: 'opacity 0.5s', animation: isActive && pi > 0 ? 'fadeIn 0.4s ease' : 'none' }}>
                  <div className="card-body p-3">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${phase.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isDone ? <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 16 }}></i>
                          : isActive ? <div className="spinner-border" style={{ width: 16, height: 16, color: phase.color, borderWidth: 2 }}></div>
                          : <i className={`bi ${phase.icon}`} style={{ color: phase.color, fontSize: 14 }}></i>}
                      </div>
                      <div>
                        <div className="fw-bold" style={{ fontSize: 13 }}>{phase.title}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{phase.subtitle}</div>
                      </div>
                    </div>
                    <div className="ms-4">
                      {phase.steps.slice(0, isDone ? phase.steps.length : revealed).map((stepText, si) => (
                        <div key={si} className="d-flex align-items-center gap-2 py-1" style={{ animation: 'fadeIn 0.3s ease' }}>
                          <i className="bi bi-check" style={{ color: '#10b981', fontSize: 11, width: 14 }}></i>
                          <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{stepText}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Build status */}
            <div className="text-center py-2">
              <div className="spinner-border spinner-border-sm text-primary me-2" style={{ width: 12, height: 12 }}></div>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{buildMessage}</span>
            </div>
          </div>
        )}

        {/* FINAL REVEAL */}
        {showFinalReveal && (
          <div style={{ animation: 'fadeIn 0.6s ease' }}>
            {buildComplete && (
              <div className="text-center mb-4 p-4" style={{ background: 'linear-gradient(135deg, #10b98115, #3b82f615)', borderRadius: 16, border: '1px solid #10b98130' }}>
                <i className="bi bi-check-circle-fill d-block mb-2" style={{ fontSize: 36, color: '#10b981' }}></i>
                <h5 className="fw-bold mb-1" style={{ color: '#059669' }}>Your System Is Ready!</h5>
                <p className="text-muted mb-3" style={{ fontSize: 12 }}>{totalAgents || 20}+ AI agents ready to power your system.</p>
                <button className="btn" style={{ background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, padding: '10px 28px', border: 'none' }}
                  onClick={() => { window.location.href = '/portal/project/blueprint'; }}>
                  Your System is Ready → Enter
                </button>
              </div>
            )}

            {!buildComplete && (
              <div className="text-center mb-4 p-3" style={{ background: '#f0f4ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                <div className="spinner-border text-primary mb-2" style={{ width: 24, height: 24 }}></div>
                <p className="mb-0" style={{ fontSize: 12, color: '#3b82f6' }}>Requirements document still generating — you can explore your system preview below</p>
              </div>
            )}

            {/* Interactive Agent Network Graph */}
            {previewLoaded && departments.length > 0 && (
              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body p-3">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h6 className="fw-bold mb-0" style={{ fontSize: 13 }}>
                      <i className="bi bi-diagram-3 me-2" style={{ color: '#3b82f6' }}></i>Your AI Organization
                    </h6>
                    <span className="text-muted" style={{ fontSize: 10 }}>{totalAgents} agents · {departments.length} depts</span>
                  </div>
                  <AgentNetworkGraph departments={departments} width={640} height={400} />
                  <div className="d-flex flex-wrap gap-2 mt-2 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                    {departments.map((dept, di) => (
                      <div key={di} className="d-flex align-items-center gap-1">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dept.color }}></div>
                        <span style={{ fontSize: 10, color: '#64748b' }}>{dept.name} ({dept.agents.length})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Capabilities */}
            {previewLoaded && capabilities.length > 0 && (
              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body p-3">
                  <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}><i className="bi bi-lightning-charge me-2" style={{ color: '#f59e0b' }}></i>System Capabilities</h6>
                  <div className="row g-2">
                    {capabilities.map((cap, i) => (
                      <div key={i} className="col-6">
                        <div className="p-2" style={{ background: '#f8fafc', borderRadius: 6 }}>
                          <div className="fw-medium" style={{ fontSize: 11 }}>{cap.name}</div>
                          <div className="text-muted" style={{ fontSize: 9 }}>{cap.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Simulation */}
            {previewLoaded && simEvents.length > 0 && (
              <div className="card border-0 shadow-sm">
                <div className="card-body p-3">
                  <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}><i className="bi bi-activity me-2" style={{ color: '#10b981' }}></i>System Preview</h6>
                  {simEvents.map((evt, i) => (
                    <div key={i} className="d-flex align-items-start gap-2 mb-2 p-2" style={{ background: '#f8fafc', borderRadius: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', marginTop: 6, flexShrink: 0 }}></div>
                      <div>
                        <div style={{ fontSize: 11 }}><strong>{evt.agent}</strong> <span className="text-muted">({evt.department})</span></div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{evt.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Still loading preview */}
            {!previewLoaded && (
              <div className="text-center py-4">
                <div className="spinner-border text-primary mb-2" style={{ width: 28, height: 28 }}></div>
                <p className="text-muted" style={{ fontSize: 12 }}>Loading your AI organization preview...</p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
