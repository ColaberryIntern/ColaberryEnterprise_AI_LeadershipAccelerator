/**
 * SystemBuildDemo — Progressive AI System Build Experience
 *
 * After user clicks "Start Building My System", this page shows
 * a step-by-step build sequence that reveals the system gradually.
 *
 * 5 phases → each reveals items one-by-one → final reveal shows
 * full AI org, capabilities, and simulation.
 *
 * Light theme. Progressive. Idea-injected. Earned reveal.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import portalApi from '../../utils/portalApi';

interface Agent { name: string; role: string; type: string }
interface Department { name: string; description: string; color: string; agents: Agent[] }
interface Capability { name: string; category: string; description: string }
interface SimEvent { agent: string; department: string; action: string; type: string }

// Build phases with sub-steps that appear one-by-one
interface PhaseStep { text: string; icon: string; done: boolean }
interface BuildPhase {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  steps: PhaseStep[];
  duration: number; // ms per step reveal
}

const PHASE_TEMPLATES: Omit<BuildPhase, 'steps'>[] = [
  { id: 'understanding', title: 'Understanding Your Idea', subtitle: 'Analyzing your vision and mapping the system scope', icon: 'bi-lightbulb', color: '#3b82f6', duration: 1500 },
  { id: 'capabilities', title: 'Designing Capabilities', subtitle: 'Creating intelligent features for your system', icon: 'bi-puzzle', color: '#8b5cf6', duration: 1800 },
  { id: 'organization', title: 'Building AI Organization', subtitle: 'Assembling your team of AI agents', icon: 'bi-diagram-3', color: '#10b981', duration: 1500 },
  { id: 'architecture', title: 'System Architecture', subtitle: 'Designing the technical foundation', icon: 'bi-bricks', color: '#f59e0b', duration: 1600 },
  { id: 'finalizing', title: 'Finalizing Your System', subtitle: 'Assembling the complete blueprint', icon: 'bi-rocket-takeoff', color: '#ef4444', duration: 1400 },
];

export default function SystemBuildDemo() {
  const [idea, setIdea] = useState('');
  const [projectName, setProjectName] = useState('');
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(0);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [buildMessage, setBuildMessage] = useState('Initializing...');
  const [buildComplete, setBuildComplete] = useState(false);
  const [showFinalReveal, setShowFinalReveal] = useState(false);

  // Preview data (loaded from API)
  const [departments, setDepartments] = useState<Department[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [simEvents, setSimEvents] = useState<SimEvent[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Build phases (populated dynamically from preview)
  const [phases, setPhases] = useState<BuildPhase[]>([]);

  const pollRef = useRef<any>(null);
  const phaseTimerRef = useRef<any>(null);

  // Load project info + preview on mount
  useEffect(() => {
    const init = async () => {
      try {
        const projRes = await portalApi.get('/api/portal/project');
        const proj = projRes.data;
        setIdea(proj?.setup_status?.build_idea || proj?.primary_business_problem || 'your AI system');
        setProjectName(proj?.organization_name || 'Your Project');

        if (proj?.setup_status?.activated) {
          setBuildComplete(true);
          setShowFinalReveal(true);
          setProgress(100);
        }

        // Generate preview
        const previewIdea = proj?.setup_status?.build_idea || proj?.primary_business_problem || 'AI system';
        const previewRes = await portalApi.post('/api/portal/project/build-preview', { idea: previewIdea });
        const d = previewRes.data;
        setDepartments(d.departments || []);
        setCapabilities(d.capabilities || []);
        setSimEvents(d.simulation_events || []);
        setTotalAgents(d.total_agents || 0);
        setPreviewLoaded(true);

        // Build phases from preview data
        const ideaShort = previewIdea.length > 60 ? previewIdea.substring(0, 60) + '...' : previewIdea;
        const builtPhases: BuildPhase[] = [
          { ...PHASE_TEMPLATES[0], steps: [
            { text: `Analyzing: "${ideaShort}"`, icon: 'bi-search', done: false },
            { text: 'Identifying core problem and value proposition', icon: 'bi-bullseye', done: false },
            { text: 'Mapping target users and stakeholders', icon: 'bi-people', done: false },
            { text: 'Defining system scope and boundaries', icon: 'bi-border-outer', done: false },
          ]},
          { ...PHASE_TEMPLATES[1], steps: (d.capabilities || []).slice(0, 6).map((c: Capability) => (
            { text: `${c.name} — ${c.description.substring(0, 60)}`, icon: 'bi-lightning-charge', done: false }
          ))},
          { ...PHASE_TEMPLATES[2], steps: (d.departments || []).map((dept: Department) => (
            { text: `${dept.name} created (${dept.agents.length} agents)`, icon: 'bi-plus-circle', done: false }
          ))},
          { ...PHASE_TEMPLATES[3], steps: [
            { text: 'Data Layer — storage and persistence', icon: 'bi-database', done: false },
            { text: 'Processing Layer — business logic and services', icon: 'bi-gear', done: false },
            { text: 'Decision Engine — AI-driven intelligence', icon: 'bi-cpu', done: false },
            { text: 'Automation Engine — workflows and triggers', icon: 'bi-arrow-repeat', done: false },
            { text: 'API Layer — external integrations', icon: 'bi-plug', done: false },
          ]},
          { ...PHASE_TEMPLATES[4], steps: [
            { text: 'Requirements document generated', icon: 'bi-file-earmark-text', done: false },
            { text: 'System blueprint created', icon: 'bi-map', done: false },
            { text: 'AI organization assembled', icon: 'bi-diagram-3', done: false },
            { text: 'Quality validation passed', icon: 'bi-shield-check', done: false },
          ]},
        ];
        setPhases(builtPhases);
      } catch (err) {
        console.warn('[Demo] Init failed:', err);
      }
    };
    init();

    // Poll build status
    pollRef.current = setInterval(async () => {
      try {
        const res = await portalApi.get('/api/portal/project/architect-status');
        if (res.data.complete) {
          clearInterval(pollRef.current);
          setBuildComplete(true);
        }
        setBuildMessage(res.data.message || 'Building...');
      } catch {}
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  // Phase progression engine — reveals steps one-by-one
  useEffect(() => {
    if (phases.length === 0 || showFinalReveal) return;

    const advanceStep = () => {
      setCurrentStepIdx(prev => {
        const phase = phases[currentPhaseIdx];
        if (!phase) return prev;
        const nextStep = prev + 1;

        if (nextStep < phase.steps.length) {
          // Reveal next step in current phase
          const updated = [...phases];
          updated[currentPhaseIdx].steps[nextStep].done = true;
          setPhases(updated);
          setProgress(Math.round(((currentPhaseIdx * 20) + ((nextStep + 1) / phase.steps.length * 20))));

          phaseTimerRef.current = setTimeout(advanceStep, phase.duration);
          return nextStep;
        } else {
          // Move to next phase
          const nextPhase = currentPhaseIdx + 1;
          if (nextPhase < phases.length) {
            setCurrentPhaseIdx(nextPhase);
            setProgress(nextPhase * 20);
            phaseTimerRef.current = setTimeout(advanceStep, 1000);
            return -1;
          } else {
            // All phases done → show final reveal
            setProgress(100);
            setTimeout(() => setShowFinalReveal(true), 1000);
            return prev;
          }
        }
      });
    };

    // Start first phase after a brief delay
    const startTimer = setTimeout(() => {
      if (phases[0]?.steps[0]) {
        const updated = [...phases];
        updated[0].steps[0].done = true;
        setPhases(updated);
        setCurrentStepIdx(0);
        phaseTimerRef.current = setTimeout(advanceStep, phases[0].duration);
      }
    }, 1500);

    return () => { clearTimeout(startTimer); if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
  }, [phases.length > 0 && !showFinalReveal]);

  const currentPhase = phases[currentPhaseIdx];

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
        {(showFinalReveal && buildComplete) && (
          <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', fontWeight: 600, borderRadius: 8, fontSize: 12 }}
            onClick={() => { window.location.href = '/portal/project/blueprint'; }}>
            Your System is Ready → Enter <i className="bi bi-arrow-right ms-1"></i>
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 py-2" style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        <div className="progress" style={{ height: 4, borderRadius: 4 }}>
          <div className="progress-bar" style={{ width: `${progress}%`, background: progress === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 4, transition: 'width 0.8s ease' }}></div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>

        {/* Idea context */}
        {!showFinalReveal && (
          <div className="text-center mb-4">
            <p className="text-muted mb-1" style={{ fontSize: 12 }}>Building system for:</p>
            <p style={{ fontSize: 13, color: 'var(--color-text)', fontStyle: 'italic', maxWidth: 500, margin: '0 auto' }}>
              "{idea.length > 120 ? idea.substring(0, 120) + '...' : idea}"
            </p>
          </div>
        )}

        {/* Progressive Build Phases */}
        {!showFinalReveal && phases.length > 0 && (
          <div>
            {phases.map((phase, pi) => {
              const isActive = pi === currentPhaseIdx;
              const isDone = pi < currentPhaseIdx;
              const isFuture = pi > currentPhaseIdx;
              if (isFuture) return null; // Don't show future phases

              return (
                <div key={phase.id} className="card border-0 shadow-sm mb-3" style={{ opacity: isDone ? 0.6 : 1, transition: 'opacity 0.5s' }}>
                  <div className="card-body p-3">
                    {/* Phase header */}
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${phase.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isDone ? <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 16 }}></i>
                          : isActive ? <div className="spinner-border" style={{ width: 16, height: 16, color: phase.color, borderWidth: 2 }}></div>
                          : <i className={`bi ${phase.icon}`} style={{ color: phase.color, fontSize: 14 }}></i>}
                      </div>
                      <div>
                        <div className="fw-bold" style={{ fontSize: 13, color: 'var(--color-text)' }}>{phase.title}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{phase.subtitle}</div>
                      </div>
                    </div>

                    {/* Steps (revealed one-by-one) */}
                    <div className="ms-4">
                      {phase.steps.map((step, si) => {
                        if (!step.done && !isDone) return null;
                        return (
                          <div key={si} className="d-flex align-items-center gap-2 py-1" style={{ animation: 'fadeIn 0.4s ease' }}>
                            <i className={`bi ${step.done ? 'bi-check' : step.icon}`} style={{ color: step.done ? '#10b981' : '#94a3b8', fontSize: 11, width: 14 }}></i>
                            <span style={{ fontSize: 12, color: step.done ? 'var(--color-text)' : '#94a3b8' }}>{step.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Waiting indicator */}
            {currentPhase && (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary me-2" style={{ width: 12, height: 12 }}></div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{buildMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Loading phases */}
        {!showFinalReveal && phases.length === 0 && (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" style={{ width: 40, height: 40 }}></div>
            <h6 className="fw-bold mb-1" style={{ fontSize: 14 }}>Designing your AI system...</h6>
            <p className="text-muted" style={{ fontSize: 12 }}>We're analyzing your idea and building your system architecture in real time.</p>
          </div>
        )}

        {/* FINAL REVEAL — Full system view */}
        {showFinalReveal && (
          <div style={{ animation: 'fadeIn 0.6s ease' }}>
            {/* Success banner */}
            {buildComplete && (
              <div className="text-center mb-4 p-4" style={{ background: 'linear-gradient(135deg, #10b98115, #3b82f615)', borderRadius: 16, border: '1px solid #10b98130' }}>
                <i className="bi bi-check-circle-fill d-block mb-2" style={{ fontSize: 36, color: '#10b981' }}></i>
                <h5 className="fw-bold mb-1" style={{ color: '#059669' }}>Your System Is Ready!</h5>
                <p className="text-muted mb-3" style={{ fontSize: 12 }}>{totalAgents} AI agents across {departments.length} departments, ready to power your system.</p>
                <button className="btn" style={{ background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, padding: '10px 28px', border: 'none' }}
                  onClick={() => { window.location.href = '/portal/project/blueprint'; }}>
                  Your System is Ready → Enter
                </button>
              </div>
            )}

            {/* AI Organization */}
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-body p-3">
                <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}>
                  <i className="bi bi-diagram-3 me-2" style={{ color: '#3b82f6' }}></i>Your AI Organization
                  <span className="text-muted ms-2" style={{ fontSize: 10, fontWeight: 400 }}>{totalAgents} agents</span>
                </h6>
                {departments.map((dept, di) => (
                  <div key={di} className="mb-2 p-2" style={{ background: '#f8fafc', borderRadius: 8, borderLeft: `3px solid ${dept.color}` }}>
                    <div className="fw-semibold" style={{ fontSize: 12 }}>{dept.name}</div>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {dept.agents.map((a, ai) => (
                        <span key={ai} className="badge" style={{ background: `${dept.color}15`, color: dept.color, fontSize: 9 }}>{a.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Capabilities */}
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-body p-3">
                <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}>
                  <i className="bi bi-lightning-charge me-2" style={{ color: '#f59e0b' }}></i>System Capabilities
                </h6>
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

            {/* Simulation */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3">
                <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}>
                  <i className="bi bi-activity me-2" style={{ color: '#10b981' }}></i>System Preview
                </h6>
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
          </div>
        )}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
