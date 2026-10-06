import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../../utils/api';

/**
 * Instructor controls for the Presentation Studio.
 *
 * THE GAP THIS CLOSES. Four cohort-scoped admin endpoints shipped with the Studio
 * backend — template menu, required template per cohort, cohort readiness — and had
 * no consumer at all. An instructor could not reach any of it without curl. The bulk
 * session map had not even been routed.
 *
 * SCOPED BY COHORT, AND IT SAYS SO ON SCREEN. Setting a required template changes one
 * cohort. It does not touch another cohort, does not edit a card, and does not move
 * legacy presentation or demo instances globally — which the build spec explicitly
 * forbids. It is also not retroactive: a learner already preparing keeps the template
 * they started against. The panel states that next to the control rather than leaving
 * an instructor to find out.
 *
 * PLAN THEN COMMIT, NEVER ONE BUTTON. Pointing a cohort at a room is shown as a dry
 * run first — every row, what would happen to it, and why a blocked row is blocked.
 * Nothing is written until the instructor presses commit on a plan they have read.
 * The server re-proves the plan on the way back in; this panel is a reader, not an
 * authority.
 *
 * READINESS IS NOT ATTENDANCE. The counts come from persisted answers, never from
 * someone having opened a page. "Started preparing" and "showed up" are different
 * facts and are not conflated here.
 */

interface Cohort { id: string; name?: string | null; cohort_name?: string | null; status?: string | null }
interface TemplateOption { id: string; label?: string | null; name?: string | null }
interface ReadinessRow { enrollmentId?: string; learner?: string | null; prepState: string; hasAudience: boolean }
interface Readiness {
  cohort_id: string; total: number; not_started: number; preparing: number; ready: number;
  with_audience: number; rows: ReadinessRow[];
}
interface MapRow {
  assignmentId: string; projectId: string; storyId: string; cohortId: string | null;
  attemptId: string | null; currentBookingId: string | null;
  outcome: 'will_map' | 'already_mapped' | 'will_remap' | 'blocked_no_booking';
  actions: string[]; blocked_reason: string | null;
}
interface MapPlan {
  dry_run: true; bookingId: string; cohortId: string; storyId: string;
  booking_exists: boolean; rows: MapRow[]; summary: Record<string, number>;
}
interface MapReport {
  dry_run: false;
  rows: Array<{ assignmentId: string; outcome: 'mapped' | 'skipped' | 'failed'; detail: string }>;
  summary: { mapped: number; skipped: number; failed: number };
}

