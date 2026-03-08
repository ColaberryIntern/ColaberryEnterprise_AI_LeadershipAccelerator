import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface LessonSummary {
  id: string;
  lesson_number: number;
  title: string;
  lesson_type: string;
  estimated_minutes: number;
  status: string;
}

interface ModuleSummary {
  id: string;
  module_number: number;
  title: string;
  description: string;
  skill_area: string;
  total_lessons: number;
  completed_lessons: number;
  lessons: LessonSummary[];
}

interface CurriculumData {
  modules: ModuleSummary[];
  overall_progress: number;
  total_lessons: number;
  completed_lessons: number;
  total_modules: number;
  hours_remaining: number;
}

const SKILL_LABELS: Record<string, string> = {
  strategy_trust: 'Strategy & Trust',
  governance: 'Governance & Risk',
  requirements: 'Requirements Precision',
  build_discipline: 'Build Discipline',
  executive_authority: 'Executive Authority',
};

const SKILL_COLORS: Record<string, string> = {
  strategy_trust: '#6366f1',
  governance: '#ef4444',
  requirements: '#3b82f6',
  build_discipline: '#8b5cf6',
  executive_authority: '#10b981',
};

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  locked: { icon: 'bi-lock-fill', color: '#94a3b8', bg: '#f1f5f9', label: 'Locked' },
  available: { icon: 'bi-play-circle-fill', color: '#6366f1', bg: '#eef2ff', label: 'Available' },
  in_progress: { icon: 'bi-arrow-repeat', color: '#f59e0b', bg: '#fffbeb', label: 'In Progress' },
  completed: { icon: 'bi-check-circle-fill', color: '#10b981', bg: '#ecfdf5', label: 'Completed' },
};

const TYPE_BADGES: Record<string, { icon: string; color: string; bg: string }> = {
  concept: { icon: 'bi-book', color: '#3b82f6', bg: '#eff6ff' },
  lab: { icon: 'bi-tools', color: '#8b5cf6', bg: '#f5f3ff' },
  assessment: { icon: 'bi-clipboard-check', color: '#f59e0b', bg: '#fffbeb' },
  reflection: { icon: 'bi-chat-square-quote', color: '#10b981', bg: '#ecfdf5' },
};

interface SkillGenomeData {
  layers: Array<{
    id: string;
    name: string;
    description: string;
    avg_proficiency: number;
    domains: Array<{
      id: string;
      name: string;
      avg_proficiency: number;
      skills: Array<{
        id: string;
        name: string;
        description: string;
        proficiency_level: number;
        effective_level: number;
        decayed: boolean;
        evidence_count: number;
      }>;
    }>;
  }>;
  overall_proficiency: number;
  total_skills: number;
  skills_started: number;
  skills_mastered: number;
}

function proficiencyColor(level: number): string {
  if (level >= 4) return '#10b981';
  if (level >= 2) return '#f59e0b';
  return '#ef4444';
}

