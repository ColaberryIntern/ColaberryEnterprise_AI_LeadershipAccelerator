import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { SectionCard, StatCard, StatusBadge } from '../../components/admin/shell';

/**
 * AdminCurriculumTab — what this cohort is actually taught, week by week.
 *
 * REBUILT 2026-09-08. The previous version read
 * `/cohorts/:id/curriculum/modules`, which queries `curriculum_modules WHERE
 * cohort_id = :id`. That is the pre-Timeline authoring model: nothing in the
 * Curriculum Composer writes it, so the tab rendered "No curriculum modules
 * found for this cohort" for every cohort on the platform, including ones
 * teaching that week. It was not a data gap, it was the wrong table.
 *
 * The live curriculum is `timeline_cards`, and it is COURSE-scoped: cards carry
 * `program_id` and leave `cohort_id` NULL, because one curriculum is shared
 * across every cohort of a course. A cohort reaches its curriculum through
 * `cohorts.program_id` — which is why the old cohort-id lookup could never have
 * returned anything, however much curriculum existed.
 *
 * Two empty states, not one, because they need different fixes: a cohort with
 * no parent Course has nothing to show and someone must attach it; a Course
 * with no cards needs authoring in the Composer.
 *
 * DROPPED IN THE REBUILD: the per-lesson status override and the lab-response
 * viewer. Both wrote through `curriculum_lessons`, the same dead model, so
 * neither had anything to act on for any live cohort. The endpoints remain
 * mounted and untouched; if the override is wanted again it belongs against
 * `timeline_card_progress`, which is a different feature, not a port.
 */

interface CurriculumCard {
  id: string;
  type: string;
  type_label: string;
  title: string;
  subtitle: string | null;
  week: number | null;
  bucket: string;
  visibility: string;
  status: string;
  order: number | null;
}

interface CurriculumWeek {
  week: number | null;
  label: string;
  cards: CurriculumCard[];
  total: number;
  published: number;
  draft: number;
}

interface CohortCurriculum {
  cohort_id: string;
  cohort_name: string;
  program_id: string | null;
  program_name: string | null;
  has_program: boolean;
  weeks: CurriculumWeek[];
  totals: { cards: number; published: number; draft: number; weeks: number };
}

interface ProgressCard {
  id: string; title: string; type_label: string; visibility: string;
  status: string; quiz_score: number | null; completed_at: string | null;
}

interface ParticipantProgress {
  enrollment_id: string;
  full_name: string;
  overall_pct: number;
  completed_cards: number;
  total_cards: number;
  weeks: Array<{
    week: number | null; label: string; total: number; completed: number;
    in_progress: number; pct: number; cards: ProgressCard[];
  }>;
}

interface EnrollmentInfo {
  id: string;
  full_name: string;
  email: string;
  company: string;
}

