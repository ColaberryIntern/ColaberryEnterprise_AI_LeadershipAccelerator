/**
 * SystemBuildDemo — Locked demo page shown during requirements build
 *
 * Shows AI Organization Preview while the Architect service builds
 * the full requirements document in the background (~12-13 min).
 *
 * Features:
 * - AI org chart with 20-25 agents across 3-6 departments
 * - Cory as root AI Control Tower
 * - Capabilities derived from idea
 * - Simulation event feed
 * - Build progress panel with phase labels
 * - Locked navigation until complete
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface Agent { name: string; role: string; type: string }
interface Department { name: string; description: string; color: string; agents: Agent[] }
interface Capability { name: string; category: string; description: string }
interface SimEvent { agent: string; department: string; action: string; type: string }

const EVENT_ICONS: Record<string, string> = {
  data: 'bi-database',
  alert: 'bi-bell',
  decision: 'bi-diagram-3',
  automation: 'bi-gear',
  report: 'bi-bar-chart-line',
};

const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  idea_intake: { label: 'Analyzing your idea', icon: 'bi-lightbulb' },
  feature_discovery: { label: 'Designing capabilities', icon: 'bi-puzzle' },
  outline_generation: { label: 'Creating architecture', icon: 'bi-diagram-3' },
  outline_approval: { label: 'Locking structure', icon: 'bi-lock' },
  chapter_build: { label: 'Writing requirements', icon: 'bi-pencil-square' },
  quality_gates: { label: 'Validating system', icon: 'bi-shield-check' },
  final_assembly: { label: 'Finalizing blueprint', icon: 'bi-file-earmark-check' },
  complete: { label: 'Your system is ready!', icon: 'bi-rocket-takeoff' },
};

export default function SystemBuildDemo() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [simEvents, setSimEvents] = useState<SimEvent[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(true);

  // Build status
  const [phase, setPhase] = useState('idea_intake');
  const [progress, setProgress] = useState(5);
  const [buildMessage, setBuildMessage] = useState('Starting your build...');
  const [buildComplete, setBuildComplete] = useState(false);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [activeEventIdx, setActiveEventIdx] = useState(0);

  const pollRef = useRef<any>(null);
  const eventCycleRef = useRef<any>(null);

  // Load preview + start polling on mount
  useEffect(() => {
    // 1. Load AI org preview
    const loadPreview = async () => {
      try {
        // Get the idea from project setup_status
        const projRes = await portalApi.get('/api/portal/project');
        const idea = projRes.data?.setup_status?.build_idea || projRes.data?.primary_business_problem || 'AI system';
        const projectName = projRes.data?.organization_name || 'Your Project';

        // Check if already complete
        if (projRes.data?.setup_status?.activated) {
          setBuildComplete(true);
          setProgress(100);
          setPhase('complete');
          setBuildMessage('Your system is ready!');
        }

        // Generate preview
        const previewRes = await portalApi.post('/api/portal/project/build-preview', { idea });
        setDepartments(previewRes.data.departments || []);
        setCapabilities(previewRes.data.capabilities || []);
        setSimEvents(previewRes.data.simulation_events || []);
        setTotalAgents(previewRes.data.total_agents || 0);
      } catch (err) {
        console.warn('[Demo] Preview load failed:', err);
      } finally {
        setPreviewLoading(false);
      }
    };
    loadPreview();

    // 2. Poll build status every 10 seconds
    pollRef.current = setInterval(async () => {
      try {
        const res = await portalApi.get('/api/portal/project/architect-status');
        const s = res.data;
        setPhase(s.phase || 'idea_intake');
        setProgress(s.progress || 5);
        setBuildMessage(s.message || 'Building...');
        if (s.complete) {
          clearInterval(pollRef.current);
          setBuildComplete(true);
          setProgress(100);
          setPhase('complete');
          setBuildMessage('Your system is ready!');
        }
      } catch {}
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (eventCycleRef.current) clearInterval(eventCycleRef.current);
    };
  }, []);

  // Cycle simulation events
  useEffect(() => {
    if (simEvents.length === 0) return;
    eventCycleRef.current = setInterval(() => {
      setActiveEventIdx(prev => (prev + 1) % simEvents.length);
    }, 4000);
    return () => { if (eventCycleRef.current) clearInterval(eventCycleRef.current); };
  }, [simEvents]);

  const phaseInfo = PHASE_LABELS[phase] || PHASE_LABELS.idea_intake;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between px-4 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="d-flex align-items-center gap-3">
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-robot" style={{ fontSize: 18, color: '#fff' }}></i>
          </div>
          <div>
            <h6 className="fw-bold mb-0" style={{ color: '#f8fafc', fontSize: 14 }}>Building Your AI System</h6>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              <i className={`bi ${phaseInfo.icon} me-1`}></i>{phaseInfo.label}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {!buildComplete ? (
            <span><i className="bi bi-clock me-1"></i>Estimated: 12-15 minutes</span>
          ) : (
            <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', fontWeight: 600, borderRadius: 8, fontSize: 12 }}
              onClick={() => { window.location.href = '/portal/project/blueprint'; }}>
              <i className="bi bi-arrow-right me-1"></i>Enter Your System
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-2" style={{ background: '#1e293b' }}>
        <div className="d-flex justify-content-between mb-1">
          <span style={{ fontSize: 10, color: '#94a3b8' }}>{buildMessage}</span>
          <span style={{ fontSize: 10, color: buildComplete ? '#10b981' : '#3b82f6', fontWeight: 600 }}>{progress}%</span>
        </div>
        <div className="progress" style={{ height: 4, borderRadius: 4, background: '#334155' }}>
          <div className="progress-bar" style={{
            width: `${progress}%`,
            background: buildComplete ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            borderRadius: 4,
            transition: 'width 1s ease',
          }}></div>
        </div>
      </div>

      <div className="container py-4" style={{ maxWidth: 1100 }}>
        {/* Completion celebration */}
        {buildComplete && (
          <div className="text-center mb-4 p-4" style={{ background: 'linear-gradient(135deg, #10b98120, #3b82f620)', borderRadius: 16, border: '1px solid #10b98140' }}>
            <i className="bi bi-rocket-takeoff d-block mb-2" style={{ fontSize: 40, color: '#10b981' }}></i>
            <h4 className="fw-bold mb-1" style={{ color: '#10b981' }}>Your System Is Ready!</h4>
            <p className="mb-3" style={{ color: '#94a3b8', fontSize: 13 }}>
              {totalAgents} AI agents organized across {departments.length} departments are ready to power your system.
            </p>
            <button className="btn" style={{ background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 12, padding: '12px 32px', border: 'none' }}
              onClick={() => { window.location.href = '/portal/project/blueprint'; }}>
              <i className="bi bi-arrow-right me-2"></i>Enter Your System
            </button>
          </div>
        )}

        <div className="row g-4">
          {/* Left: AI Organization */}
          <div className="col-lg-7">
            <div className="p-3" style={{ background: '#1e293b', borderRadius: 12 }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: '#f8fafc' }}>
                  <i className="bi bi-diagram-3 me-2" style={{ color: '#3b82f6' }}></i>Your AI Organization
                </h6>
                <span style={{ fontSize: 10, color: '#64748b' }}>{totalAgents} agents · {departments.length} departments</span>
              </div>

              {previewLoading ? (
                <div className="text-center py-5">
                  <div className="spinner-border" style={{ color: '#3b82f6', width: 32, height: 32 }}></div>
                  <p className="mt-2" style={{ fontSize: 12, color: '#94a3b8' }}>Designing your AI organization...</p>
                </div>
              ) : (
                <div>
                  {/* Department cards */}
                  {departments.map((dept, di) => {
                    const isSelected = selectedDept === dept.name;
                    return (
                      <div key={di} className="mb-2">
                        <div
                          className="d-flex align-items-center gap-2 p-2"
                          style={{ background: isSelected ? `${dept.color}15` : '#0f172a', borderRadius: 8, border: `1px solid ${isSelected ? dept.color + '40' : '#334155'}`, cursor: 'pointer', transition: 'all 0.2s' }}
                          onClick={() => setSelectedDept(isSelected ? null : dept.name)}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: dept.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="bi bi-people" style={{ color: dept.color, fontSize: 14 }}></i>
                          </div>
                          <div className="flex-grow-1">
                            <div className="fw-semibold" style={{ fontSize: 12, color: '#f8fafc' }}>{dept.name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{dept.agents.length} agents · {dept.description}</div>
                          </div>
                          <i className={`bi bi-chevron-${isSelected ? 'down' : 'right'}`} style={{ color: '#64748b', fontSize: 10 }}></i>
                        </div>
                        {/* Agent list (expanded) */}
                        {isSelected && (
                          <div className="ms-4 mt-1">
                            {dept.agents.map((agent, ai) => (
                              <div key={ai} className="d-flex align-items-center gap-2 py-1 px-2 mb-1" style={{ background: '#0f172a', borderRadius: 6, borderLeft: `2px solid ${dept.color}` }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }}></div>
                                <div>
                                  <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 500 }}>{agent.name}</div>
                                  <div style={{ fontSize: 9, color: '#94a3b8' }}>{agent.role}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Capabilities + Simulation */}
          <div className="col-lg-5">
            {/* Capabilities */}
            <div className="p-3 mb-3" style={{ background: '#1e293b', borderRadius: 12 }}>
              <h6 className="fw-bold mb-3" style={{ fontSize: 13, color: '#f8fafc' }}>
                <i className="bi bi-lightning-charge me-2" style={{ color: '#f59e0b' }}></i>System Capabilities
              </h6>
              {capabilities.map((cap, i) => (
                <div key={i} className="d-flex align-items-start gap-2 mb-2 p-2" style={{ background: '#0f172a', borderRadius: 6 }}>
                  <span className="badge" style={{ background: '#3b82f620', color: '#60a5fa', fontSize: 8, flexShrink: 0 }}>{cap.category}</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 500 }}>{cap.name}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>{cap.description}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Simulation Feed */}
            <div className="p-3" style={{ background: '#1e293b', borderRadius: 12 }}>
              <h6 className="fw-bold mb-3" style={{ fontSize: 13, color: '#f8fafc' }}>
                <i className="bi bi-activity me-2" style={{ color: '#10b981' }}></i>Live Simulation
              </h6>
              {simEvents.map((evt, i) => (
                <div key={i} className="d-flex align-items-start gap-2 mb-2 p-2" style={{
                  background: i === activeEventIdx ? '#3b82f615' : '#0f172a',
                  borderRadius: 6,
                  borderLeft: i === activeEventIdx ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'all 0.3s',
                }}>
                  <i className={`bi ${EVENT_ICONS[evt.type] || 'bi-gear'}`} style={{ color: i === activeEventIdx ? '#3b82f6' : '#64748b', fontSize: 12, marginTop: 2 }}></i>
                  <div>
                    <div style={{ fontSize: 11, color: '#e2e8f0' }}>
                      <strong>{evt.agent}</strong>
                      <span className="ms-1" style={{ color: '#64748b', fontSize: 9 }}>({evt.department})</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{evt.action}</div>
                  </div>
                  {i === activeEventIdx && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', marginTop: 4, marginLeft: 'auto', flexShrink: 0 }}></div>}
                </div>
              ))}
            </div>

            {/* Build Phases */}
            <div className="p-3 mt-3" style={{ background: '#1e293b', borderRadius: 12 }}>
              <h6 className="fw-bold mb-3" style={{ fontSize: 13, color: '#f8fafc' }}>
                <i className="bi bi-list-check me-2" style={{ color: '#8b5cf6' }}></i>Build Progress
              </h6>
              {Object.entries(PHASE_LABELS).filter(([k]) => k !== 'complete').map(([key, val]) => {
                const isActive = key === phase;
                const isDone = Object.keys(PHASE_LABELS).indexOf(key) < Object.keys(PHASE_LABELS).indexOf(phase);
                return (
                  <div key={key} className="d-flex align-items-center gap-2 mb-1 py-1" style={{ opacity: isDone || isActive ? 1 : 0.4 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: isDone ? '#10b981' : isActive ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isDone ? <i className="bi bi-check" style={{ fontSize: 10, color: '#fff' }}></i>
                        : isActive ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }}></div>
                        : null}
                    </div>
                    <span style={{ fontSize: 11, color: isActive ? '#f8fafc' : isDone ? '#10b981' : '#64748b', fontWeight: isActive ? 600 : 400 }}>{val.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
