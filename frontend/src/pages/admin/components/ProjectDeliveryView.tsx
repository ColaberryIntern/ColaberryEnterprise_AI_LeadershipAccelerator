import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/shell';
import CaseStudyKpi from './projectDelivery/CaseStudyKpi';
import CaseStudyReadinessModal from './projectDelivery/CaseStudyReadinessModal';
import BuildEvidencePanel, { ProjectEvidence } from './projectDelivery/BuildEvidencePanel';
import ArtifactsPanel, { ArtifactGroup } from './projectDelivery/ArtifactsPanel';
import ReleaseRow, {
  ReleaseSummaryLike, TimingRollup, releaseColor, fmtDay as fmtReleaseDay,
} from './projectDelivery/ReleaseRow';

/**
 * ProjectDeliveryView — what each student has actually built, on a timeline,
 * ranked by how close it is to being a case study.
 *
 * TWO DESIGN DECISIONS, both forced by what production actually holds:
 *
 * 1. READINESS IS RANKED, NOT GATED. A prod audit found zero projects hold both
 *    a build plan and artifacts — 29 live projects carry tasks with no repo, and
 *    the repo-bearing ones carry no tasks. A "ready for case study" filter would
 *    therefore show an empty list, which reads as a broken page rather than as a
 *    true statement. So every project is scored and ordered, and each names what
 *    it is MISSING. An empty ready-list becomes a worklist.
 *
 * 2. THE GANTT IS DRAWN ON THE RELEASE SPINE, not per task. Production has 656
 *    tasks across 29 projects on six shared releases (r0-r4 plus prep). Drawing
 *    656 bars would be unreadable; drawing six per project shows the shape of
 *    the programme and expands to the task detail on demand.
 *
 * Bars are positioned by percentage across a shared date axis rather than by a
 * charting library — a Gantt is a date scale and two divs, and adding a
 * dependency is a decision that belongs to the operator, not to this view.
 */

interface ReadinessComponent { key: string; label: string; score: number; weight: number; gap?: string }
interface Readiness { score: number; ready: boolean; components: ReadinessComponent[]; gaps: string[] }

interface ProjectRow {
  project_id: string;
  name: string | null;
  student_name: string | null;
  student_email: string | null;
  cohort_id: string | null;
  cohort_name: string | null;
  stage: string;
  maturity_score: number | null;
  has_repo: boolean;
  repo_url: string | null;
  /** The student's Command Center — a GitHub Pages site at the root of their own repo.
   *  Null until they publish Pages, which is why the icon renders conditionally. */
  command_center_url: string | null;
  has_exec_summary: boolean;
  artifacts: number;
  tasks_total: number;
  tasks_complete: number;
  tasks_overdue: number;
  tasks_pct: number;
  starts_on: string | null;
  ends_on: string | null;
  already_case_study: boolean;
  readiness: Readiness;
  /** The release spine, delivered with the LIST so a collapsed row can draw its
   *  coloured bars immediately. Measured at 11ms for all 30 projects in two batched
   *  queries — the reason this is eager rather than fetched per expand. */
  releases: ReleaseSummaryLike[];
}

interface GanttTask {
  id: string; title: string; status: string; release_key: string | null;
  due_on: string | null; due_baseline_on: string | null;
  slipped: boolean; overdue: boolean; blocked_by: string[];
}
interface GanttRelease extends ReleaseSummaryLike {
  tasks: GanttTask[];
}
interface Gantt {
  project_id: string;
  releases: GanttRelease[];
  totals: { tasks: number; complete: number; overdue: number; undated: number };
}

/** Date-only string -> epoch day, UTC. Avoids `new Date('2026-09-08')` rendering
 *  as the previous day west of UTC. */