const VISIBILITY_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'info'> = {
  published: 'success',
  scheduled: 'info',
  draft: 'warning',
  archived: 'neutral',
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  locked: { bg: '#f1f5f9', color: '#64748b', label: 'Locked' },
  available: { bg: '#dbeafe', color: '#1d4ed8', label: 'Available' },
  in_progress: { bg: '#fef3c7', color: '#b45309', label: 'In progress' },
  completed: { bg: '#dcfce7', color: '#15803d', label: 'Completed' },
};

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? 'var(--bs-success)' : pct >= 40 ? 'var(--bs-warning)' : 'var(--bs-danger)';
  return (
    <div className="progress" style={{ height: 6 }} role="progressbar"
      aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Curriculum progress">
      <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

interface Props {
  cohortId: string;
  enrollments: EnrollmentInfo[];
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function AdminCurriculumTab({ cohortId, enrollments, showToast }: Props) {
  const [curriculum, setCurriculum] = useState<CohortCurriculum | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [progress, setProgress] = useState<ParticipantProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const loadCurriculum = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${cohortId}/curriculum/timeline`);
      setCurriculum(res.data);
    } catch {
      setLoadError('Failed to load the curriculum for this cohort.');
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { loadCurriculum(); }, [loadCurriculum]);

  // Clear the selected participant when the cohort changes — their progress
  // belongs to the previous cohort, and the API rejects a mismatched pairing.
  useEffect(() => { setSelectedEnrollmentId(''); setProgress(null); }, [cohortId]);

  const loadProgress = async (enrollmentId: string) => {
    setSelectedEnrollmentId(enrollmentId);
    if (!enrollmentId) { setProgress(null); return; }
    setProgressLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${cohortId}/curriculum/timeline/${enrollmentId}`);
      setProgress(res.data);
    } catch {
      showToast('Failed to load participant progress', 'error');
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  };

  const composerHref = useMemo(
    () => (curriculum?.program_id
      ? `/admin/orchestration?tab=composer&program=${curriculum.program_id}`
      : '/admin/orchestration?tab=composer'),
    [curriculum]
  );

  if (loading) {
    return (
      <SectionCard title="Curriculum">
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading…</span>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (loadError) {
    return (
      <SectionCard title="Curriculum">
        <div className="d-flex align-items-center justify-content-between">
          <span className="text-danger small mb-0">{loadError}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={loadCurriculum}>Retry</button>
        </div>
      </SectionCard>
    );
  }

  // Empty state 1 — no parent Course. Distinct from "no cards": nothing can be
  // shown until someone attaches this cohort to a Course, and authoring more
  // curriculum would not help.
  if (curriculum && !curriculum.has_program) {
    return (
      <SectionCard title="Curriculum" subtitle={curriculum.cohort_name}>
        <div className="border rounded p-4 text-center">
          <div className="fw-semibold mb-1">This cohort is not attached to a Course.</div>
          <p className="text-muted small mb-3">
            Curriculum is authored per Course and shared across that Course&apos;s cohorts.
            Until this cohort has a parent Course there is no curriculum to show —
            set one on the cohort&apos;s Edit form.
          </p>
        </div>
      </SectionCard>
    );
  }

  const totals = curriculum?.totals;

  return (
    <>
      <SectionCard
        title="Curriculum"
        subtitle={curriculum?.program_name
          ? `Course: ${curriculum.program_name} — shared by every cohort of this Course.`
          : 'Course curriculum.'}
        icon="book-open-line"
        actions={
          <div className="d-flex gap-1">
            <button className="btn btn-sm btn-outline-secondary" onClick={loadCurriculum}>Refresh</button>
            <Link className="btn btn-sm btn-outline-primary" to={composerHref}>Open Composer</Link>
          </div>
        }
      >
        <div className="row g-3 mb-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Weeks" value={totals?.weeks ?? 0} icon="calendar-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Cards" value={totals?.cards ?? 0} icon="stack-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Published" value={totals?.published ?? 0} icon="checkbox-circle-line"
              tone="success" hint="Visible to students" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Draft" value={totals?.draft ?? 0} icon="draft-line"
              tone={(totals?.draft ?? 0) > 0 ? 'warning' : 'neutral'} hint="Not yet visible" />
          </div>
        </div>

        {/* Empty state 2 — the Course exists, nothing authored in it yet. */}
        {curriculum && curriculum.weeks.length === 0 && (
          <div className="border rounded p-4 text-center">
            <div className="fw-semibold mb-1">No curriculum has been authored for this Course yet.</div>
            <p className="text-muted small mb-3">
              Cards are created in the Curriculum Composer and published to the Timeline.
              Once published they appear here and in the student feed.
            </p>
            <Link className="btn btn-sm btn-primary" to={composerHref}>Open the Composer</Link>
          </div>
        )}

        {curriculum?.weeks.map((w) => {
          const key = String(w.week ?? 'unscheduled');
          const open = expandedWeek === key;
          return (
            <div key={key} className="border rounded mb-2">
              <button
                className="btn w-100 text-start d-flex align-items-center justify-content-between p-3"
                onClick={() => setExpandedWeek(open ? null : key)}
                aria-expanded={open}
              >
                <span className="d-flex align-items-center gap-2 flex-wrap">
                  <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line`} aria-hidden="true" />
                  <span className="fw-semibold">{w.label}</span>
                  <span className="text-muted small">{w.total} card{w.total === 1 ? '' : 's'}</span>
                </span>
                <span className="d-flex gap-1">
                  {w.published > 0 && <StatusBadge label={`${w.published} published`} tone="success" />}
                  {w.draft > 0 && <StatusBadge label={`${w.draft} draft`} tone="warning" />}
                </span>
              </button>

              {open && (
                <div className="border-top table-responsive">
                  <table className="table table-sm mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th scope="col">Card</th>
                        <th scope="col">Type</th>
                        <th scope="col">Section</th>
                        <th scope="col">Visibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w.cards.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="fw-medium">{c.title}</div>
                            {c.subtitle && <div className="text-muted small">{c.subtitle}</div>}
                          </td>
                          <td className="small text-muted">{c.type_label}</td>
                          <td className="small text-muted text-capitalize">{c.bucket}</td>
                          <td>
                            <StatusBadge label={c.visibility} tone={VISIBILITY_TONE[c.visibility] ?? 'neutral'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </SectionCard>

      <SectionCard
        title="Participant progress"
        subtitle="Measured against PUBLISHED cards only — a draft was never shown to the student, so counting it would report everyone as permanently behind."
        icon="user-search-line"
        className="mt-3"
      >
        <div className="mb-3" style={{ maxWidth: 420 }}>
          <label className="form-label small fw-medium" htmlFor="curriculum-participant">Participant</label>
          <select
            id="curriculum-participant"
            className="form-select form-select-sm"
            value={selectedEnrollmentId}
            onChange={(e) => loadProgress(e.target.value)}
          >
            <option value="">Select a participant…</option>
            {enrollments.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name} — {e.email}</option>
            ))}
          </select>
        </div>

        {progressLoading && (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">Loading…</span>
            </div>
          </div>
        )}

        {!progressLoading && !progress && (
          <div className="text-muted small">Select a participant to see how far they have got.</div>
        )}

        {!progressLoading && progress && (
          <>
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="fw-semibold">{progress.full_name}</span>
              <span className="small text-muted">
                {progress.completed_cards} of {progress.total_cards} cards · {progress.overall_pct}%
              </span>
            </div>
            <div className="mb-3"><ProgressBar pct={progress.overall_pct} /></div>

            {progress.total_cards === 0 && (
              <div className="text-muted small">
                Nothing is published for this Course yet, so there is no progress to measure.
              </div>
            )}

            {progress.weeks.map((w) => (
              <div key={String(w.week ?? 'unscheduled')} className="mb-3">
                <div className="d-flex justify-content-between small mb-1">
                  <span className="fw-medium">{w.label}</span>
                  <span className="text-muted">{w.completed}/{w.total} · {w.pct}%</span>
                </div>
                <ProgressBar pct={w.pct} />
                <div className="d-flex flex-wrap gap-1 mt-2">
                  {w.cards.map((c) => {
                    const s = STATUS_STYLE[c.status] ?? STATUS_STYLE.locked;
                    return (
                      <span
                        key={c.id}
                        className="badge rounded-pill"
                        style={{ background: s.bg, color: s.color, fontWeight: 500 }}
                        title={`${c.title} — ${s.label}${c.quiz_score != null ? ` · score ${c.quiz_score}` : ''}`}
                      >
                        {c.title.length > 34 ? `${c.title.slice(0, 33)}…` : c.title}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </SectionCard>
    </>
  );
}