function PortalCurriculumPage() {
  const [data, setData] = useState<CurriculumData | null>(null);
  const [genome, setGenome] = useState<SkillGenomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      portalApi.get('/api/portal/curriculum'),
      portalApi.get('/api/portal/curriculum/skill-genome').catch(() => ({ data: null })),
    ]).then(([currRes, genomeRes]) => {
      setData(currRes.data);
      if (genomeRes.data) setGenome(genomeRes.data);
      if (currRes.data.modules?.length > 0) {
        const first = currRes.data.modules[0];
        setSelectedModule(first.id);
        setExpandedModules(new Set([first.id]));
      }
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  const toggleModule = (id: string) => {
    setSelectedModule(id);
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: '#6366f1' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="alert alert-warning">
        <i className="bi bi-exclamation-triangle me-2"></i>
        Unable to load your curriculum. Please try again or contact support.
      </div>
    );
  }

  const activeModule = data.modules.find((m) => m.id === selectedModule);
  const completedModules = data.modules.filter((m) => m.completed_lessons === m.total_lessons).length;

  return (
    <>
      {/* Header */}
      <div className="mb-2">
        <p className="text-muted small mb-1">
          <i className="bi bi-mortarboard me-1"></i>Personalized Curriculum
        </p>
        <h1 className="h4 fw-bold" style={{ color: '#1e293b' }}>
          AI Leadership Learning Path
        </h1>
      </div>

      {/* Progress Bar */}
      <div className="card border-0 shadow-sm mb-4" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
        <div className="card-body py-3 text-white">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="small fw-medium">Overall Progress</span>
            <span className="fw-bold">{Math.round(data.overall_progress)}%</span>
          </div>
          <div className="progress" style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
            <div
              className="progress-bar"
              role="progressbar"
              style={{ width: `${data.overall_progress}%`, background: '#fff', borderRadius: 4 }}
              aria-valuenow={data.overall_progress}
              aria-valuemin={0}
              aria-valuemax={100}
            ></div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Skills / Modules', value: `${completedModules}`, sub: `of ${data.modules.length}`, icon: 'bi-layers', color: '#6366f1' },
          { label: 'Completion', value: `${Math.round(data.overall_progress)}%`, sub: `${data.completed_lessons} lessons`, icon: 'bi-graph-up-arrow', color: '#3b82f6' },
          { label: 'Lessons Done', value: `${data.completed_lessons}`, sub: `of ${data.total_lessons}`, icon: 'bi-check2-square', color: '#10b981' },
          { label: 'Time Remaining', value: `${data.hours_remaining}h`, sub: `${Math.round(data.hours_remaining * 60)} min`, icon: 'bi-clock', color: '#f59e0b' },
        ].map((card) => (
          <div className="col-6 col-lg-3" key={card.label}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-3 text-center">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
                  style={{ width: 40, height: 40, background: `${card.color}15` }}
                >
                  <i className={`bi ${card.icon}`} style={{ fontSize: 18, color: card.color }}></i>
                </div>
                <div className="fw-bold" style={{ fontSize: 22, color: '#1e293b' }}>{card.value}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{card.sub}</div>
                <div className="text-muted small">{card.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        {/* Left Sidebar — Modules + Skills */}
        <div className="col-lg-4">
          {/* Module List */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
              <span className="fw-semibold small" style={{ color: '#1e293b' }}>
                <i className="bi bi-collection me-2"></i>Modules
              </span>
            </div>
            <div className="list-group list-group-flush">
              {data.modules.map((mod) => {
                const pct = mod.total_lessons > 0 ? Math.round((mod.completed_lessons / mod.total_lessons) * 100) : 0;
                const isSelected = mod.id === selectedModule;
                const isExpanded = expandedModules.has(mod.id);
                const skillColor = SKILL_COLORS[mod.skill_area] || '#6366f1';

                return (
                  <React.Fragment key={mod.id}>
                    <button
                      className="list-group-item list-group-item-action border-0 py-3"
                      style={{
                        borderLeft: `3px solid ${isSelected ? skillColor : 'transparent'}`,
                        background: isSelected ? `${skillColor}08` : 'transparent',
                      }}
                      onClick={() => toggleModule(mod.id)}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-2">
                          <div
                            className="d-flex align-items-center justify-content-center rounded"
                            style={{ width: 28, height: 28, background: `${skillColor}15`, fontSize: 12, fontWeight: 700, color: skillColor }}
                          >
                            {mod.module_number}
                          </div>
                          <div>
                            <div className="fw-semibold" style={{ fontSize: 13, color: '#1e293b' }}>{mod.title}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{mod.completed_lessons}/{mod.total_lessons} lessons</div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-semibold" style={{ fontSize: 12, color: pct === 100 ? '#10b981' : '#94a3b8' }}>
                            {pct}%
                          </span>
                          <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 12, color: '#94a3b8' }}></i>
                        </div>
                      </div>
                      <div className="progress mt-2" style={{ height: 3, background: '#f1f5f9' }}>
                        <div className="progress-bar" style={{ width: `${pct}%`, background: skillColor, borderRadius: 2 }}></div>
                      </div>
                    </button>
                    {/* Inline lesson list when expanded on mobile */}
                    {isExpanded && (
                      <div className="d-lg-none">
                        {mod.lessons.map((lesson) => {
                          const statusCfg = STATUS_CONFIG[lesson.status] || STATUS_CONFIG.locked;
                          return (
                            <div
                              key={lesson.id}
                              className="list-group-item border-0 py-2 ps-5 d-flex align-items-center justify-content-between"
                              style={{ fontSize: 12, opacity: lesson.status === 'locked' ? 0.5 : 1 }}
                            >
                              <div className="d-flex align-items-center gap-2">
                                <i className={`bi ${statusCfg.icon}`} style={{ color: statusCfg.color, fontSize: 14 }}></i>
                                <span>{lesson.title}</span>
                              </div>
                              {(lesson.status === 'available' || lesson.status === 'in_progress') && (
                                <button
                                  className="btn btn-sm px-2 py-0"
                                  style={{ fontSize: 11, background: '#6366f1', color: '#fff', borderRadius: 4 }}
                                  onClick={(e) => { e.stopPropagation(); navigate(`/portal/curriculum/lessons/${lesson.id}`); }}
                                >
                                  {lesson.status === 'in_progress' ? 'Continue' : 'Start'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Skill Genome */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
              <div className="d-flex align-items-center justify-content-between">
                <span className="fw-semibold small" style={{ color: '#1e293b' }}>
                  <i className="bi bi-diagram-3 me-2"></i>Skill Genome
                </span>
                {genome && (
                  <span className="badge" style={{ background: '#eef2ff', color: '#6366f1', fontSize: 10 }}>
                    {genome.skills_started}/{genome.total_skills} skills
                  </span>
                )}
              </div>
            </div>
            <div className="card-body" style={{ padding: '12px 16px' }}>
              {genome ? (
                <>
                  {/* Overall proficiency */}
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small" style={{ color: '#64748b' }}>Overall Proficiency</span>
                    <span className="fw-bold small" style={{ color: '#6366f1' }}>{genome.overall_proficiency}%</span>
                  </div>
                  <div className="progress mb-3" style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}>
                    <div className="progress-bar" style={{ width: `${genome.overall_proficiency}%`, background: '#6366f1', borderRadius: 3 }}></div>
                  </div>

                  {/* Layers as accordion */}
                  {genome.layers.map((layer) => {
                    const layerColor = SKILL_COLORS[layer.id] || '#6366f1';
                    const isLayerExpanded = expandedLayers.has(layer.id);
                    return (
                      <div key={layer.id} className="mb-2">
                        <button
                          className="btn btn-sm w-100 text-start d-flex align-items-center justify-content-between p-2 rounded"
                          style={{ background: `${layerColor}08`, border: 'none' }}
                          onClick={() => setExpandedLayers(prev => {
                            const next = new Set(prev);
                            if (next.has(layer.id)) next.delete(layer.id);
                            else next.add(layer.id);
                            return next;
                          })}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <div
                              className="d-flex align-items-center justify-content-center rounded"
                              style={{ width: 20, height: 20, background: `${layerColor}20` }}
                            >
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: layerColor }}></div>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{layer.name}</span>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <span style={{ fontSize: 11, color: layerColor, fontWeight: 600 }}>
                              {layer.avg_proficiency.toFixed(1)}/5
                            </span>
                            <i className={`bi ${isLayerExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 10, color: '#94a3b8' }}></i>
                          </div>
                        </button>

                        {isLayerExpanded && (
                          <div className="ps-3 pt-2">
                            {layer.domains.map((domain) => (
                              <div key={domain.id} className="mb-2">
                                <div className="small fw-medium mb-1" style={{ color: '#64748b', fontSize: 11 }}>
                                  {domain.name}
                                </div>
                                {domain.skills.map((skill) => (
                                  <div key={skill.id} className="d-flex align-items-center gap-2 mb-1 ps-2">
                                    <div className="flex-grow-1">
                                      <div className="d-flex align-items-center justify-content-between">
                                        <span style={{ fontSize: 11, color: '#334155' }}>
                                          {skill.name}
                                          {skill.decayed && (
                                            <i className="bi bi-clock ms-1" style={{ color: '#f59e0b', fontSize: 10 }} title="Skill decay — practice to restore"></i>
                                          )}
                                        </span>
                                        <span style={{ fontSize: 10, color: proficiencyColor(skill.effective_level), fontWeight: 600 }}>
                                          {skill.effective_level}/5
                                        </span>
                                      </div>
                                      <div className="progress" style={{ height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                        <div
                                          className="progress-bar"
                                          style={{
                                            width: `${(skill.effective_level / 5) * 100}%`,
                                            background: proficiencyColor(skill.effective_level),
                                            borderRadius: 2,
                                          }}
                                        ></div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Summary stats */}
                  <div className="d-flex gap-3 mt-3 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <div className="text-center flex-fill">
                      <div className="fw-bold" style={{ fontSize: 16, color: '#10b981' }}>{genome.skills_mastered}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Mastered</div>
                    </div>
                    <div className="text-center flex-fill">
                      <div className="fw-bold" style={{ fontSize: 16, color: '#f59e0b' }}>{genome.skills_started - genome.skills_mastered}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>In Progress</div>
                    </div>
                    <div className="text-center flex-fill">
                      <div className="fw-bold" style={{ fontSize: 16, color: '#94a3b8' }}>{genome.total_skills - genome.skills_started}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Not Started</div>
                    </div>
                  </div>
                </>
              ) : (
                /* Fallback to module-based progress if genome API not available */
                data.modules.map((mod) => {
                  const pct = mod.total_lessons > 0 ? Math.round((mod.completed_lessons / mod.total_lessons) * 100) : 0;
                  const color = SKILL_COLORS[mod.skill_area] || '#6366f1';
                  return (
                    <div key={mod.skill_area} className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="badge" style={{ background: `${color}15`, color, fontSize: 10, fontWeight: 600 }}>
                          {SKILL_LABELS[mod.skill_area] || mod.skill_area}
                        </span>
                        <span className="fw-bold" style={{ fontSize: 12, color }}>{pct}%</span>
                      </div>
                      <div className="progress" style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                        <div className="progress-bar" style={{ width: `${pct}%`, background: color, borderRadius: 4 }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right — Lesson List */}
        <div className="col-lg-8 d-none d-lg-block">
          {activeModule ? (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white border-bottom" style={{ padding: '16px' }}>
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span
                        className="badge"
                        style={{ background: SKILL_COLORS[activeModule.skill_area] || '#6366f1', color: '#fff', fontSize: 10 }}
                      >
                        Module {activeModule.module_number}
                      </span>
                      <span
                        className="badge"
                        style={{ background: `${SKILL_COLORS[activeModule.skill_area] || '#6366f1'}15`, color: SKILL_COLORS[activeModule.skill_area] || '#6366f1', fontSize: 10 }}
                      >
                        {SKILL_LABELS[activeModule.skill_area]}
                      </span>
                    </div>
                    <h5 className="fw-bold mb-1" style={{ color: '#1e293b' }}>{activeModule.title}</h5>
                    <p className="text-muted small mb-0">{activeModule.description}</p>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold" style={{ fontSize: 20, color: SKILL_COLORS[activeModule.skill_area] || '#6366f1' }}>
                      {activeModule.total_lessons > 0 ? Math.round((activeModule.completed_lessons / activeModule.total_lessons) * 100) : 0}%
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{activeModule.completed_lessons}/{activeModule.total_lessons} complete</div>
                  </div>
                </div>
              </div>

              {/* Lessons */}
              <div className="list-group list-group-flush">
                {activeModule.lessons.map((lesson, idx) => {
                  const statusCfg = STATUS_CONFIG[lesson.status] || STATUS_CONFIG.locked;
                  const typeBadge = TYPE_BADGES[lesson.lesson_type] || TYPE_BADGES.concept;
                  const isLocked = lesson.status === 'locked';
                  const canStart = lesson.status === 'available' || lesson.status === 'in_progress';

                  return (
                    <div
                      key={lesson.id}
                      className="list-group-item border-0 py-3"
                      style={{
                        opacity: isLocked ? 0.45 : 1,
                        borderBottom: idx < activeModule.lessons.length - 1 ? '1px solid #f1f5f9' : 'none',
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-3">
                          {/* Status icon circle */}
                          <div
                            className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                            style={{ width: 36, height: 36, background: statusCfg.bg }}
                          >
                            <i className={`bi ${statusCfg.icon}`} style={{ fontSize: 16, color: statusCfg.color }}></i>
                          </div>

                          <div>
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <span className="fw-semibold" style={{ fontSize: 13, color: '#1e293b' }}>
                                {lesson.title}
                              </span>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <span
                                className="badge"
                                style={{ background: typeBadge.bg, color: typeBadge.color, fontSize: 10, fontWeight: 500 }}
                              >
                                <i className={`bi ${typeBadge.icon} me-1`}></i>
                                {lesson.lesson_type.charAt(0).toUpperCase() + lesson.lesson_type.slice(1)}
                              </span>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                <i className="bi bi-clock me-1"></i>{lesson.estimated_minutes} min
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {lesson.status === 'completed' && (
                            <span className="badge" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 11 }}>
                              <i className="bi bi-check-lg me-1"></i>Done
                            </span>
                          )}
                          {canStart && (
                            <button
                              className="btn btn-sm px-3"
                              style={{
                                background: '#6366f1',
                                color: '#fff',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                              onClick={() => navigate(`/portal/curriculum/lessons/${lesson.id}`)}
                            >
                              {lesson.status === 'in_progress' ? (
                                <><i className="bi bi-arrow-repeat me-1"></i>Continue</>
                              ) : (
                                <><i className="bi bi-play-fill me-1"></i>Start Lesson</>
                              )}
                            </button>
                          )}
                          {isLocked && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              <i className="bi bi-lock me-1"></i>Locked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center text-muted py-5">Select a module to view its lessons</div>
          )}
        </div>
      </div>
    </>
  );
}

export default PortalCurriculumPage;
