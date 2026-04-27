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

interface Agent { name: string; role: string; type: string; responsibilities?: string[]; hitl_required?: boolean; hitl_reason?: string }
interface Department { name: string; description: string; color: string; agents: Agent[]; manual_fte?: number; ai_replacement_pct?: number }
interface Capability { name: string; category: string; description: string; impact?: string }
interface SimEvent { agent: string; department: string; action: string; type: string; delay_ms?: number }
interface SimScenario { name: string; description: string; events: SimEvent[] }
interface ROI { manual_annual_cost: number; ai_annual_cost: number; annual_savings: number; efficiency_gain_pct: number; roi_pct: number; payback_months: number; manual_fte_needed: number; ai_fte_equivalent: number }
interface HITLSummary { total_decisions: number; automated: number; human_required: number; human_oversight: number }

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
  const [simScenarios, setSimScenarios] = useState<SimScenario[]>([]);
  const [roi, setRoi] = useState<ROI | null>(null);
  const [hitlSummary, setHitlSummary] = useState<HITLSummary | null>(null);
  const [totalAgents, setTotalAgents] = useState(0);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [simRunning, setSimRunning] = useState(false);
  const [simEventIdx, setSimEventIdx] = useState(-1);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const simTimerRef = useRef<any>(null);

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
        // Skip the scripted animation if the build already finished — either fully activated
        // or at least the requirements doc has been pulled down (covers cases where activation
        // failed silently but the doc is real).
        if (proj?.setup_status?.activated || proj?.setup_status?.requirements_loaded) {
          setBuildComplete(true); setShowFinalReveal(true); setProgress(100);
        }
      } catch {}
    })();

    // Load preview in background (don't block animation)
    (async () => {
      try {
        const projRes = await portalApi.get('/api/portal/project');
        const previewIdea = projRes.data?.setup_status?.build_idea || projRes.data?.primary_business_problem || 'AI system';
        const previewRes = await portalApi.post('/api/portal/project/build-preview', { idea: previewIdea });
        const d = previewRes.data;
        setDepartments(d.departments || []);
        setCapabilities(d.capabilities || []);
        setSimScenarios(d.simulation_scenarios || []);
        setRoi(d.roi || null);
        setHitlSummary(d.hitl_summary || null);
        setTotalAgents(d.total_agents || 0);
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
            {SCRIPTED_PHASES.slice(0, currentPhaseIdx + 1).reverse().map((phase) => {
              const pi = SCRIPTED_PHASES.indexOf(phase);
              const revealed = revealedSteps[pi] || 0;
              const isActive = pi === currentPhaseIdx;
              const isDone = pi < currentPhaseIdx;

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

            {previewLoaded ? (
              <>
                {/* ROI Analysis */}
                {roi && (
                  <div className="card border-0 shadow-sm mb-3" style={{ background: 'linear-gradient(135deg, #1a365d, #2b6cb0)', color: '#fff' }}>
                    <div className="card-body p-4">
                      <h6 className="fw-bold mb-3" style={{ fontSize: 14, color: '#fff' }}><i className="bi bi-graph-up-arrow me-2"></i>Cost & ROI Analysis</h6>
                      <div className="row g-3 mb-3">
                        <div className="col-3 text-center">
                          <div className="fw-bold" style={{ fontSize: 20, color: '#fbbf24' }}>${(roi.annual_savings / 1000).toFixed(0)}K</div>
                          <div style={{ fontSize: 9, opacity: 0.8 }}>ANNUAL SAVINGS</div>
                        </div>
                        <div className="col-3 text-center">
                          <div className="fw-bold" style={{ fontSize: 20, color: '#34d399' }}>{roi.roi_pct}%</div>
                          <div style={{ fontSize: 9, opacity: 0.8 }}>ROI</div>
                        </div>
                        <div className="col-3 text-center">
                          <div className="fw-bold" style={{ fontSize: 20, color: '#60a5fa' }}>{roi.efficiency_gain_pct}%</div>
                          <div style={{ fontSize: 9, opacity: 0.8 }}>EFFICIENCY GAIN</div>
                        </div>
                        <div className="col-3 text-center">
                          <div className="fw-bold" style={{ fontSize: 20, color: '#a78bfa' }}>{roi.payback_months}mo</div>
                          <div style={{ fontSize: 9, opacity: 0.8 }}>PAYBACK</div>
                        </div>
                      </div>
                      <div className="row g-2">
                        <div className="col-6">
                          <div className="p-2" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Manual Operation</div>
                            <div className="fw-bold" style={{ fontSize: 14 }}>${(roi.manual_annual_cost / 1000).toFixed(0)}K/year</div>
                            <div style={{ fontSize: 9, opacity: 0.6 }}>{roi.manual_fte_needed} full-time employees needed</div>
                          </div>
                        </div>
                        <div className="col-6">
                          <div className="p-2" style={{ background: 'rgba(16,185,129,0.2)', borderRadius: 8 }}>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>AI-Powered Operation</div>
                            <div className="fw-bold" style={{ fontSize: 14, color: '#34d399' }}>${(roi.ai_annual_cost / 1000).toFixed(0)}K/year</div>
                            <div style={{ fontSize: 9, opacity: 0.6 }}>{roi.ai_fte_equivalent} staff + {totalAgents} AI agents</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Interactive Agent Network Graph */}
                <div className="card border-0 shadow-sm mb-3">
                  <div className="card-body p-3">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h6 className="fw-bold mb-0" style={{ fontSize: 13 }}><i className="bi bi-diagram-3 me-2" style={{ color: '#3b82f6' }}></i>Your AI Organization</h6>
                      <span className="text-muted" style={{ fontSize: 10 }}>{totalAgents} agents · {departments.length} departments · Drag to explore</span>
                    </div>
                    <AgentNetworkGraph departments={departments} width={640} height={380} />
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

                {/* Department Details — expandable */}
                <div className="card border-0 shadow-sm mb-3">
                  <div className="card-body p-3">
                    <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}><i className="bi bi-people me-2" style={{ color: '#8b5cf6' }}></i>Team Breakdown</h6>
                    {departments.map((dept, di) => {
                      const isExpanded = expandedDept === dept.name;
                      return (
                        <div key={di} className="mb-2">
                          <div className="d-flex align-items-center gap-2 p-2" style={{ background: isExpanded ? `${dept.color}08` : '#f8fafc', borderRadius: 8, borderLeft: `3px solid ${dept.color}`, cursor: 'pointer' }}
                            onClick={() => setExpandedDept(isExpanded ? null : dept.name)}>
                            <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: 10, color: '#64748b' }}></i>
                            <div className="flex-grow-1">
                              <div className="fw-semibold" style={{ fontSize: 12 }}>{dept.name}</div>
                              <div className="text-muted" style={{ fontSize: 10 }}>{dept.description}</div>
                            </div>
                            <div className="text-end" style={{ fontSize: 9 }}>
                              <div style={{ color: dept.color }}>{dept.agents.length} agents</div>
                              {dept.ai_replacement_pct && <div className="text-muted">Replaces {dept.manual_fte || '?'} FTEs ({dept.ai_replacement_pct}%)</div>}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="ms-3 mt-1">
                              {dept.agents.map((agent, ai) => (
                                <div key={ai} className="p-2 mb-1" style={{ background: '#fff', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                                  <div className="d-flex align-items-center justify-content-between">
                                    <div className="fw-medium" style={{ fontSize: 11, color: dept.color }}>{agent.name}</div>
                                    <div className="d-flex gap-1">
                                      {agent.hitl_required && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 8 }}><i className="bi bi-person me-1"></i>HITL</span>}
                                      <span className="badge" style={{ background: '#f1f5f9', color: '#64748b', fontSize: 8 }}>{agent.type}</span>
                                    </div>
                                  </div>
                                  <div className="text-muted" style={{ fontSize: 10 }}>{agent.role}</div>
                                  {agent.responsibilities && agent.responsibilities.length > 0 && (
                                    <div className="mt-1">
                                      {agent.responsibilities.map((r, ri) => (
                                        <div key={ri} className="d-flex align-items-center gap-1" style={{ fontSize: 9, color: '#64748b' }}>
                                          <i className="bi bi-check2" style={{ color: '#10b981', fontSize: 8 }}></i>{r}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {agent.hitl_required && agent.hitl_reason && (
                                    <div className="mt-1 p-1" style={{ background: '#fef3c7', borderRadius: 4, fontSize: 9, color: '#92400e' }}>
                                      <i className="bi bi-exclamation-triangle me-1"></i>{agent.hitl_reason}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Human-in-the-Loop */}
                {hitlSummary && (
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-body p-3">
                      <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}><i className="bi bi-person-check me-2" style={{ color: '#f59e0b' }}></i>Human-in-the-Loop Requirements</h6>
                      <div className="row g-2 mb-3">
                        <div className="col-3 text-center">
                          <div className="p-2" style={{ background: '#10b98115', borderRadius: 6 }}>
                            <div className="fw-bold" style={{ fontSize: 16, color: '#059669' }}>{hitlSummary.automated}</div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Automated</div>
                          </div>
                        </div>
                        <div className="col-3 text-center">
                          <div className="p-2" style={{ background: '#f59e0b15', borderRadius: 6 }}>
                            <div className="fw-bold" style={{ fontSize: 16, color: '#92400e' }}>{hitlSummary.human_required}</div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Need Human</div>
                          </div>
                        </div>
                        <div className="col-3 text-center">
                          <div className="p-2" style={{ background: '#3b82f615', borderRadius: 6 }}>
                            <div className="fw-bold" style={{ fontSize: 16, color: '#3b82f6' }}>{100 - hitlSummary.human_oversight}%</div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Autonomous</div>
                          </div>
                        </div>
                        <div className="col-3 text-center">
                          <div className="p-2" style={{ background: '#8b5cf615', borderRadius: 6 }}>
                            <div className="fw-bold" style={{ fontSize: 16, color: '#8b5cf6' }}>{hitlSummary.human_oversight}%</div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Oversight</div>
                          </div>
                        </div>
                      </div>
                      <div className="p-2" style={{ background: '#fef3c7', borderRadius: 6, fontSize: 11, color: '#92400e' }}>
                        <i className="bi bi-info-circle me-1"></i>
                        {hitlSummary.human_required} agent{hitlSummary.human_required !== 1 ? 's' : ''} require human approval for critical decisions. All others operate autonomously with monitoring.
                      </div>
                    </div>
                  </div>
                )}

                {/* Capabilities */}
                <div className="card border-0 shadow-sm mb-3">
                  <div className="card-body p-3">
                    <h6 className="fw-bold mb-3" style={{ fontSize: 13 }}><i className="bi bi-lightning-charge me-2" style={{ color: '#f59e0b' }}></i>System Capabilities</h6>
                    <div className="row g-2">
                      {capabilities.map((cap, i) => (
                        <div key={i} className="col-6">
                          <div className="p-2" style={{ background: '#f8fafc', borderRadius: 6, borderLeft: `2px solid ${cap.impact === 'high' ? '#10b981' : cap.impact === 'medium' ? '#f59e0b' : '#94a3b8'}` }}>
                            <div className="d-flex align-items-center gap-1">
                              <span className="fw-medium" style={{ fontSize: 11 }}>{cap.name}</span>
                              <span className="badge" style={{ background: cap.impact === 'high' ? '#10b98120' : '#f1f5f9', color: cap.impact === 'high' ? '#059669' : '#64748b', fontSize: 7 }}>{cap.impact}</span>
                            </div>
                            <div className="text-muted" style={{ fontSize: 9 }}>{cap.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Interactive Simulation with Org Chart */}
                {simScenarios.length > 0 && (
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-body p-3">
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <h6 className="fw-bold mb-0" style={{ fontSize: 14 }}><i className="bi bi-play-circle me-2" style={{ color: '#10b981' }}></i>Live AI Simulation</h6>
                        <button className="btn btn-sm" style={{ background: simRunning ? '#ef4444' : '#10b981', color: '#fff', fontSize: 11, borderRadius: 8, fontWeight: 600, border: 'none', padding: '6px 16px' }}
                          onClick={() => {
                            if (simRunning) { setSimRunning(false); setSimEventIdx(-1); if (simTimerRef.current) clearInterval(simTimerRef.current); return; }
                            setSimRunning(true); setSimEventIdx(0);
                            const events = simScenarios[selectedScenario]?.events || [];
                            let idx = 0;
                            simTimerRef.current = setInterval(() => {
                              idx++;
                              if (idx >= events.length) { clearInterval(simTimerRef.current); setTimeout(() => setSimRunning(false), 1000); return; }
                              setSimEventIdx(idx);
                            }, 2500);
                          }}>
                          <i className={`bi ${simRunning ? 'bi-stop-fill' : 'bi-play-fill'} me-1`}></i>{simRunning ? 'Stop Simulation' : 'Run Simulation'}
                        </button>
                      </div>

                      {/* Scenario selector tabs */}
                      <div className="d-flex flex-wrap gap-1 mb-3">
                        {simScenarios.map((sc, si) => (
                          <button key={si} className="btn btn-sm" style={{
                            fontSize: 10, borderRadius: 20, padding: '4px 14px',
                            background: selectedScenario === si ? '#3b82f6' : 'transparent',
                            color: selectedScenario === si ? '#fff' : '#64748b',
                            border: selectedScenario === si ? 'none' : '1px solid #e2e8f0',
                            fontWeight: selectedScenario === si ? 600 : 400,
                          }} onClick={() => { setSelectedScenario(si); setSimEventIdx(-1); setSimRunning(false); if (simTimerRef.current) clearInterval(simTimerRef.current); }}>
                            {sc.name}
                          </button>
                        ))}
                      </div>

                      <p className="text-muted mb-3" style={{ fontSize: 11 }}>{simScenarios[selectedScenario]?.description}</p>

                      {/* Split: Org chart (agents light up) + Task list */}
                      <div className="row g-3">
                        <div className="col-7">
                          {/* Org chart with active agents */}
                          <div style={{ background: '#f8fafc', borderRadius: 8, overflow: 'hidden' }}>
                            <AgentNetworkGraph
                              departments={departments}
                              width={380}
                              height={300}
                              activeAgents={simRunning && simEventIdx >= 0
                                ? (simScenarios[selectedScenario]?.events || []).slice(0, simEventIdx + 1).map(e => e.agent)
                                : []}
                            />
                          </div>
                        </div>
                        <div className="col-5">
                          {/* Task list */}
                          <div className="fw-semibold mb-2" style={{ fontSize: 11, color: '#64748b' }}>
                            <i className="bi bi-list-check me-1"></i>Execution Log
                          </div>
                          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                            {(simScenarios[selectedScenario]?.events || []).map((evt, ei) => {
                              const isActive = ei === simEventIdx;
                              const isDone = ei < simEventIdx;
                              const isFuture = ei > simEventIdx || simEventIdx < 0;
                              return (
                                <div key={ei} className="d-flex align-items-start gap-2 mb-2 p-2" style={{
                                  background: isActive ? '#f0fdf4' : isDone ? '#fafafa' : '#fff',
                                  borderRadius: 6,
                                  borderLeft: isActive ? '3px solid #10b981' : isDone ? '3px solid #d1d5db' : '3px solid transparent',
                                  opacity: isFuture && simRunning ? 0.35 : 1,
                                  transition: 'all 0.4s',
                                  border: isActive ? undefined : '1px solid #f1f5f9',
                                }}>
                                  <div style={{ marginTop: 2 }}>
                                    {isDone ? <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 12 }}></i>
                                      : isActive ? <div className="spinner-border" style={{ width: 12, height: 12, color: '#10b981', borderWidth: 2 }}></div>
                                      : <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #d1d5db' }}></div>}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10 }}>
                                      <strong style={{ color: isActive ? '#059669' : 'var(--color-text)' }}>{evt.agent}</strong>
                                    </div>
                                    <div style={{ fontSize: 9, color: '#94a3b8' }}>{evt.department}</div>
                                    <div style={{ fontSize: 10, color: isActive ? '#059669' : '#64748b', fontStyle: isActive ? 'italic' : 'normal' }}>{evt.action}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Simulation complete badge */}
                      {!simRunning && simEventIdx >= 0 && simEventIdx >= ((simScenarios[selectedScenario]?.events || []).length - 1) && (
                        <div className="text-center mt-3 p-2" style={{ background: '#f0fdf4', borderRadius: 8, border: '1px solid #10b98130' }}>
                          <i className="bi bi-check-circle-fill me-1" style={{ color: '#10b981' }}></i>
                          <span style={{ fontSize: 11, color: '#059669', fontWeight: 500 }}>Scenario complete — all agents executed successfully</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
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