function day(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function scoreTone(n: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (n >= 70) return 'success';
  if (n >= 35) return 'warning';
  if (n > 0) return 'danger';
  return 'neutral';
}

/** The shared date axis every bar is positioned against. */
interface Axis { min: number; max: number; span: number; today: number }

function buildAxis(rows: ProjectRow[]): Axis | null {
  const days = rows.flatMap((r) => [day(r.starts_on), day(r.ends_on)]).filter((d): d is number => d != null);
  if (!days.length) return null;
  const min = Math.min(...days);
  const max = Math.max(...days);
  const now = Math.floor(Date.now() / 86400000);
  // A zero span (every task on one date) would divide by zero when positioning.
  return { min, max, span: Math.max(1, max - min), today: now };
}

function pct(d: number, axis: Axis): number {
  return Math.min(100, Math.max(0, ((d - axis.min) / axis.span) * 100));
}

/** Month boundaries across the axis, for the header ticks. */
function monthTicks(axis: Axis): Array<{ label: string; left: number }> {
  const out: Array<{ label: string; left: number }> = [];
  const start = new Date(axis.min * 86400000);
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  for (let i = 0; i < 24; i += 1) {
    const d = Math.floor(cur.getTime() / 86400000);
    if (d > axis.max) break;
    if (d >= axis.min) {
      out.push({
        label: cur.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }),
        left: pct(d, axis),
      });
    }
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

function ReleaseBar({ rel, axis }: { rel: ReleaseSummaryLike; axis: Axis }) {
  const s = day(rel.starts_on);
  const e = day(rel.ends_on);
  if (s == null || e == null) return null;
  const left = pct(s, axis);
  const width = Math.max(1.2, pct(e, axis) - left);
  const donePct = rel.total ? Math.round((rel.complete / rel.total) * 100) : 0;
  const color = releaseColor(rel.release_key);
  const name = rel.display_name || rel.release_key;
  return (
    <div
      className="position-absolute"
      style={{ left: `${left}%`, width: `${width}%`, top: 4, height: 16, borderRadius: 4, background: `${color}33`, border: `1px solid ${color}` }}
      title={`${name}: ${rel.complete}/${rel.total} complete${rel.overdue ? `, ${rel.overdue} overdue` : ''} (${fmtDay(rel.starts_on)}–${fmtDay(rel.ends_on)})`}
    >
      {/* Completion fill — the bar shows both the window and the progress. */}
      <div style={{ width: `${donePct}%`, height: '100%', background: color, borderRadius: 3, opacity: 0.85 }} />
      {rel.overdue > 0 && (
        <span
          className="position-absolute"
          style={{ right: 2, top: -1, fontSize: 10, color: 'var(--bs-danger)', fontWeight: 700 }}
          aria-label={`${rel.overdue} overdue`}
        >
          !
        </span>
      )}
    </div>
  );
}

interface Props {
  /** Scope to one cohort when opened from a drill-down; undefined = all cohorts. */
  cohortId?: string;
}

export default function ProjectDeliveryView({ cohortId }: Props) {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [gantt, setGantt] = useState<Record<string, Gantt>>({});
  const [ganttLoading, setGanttLoading] = useState<string | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  // Evidence and artifacts are fetched on EXPAND, unlike the release bars: they are
  // detail nobody reads from a collapsed row, and both are empty for every project
  // today, so eager-loading them would cost 60 requests to render two empty states.
  const [evidence, setEvidence] = useState<Record<string, ProjectEvidence>>({});
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactGroup[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  /** The row whose readiness breakdown is open, or null. Holds the row rather than an id
   *  so the modal keeps rendering the numbers it was opened with even if the list refreshes
   *  underneath it. */
  const [scoreFor, setScoreFor] = useState<ProjectRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/projects/delivery', {
        params: cohortId ? { cohort_id: cohortId } : {},
      });
      setRows(res.data.projects || []);
    } catch {
      setError('Could not load project delivery.');
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (gantt[id] && evidence[id] && artifacts[id]) return;

    setGanttLoading(gantt[id] ? null : id);
    setDetailLoading(id);
    // Fetched together so one expand is one round of requests. Settled rather than
    // all-or-nothing: a failing artifacts call must not blank the timeline.
    const [g, ev, ar] = await Promise.allSettled([
      gantt[id] ? Promise.resolve(null) : api.get(`/api/admin/projects/${id}/gantt`),
      evidence[id] ? Promise.resolve(null) : api.get(`/api/admin/projects/${id}/evidence`),
      artifacts[id] ? Promise.resolve(null) : api.get(`/api/admin/projects/${id}/artifacts`),
    ]);
    if (g.status === 'fulfilled' && g.value) {
      setGantt((prev) => ({ ...prev, [id]: g.value!.data }));
    }
    if (ev.status === 'fulfilled' && ev.value) {
      setEvidence((prev) => ({ ...prev, [id]: ev.value!.data }));
    }
    if (ar.status === 'fulfilled' && ar.value) {
      setArtifacts((prev) => ({ ...prev, [id]: ar.value!.data.artifacts || [] }));
    }
    // A rejected gantt leaves it absent, so the row says "timeline unavailable"
    // rather than rendering an empty plan, which would read as "no work".
    setGanttLoading(null);
    setDetailLoading(null);
  };

  const visible = useMemo(
    () => (onlyOverdue ? rows.filter((r) => r.tasks_overdue > 0) : rows),
    [rows, onlyOverdue]
  );
  const axis = useMemo(() => buildAxis(rows), [rows]);
  const ticks = useMemo(() => (axis ? monthTicks(axis) : []), [axis]);

  const totals = useMemo(() => ({
    projects: rows.length,
    building: rows.filter((r) => r.tasks_total > 0).length,
    overdue: rows.reduce((n, r) => n + r.tasks_overdue, 0),
    candidates: rows.filter((r) => !r.already_case_study && r.readiness.score >= 35).length,
  }), [rows]);

  if (loading) {
    return (
      <SectionCard title="Project Delivery">
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div>
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Project Delivery">
        <div className="d-flex align-items-center justify-content-between">
          <span className="text-danger small mb-0">{error}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>Retry</button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Project Delivery"
      subtitle="Every student build on one timeline, ranked by how close it is to being a case study. Each row names what is still missing."
      icon="rocket-2-line"
      actions={
        <div className="d-flex gap-2 align-items-center">
          <div className="form-check form-switch mb-0">
            <input className="form-check-input" type="checkbox" id="only-overdue"
              checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
            <label className="form-check-label small" htmlFor="only-overdue">Overdue only</label>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>Refresh</button>
        </div>
      }
    >
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3"><StatCard label="Projects" value={totals.projects} icon="folder-line" tone="primary" /></div>
        <div className="col-6 col-lg-3"><StatCard label="With a build plan" value={totals.building} icon="list-check" tone="info" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Overdue tasks" value={totals.overdue} icon="alarm-warning-line" tone={totals.overdue > 0 ? 'danger' : 'success'} /></div>
        <div className="col-6 col-lg-3"><StatCard label="Case-study candidates" value={totals.candidates} icon="award-line" tone="success" hint="score 35+" /></div>
      </div>

      {visible.length === 0 && (
        <div className="border rounded p-4 text-center text-muted small">
          {onlyOverdue ? 'No project has overdue tasks.' : 'No projects found for this scope.'}
        </div>
      )}

      {/* Shared date axis header — every bar below is positioned against this. */}
      {axis && visible.length > 0 && (
        <div className="d-none d-lg-flex align-items-center mb-1 small text-muted">
          <div style={{ width: '38%' }} />
          <div className="position-relative flex-grow-1" style={{ height: 16 }}>
            {ticks.map((t) => (
              <span key={t.label + t.left} className="position-absolute" style={{ left: `${t.left}%`, fontSize: 10 }}>{t.label}</span>
            ))}
          </div>
        </div>
      )}

      {visible.map((r) => {
        const g = gantt[r.project_id];
        const open = expanded === r.project_id;
        return (
          <div key={r.project_id} className="border rounded mb-2">
            <div className="d-flex flex-wrap align-items-center p-2 gap-2">
              <div style={{ minWidth: 0, flex: '1 1 34%' }}>
                <button className="btn btn-link p-0 text-start fw-semibold text-truncate d-block"
                  onClick={() => toggle(r.project_id)} aria-expanded={open}>
                  <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line`} aria-hidden="true" /> {r.name || '(unnamed project)'}
                </button>
                <div className="text-muted small text-truncate d-flex align-items-center gap-2">
                  <span className="text-truncate">
                    {r.student_name || '—'}{r.cohort_name ? ` · ${r.cohort_name}` : ''}
                  </span>
                  {/* TOP LEVEL, next to the name, because it is the fastest way to see the
                      thing the student actually built. Both are public URLs the platform
                      already stores; each renders only when detected, so a row never shows
                      a link that goes nowhere. */}
                  {r.command_center_url && (
                    <a
                      href={r.command_center_url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Command Center — ${r.command_center_url}`}
                      aria-label="Open the Command Center"
                      onClick={(e) => e.stopPropagation()}
                      style={{ lineHeight: 1 }}
                    >
                      <i className="ri-dashboard-3-line" aria-hidden="true" />
                    </a>
                  )}
                  {r.repo_url && (
                    <a
                      href={r.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Repository — ${r.repo_url}`}
                      aria-label="Open the repository"
                      onClick={(e) => e.stopPropagation()}
                      style={{ lineHeight: 1 }}
                    >
                      <i className="ri-github-fill" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>

              {/* The timeline lane. Hidden on small screens, where a date axis
                  compressed into a phone width communicates nothing. */}
              <div className="d-none d-lg-block position-relative flex-grow-1" data-testid="timeline-lane"
                style={{ height: 24, background: 'var(--bs-tertiary-bg, #f8f9fa)', borderRadius: 4 }}>
                {/* Drawn from the LIST payload, not from the per-project timeline
                    fetch. Previously these bars only appeared after expanding a row,
                    so a collapsed page showed one flat grey bar per project and gave
                    away nothing at a glance. The summaries now arrive with the list
                    (two batched queries, 11ms for all 30 projects), so the colours
                    are there on load. */}
                {axis && r.releases?.map((rel) => (
                  <ReleaseBar key={rel.release_key} rel={rel} axis={axis} />
                ))}
                {axis && !r.releases?.length && r.starts_on && r.ends_on && (
                  <div className="position-absolute" title={`${fmtDay(r.starts_on)}–${fmtDay(r.ends_on)}`}
                    style={{ left: `${pct(day(r.starts_on)!, axis)}%`, width: `${Math.max(1.2, pct(day(r.ends_on)!, axis) - pct(day(r.starts_on)!, axis))}%`, top: 4, height: 16, borderRadius: 4, background: '#cbd5e1' }} />
                )}
                {axis && (
                  <div className="position-absolute" aria-label="today"
                    style={{ left: `${pct(axis.today, axis)}%`, top: 0, bottom: 0, width: 2, background: 'var(--bs-danger)', opacity: 0.6 }} />
                )}
              </div>

              <div className="d-flex align-items-center gap-2" style={{ flex: '0 0 auto' }}>
                {r.tasks_total > 0 && (
                  <span className="small text-muted">{r.tasks_complete}/{r.tasks_total}</span>
                )}
                {r.tasks_overdue > 0 && <StatusBadge label={`${r.tasks_overdue} overdue`} tone="danger" />}
                <CaseStudyKpi
                  readiness={r.readiness}
                  alreadyCaseStudy={r.already_case_study}
                  onOpen={r.already_case_study ? undefined : () => setScoreFor(r)}
                />
              </div>
            </div>

            {/* Gaps: the point of the ranking. Always visible, not behind the expander. */}
            {r.readiness.gaps.length > 0 && (
              <div className="px-2 pb-2 small text-muted">
                <span className="me-1">Needs:</span>
                {r.readiness.gaps.map((gp) => (
                  <span key={gp} className="badge rounded-pill me-1"
                    style={{ background: 'var(--bs-secondary-bg, #e9ecef)', color: 'var(--bs-body-color)', fontWeight: 500 }}>{gp}</span>
                ))}
              </div>
            )}

            {open && (
              <div className="border-top p-2">
                {ganttLoading === r.project_id && (
                  <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Loading…</span></div></div>
                )}
                {!ganttLoading && !g && <div className="text-muted small">Timeline unavailable for this project.</div>}
                {g && g.totals.tasks === 0 && (
                  <div className="text-muted small">
                    No build plan for this project — nothing to place on a timeline yet.
                  </div>
                )}
                {g && g.totals.tasks > 0 && (
                  <>
                    <div className="small text-muted mb-2">
                      {g.totals.complete}/{g.totals.tasks} tasks complete
                      {g.totals.overdue > 0 && <> · <span className="text-danger">{g.totals.overdue} overdue</span></>}
                      {g.totals.undated > 0 && <> · {g.totals.undated} with no date</>}
                    </div>
                    {g.releases.map((rel) => (
                      <ReleaseRow key={rel.release_key} release={rel}>
                        <ul className="list-unstyled mb-0 mt-1">
                          {rel.tasks.map((t) => (
                            <li key={t.id} className="d-flex justify-content-between small py-1 border-bottom">
                              <span className={t.status === 'complete' ? 'text-muted text-decoration-line-through' : ''}>
                                {t.title}
                                {t.blocked_by.length > 0 && <span className="text-muted"> · blocked by {t.blocked_by.length}</span>}
                              </span>
                              <span className={t.overdue ? 'text-danger fw-medium' : 'text-muted'}>
                                {fmtReleaseDay(t.due_on)}
                                {t.slipped && <span title="moved later than its baseline"> ⚑</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </ReleaseRow>
                    ))}
                  </>
                )}

                {/* What was actually constructed, and what documents exist. Both are
                    empty for every project today and say why — see the panels. */}
                <div className="mt-3">
                  <div className="fw-semibold small mb-2">Build evidence</div>
                  <BuildEvidencePanel
                    evidence={evidence[r.project_id] ?? null}
                    repoUrl={r.repo_url}
                    loading={detailLoading === r.project_id && !evidence[r.project_id]}
                  />
                </div>
                <div className="mt-3">
                  <div className="fw-semibold small mb-2">Artifacts</div>
                  <ArtifactsPanel
                    artifacts={artifacts[r.project_id] ?? null}
                    loading={detailLoading === r.project_id && !artifacts[r.project_id]}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {scoreFor && (
        <CaseStudyReadinessModal
          projectName={scoreFor.name || '(unnamed project)'}
          studentName={scoreFor.student_name}
          readiness={scoreFor.readiness}
          onClose={() => setScoreFor(null)}
        />
      )}
    </SectionCard>
  );
}