type Load<T> = { phase: 'idle' } | { phase: 'loading' } | { phase: 'ready'; data: T } | { phase: 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OUTCOME_LABEL: Record<MapRow['outcome'], string> = {
  will_map: 'Will be mapped',
  already_mapped: 'Already in this room',
  will_remap: 'Will MOVE from another room',
  blocked_no_booking: 'Blocked',
};

function cohortLabel(c: Cohort): string {
  return c.cohort_name || c.name || c.id;
}

/** A failure the instructor can act on, never a bare "something went wrong". */
function errText(e: unknown, fallback: string): string {
  const err = e as { response?: { status?: number; data?: { error?: string } } };
  return err?.response?.data?.error || (err?.response?.status === 404
    ? 'The Presentation Studio is switched off for this environment.'
    : fallback);
}

const PresentationStudioPanel: React.FC = () => {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [required, setRequired] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Load<Readiness>>({ phase: 'idle' });

  const [storyId, setStoryId] = useState('PREP-6');
  const [bookingId, setBookingId] = useState('');
  const [plan, setPlan] = useState<Load<MapPlan>>({ phase: 'idle' });
  const [report, setReport] = useState<MapReport | null>(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    let dead = false;
    Promise.all([
      api.get('/api/admin/cohorts').catch(() => ({ data: [] })),
      api.get('/api/admin/presentation/templates').catch(() => ({ data: [] })),
    ]).then(([c, t]) => {
      if (dead) return;
      const list = Array.isArray(c.data) ? c.data : (c.data?.cohorts ?? []);
      setCohorts(list as Cohort[]);
      const tl = Array.isArray(t.data) ? t.data : (t.data?.templates ?? []);
      setTemplates(tl as TemplateOption[]);
    });
    return () => { dead = true; };
  }, []);

  // Changing cohort invalidates everything below it. Leaving a previous cohort's
  // readiness or plan on screen under a new cohort's name is how someone commits a
  // map against the wrong group.
  useEffect(() => {
    setReadiness({ phase: 'idle' });
    setPlan({ phase: 'idle' });
    setReport(null);
    setRequired('');
    setNotice(null);
    if (!UUID_RE.test(cohortId)) return;
    let dead = false;
    api.get(`/api/admin/presentation/cohorts/${cohortId}/required-template`)
      .then((r) => { if (!dead) setRequired(String(r.data?.template || r.data?.templateId || '')); })
      .catch(() => undefined);
    return () => { dead = true; };
  }, [cohortId]);

  const loadReadiness = useCallback(async () => {
    if (!UUID_RE.test(cohortId)) return;
    setReadiness({ phase: 'loading' });
    try {
      const r = await api.get(`/api/admin/presentation/cohorts/${cohortId}/readiness`);
      setReadiness({ phase: 'ready', data: r.data as Readiness });
    } catch (e) {
      setReadiness({ phase: 'error', message: errText(e, 'Could not load readiness.') });
    }
  }, [cohortId]);

  const saveTemplate = async (value: string) => {
    if (!UUID_RE.test(cohortId) || !value) return;
    setSaving(true); setNotice(null);
    try {
      await api.put(`/api/admin/presentation/cohorts/${cohortId}/required-template`, { template: value });
      setRequired(value);
      setNotice('Saved for this cohort only. Learners already preparing keep the template they started with.');
    } catch (e) {
      setNotice(errText(e, 'Could not save that template.'));
    } finally {
      setSaving(false);
    }
  };

  const runPlan = async () => {
    setReport(null);
    if (!UUID_RE.test(cohortId) || !UUID_RE.test(bookingId) || !storyId.trim()) return;
    setPlan({ phase: 'loading' });
    try {
      const r = await api.post('/api/admin/presentation/session-map/plan', {
        cohort_id: cohortId, story_id: storyId.trim(), booking_id: bookingId,
      });
      setPlan({ phase: 'ready', data: r.data as MapPlan });
    } catch (e) {
      setPlan({ phase: 'error', message: errText(e, 'Could not build the plan.') });
    }
  };

  const commit = async () => {
    if (plan.phase !== 'ready') return;
    setCommitting(true);
    try {
      const r = await api.post('/api/admin/presentation/session-map/commit', { plan: plan.data });
      setReport(r.data as MapReport);
      setPlan({ phase: 'idle' });
    } catch (e) {
      setPlan({ phase: 'error', message: errText(e, 'The commit failed. Nothing was changed.') });
    } finally {
      setCommitting(false);
    }
  };

  const willChange = useMemo(() => {
    if (plan.phase !== 'ready') return 0;
    return plan.data.rows.filter((r) => r.outcome === 'will_map' || r.outcome === 'will_remap').length;
  }, [plan]);

  const hasCohort = UUID_RE.test(cohortId);

  return (
    <section style={{ border: '1px solid var(--line, #E3E8EF)', borderRadius: 10, padding: 18, marginTop: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>🎤 Presentation Studio — instructor controls</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted, #5B6B7C)' }}>
        Everything here is scoped to one cohort. Nothing on this panel edits a card or moves
        legacy presentation and demo instances.
      </p>

      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }} htmlFor="ps-cohort">Cohort</label>
      <select
        id="ps-cohort"
        value={cohortId}
        onChange={(e) => setCohortId(e.target.value)}
        style={{ width: '100%', maxWidth: 460, padding: 8, marginBottom: 18 }}
      >
        <option value="">Choose a cohort…</option>
        {cohorts.map((c) => <option key={c.id} value={c.id}>{cohortLabel(c)}</option>)}
      </select>

      {!hasCohort ? null : (
        <>
          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }} htmlFor="ps-template">
              Required template
            </label>
            <select
              id="ps-template"
              value={required}
              disabled={saving}
              onChange={(e) => saveTemplate(e.target.value)}
              style={{ width: '100%', maxWidth: 460, padding: 8 }}
            >
              <option value="">No cohort override (learners choose)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.label || t.name || t.id}</option>)}
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted, #5B6B7C)' }}>
              Applies to this cohort only, and is <strong>not retroactive</strong> — anyone already
              preparing keeps the template they started against.
            </p>
            {notice && <p role="status" style={{ margin: '6px 0 0', fontSize: 12 }}>{notice}</p>}
          </div>

          <div style={{ marginBottom: 22 }}>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={loadReadiness}>
              {readiness.phase === 'loading' ? 'Loading…' : 'Check who has started preparing'}
            </button>
            {readiness.phase === 'error' && (
              <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--cherry-deep, #C20E1E)' }}>
                {readiness.message}
              </p>
            )}
            {readiness.phase === 'ready' && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <strong>{readiness.data.total}</strong> learners ·{' '}
                {readiness.data.ready} ready · {readiness.data.preparing} preparing ·{' '}
                {readiness.data.not_started} not started · {readiness.data.with_audience} have named an audience
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted, #5B6B7C)' }}>
                  Counted from what learners have saved, not from who opened the page.
                </p>
              </div>
            )}
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Point this cohort at one live session</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
              <span>
                <label style={{ display: 'block', fontSize: 12 }} htmlFor="ps-story">Task</label>
                <input id="ps-story" value={storyId} onChange={(e) => setStoryId(e.target.value)} style={{ padding: 7, width: 120 }} />
              </span>
              <span style={{ flex: 1, minWidth: 260 }}>
                <label style={{ display: 'block', fontSize: 12 }} htmlFor="ps-booking">Room booking id</label>
                <input id="ps-booking" value={bookingId} onChange={(e) => setBookingId(e.target.value)} placeholder="uuid of the booked session" style={{ padding: 7, width: '100%' }} />
              </span>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={runPlan} disabled={!UUID_RE.test(bookingId) || plan.phase === 'loading'}>
                {plan.phase === 'loading' ? 'Checking…' : 'Preview the change'}
              </button>
            </div>

            {plan.phase === 'error' && (
              <p role="alert" style={{ fontSize: 13, color: 'var(--cherry-deep, #C20E1E)' }}>{plan.message}</p>
            )}

            {plan.phase === 'ready' && (
              <div>
                {!plan.data.booking_exists && (
                  <p role="alert" style={{ fontSize: 13, color: 'var(--cherry-deep, #C20E1E)' }}>
                    That booking does not exist. Nothing can be mapped to it.
                  </p>
                )}
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line, #E3E8EF)' }}>
                      <th style={{ padding: '4px 6px' }}>Project</th>
                      <th style={{ padding: '4px 6px' }}>What would happen</th>
                      <th style={{ padding: '4px 6px' }}>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.data.rows.map((r) => (
                      <tr key={r.assignmentId} style={{ borderBottom: '1px solid var(--line-soft, #F1F4F8)' }}>
                        <td style={{ padding: '4px 6px' }}>{r.projectId.slice(0, 8)}…</td>
                        <td style={{ padding: '4px 6px' }}>{OUTCOME_LABEL[r.outcome]}</td>
                        <td style={{ padding: '4px 6px', color: 'var(--muted, #5B6B7C)' }}>
                          {r.blocked_reason || r.actions.join(' ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: '10px 0', fontSize: 13 }}>
                  <strong>{willChange}</strong> of {plan.data.rows.length} would change. Nothing has been
                  written yet.
                </p>
                <button type="button" className="btn btn-sm btn-primary" onClick={commit} disabled={committing || willChange === 0}>
                  {committing ? 'Committing…' : `Commit ${willChange} change${willChange === 1 ? '' : 's'}`}
                </button>
              </div>
            )}

            {report && (
              <div style={{ marginTop: 12, fontSize: 13 }} role="status">
                Mapped {report.summary.mapped} · skipped {report.summary.skipped} · failed {report.summary.failed}.
                {report.summary.skipped > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted, #5B6B7C)' }}>
                    A skipped row is one the server re-checked and declined — the plan is re-proved on
                    the way back in, so anything that changed since the preview is not acted on.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default PresentationStudioPanel;
