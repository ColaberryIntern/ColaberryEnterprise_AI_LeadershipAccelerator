import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

interface TimelineEvent {
  at: string | null;
  kind: string;
  icon: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  title: string;
  detail?: string;
}

interface PersonHistory {
  profile: Record<string, any>;
  acquisition: Record<string, any> | null;
  curriculum: Record<string, any> | null;
  project: Record<string, any> | null;
  summary: {
    emails: number; campaigns: number; sessionsAttended: number;
    submissions: number; pagesViewed: number; lessonsCompleted: number;
  };
  timeline: TimelineEvent[];
}

const TONE_COLOR: Record<string, string> = {
  neutral: '#94a3b8', info: '#3b82f6', success: '#16a34a', warning: '#d97706', danger: '#dc2626',
};

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const mins = Math.floor(secs / 60), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  if (secs < 60) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(days / 365)}y ago`;
}

function fmt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="text-center px-2 py-2 rounded" style={{ background: '#f8fafc', minWidth: 74 }}>
    <div className="fw-bold" style={{ fontSize: '1.15rem', lineHeight: 1 }}>{value}</div>
    <div className="text-muted" style={{ fontSize: '0.68rem' }}>{label}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-1 d-flex" style={{ fontSize: '0.82rem' }}>
    <span className="text-muted" style={{ minWidth: 96 }}>{label}</span>
    <span className="fw-medium" style={{ wordBreak: 'break-word' }}>{children}</span>
  </div>
);

interface Props {
  enrollmentId: string;
  name: string;
  onClose: () => void;
  onViewAsStudent?: (id: string) => void;
  // Read-only mode (Support role): hides the Free Access toggle and the
  // View-as button — the drawer becomes a pure "student story", no controls
  // that change anything.
  readOnly?: boolean;
  // API base for the history fetch. Defaults to the accelerator (program-section)
  // path; the Support surface passes '/api/admin/students' so the same payload is
  // served from its own students-section-gated route.
  endpointBase?: string;
}

const PersonHistoryDrawer: React.FC<Props> = ({
  enrollmentId, name, onClose, onViewAsStudent,
  readOnly = false, endpointBase = '/api/admin/accelerator/enrollments',
}) => {
  const [data, setData] = useState<PersonHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Comped "Free Access" seat ($0, not staff). null until the profile loads.
  const [freeAccess, setFreeAccess] = useState<boolean | null>(null);
  const [savingFa, setSavingFa] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setError(false); setFreeAccess(null);
    api.get(`${endpointBase}/${enrollmentId}/history`)
      .then((res) => { if (live) { setData(res.data); setFreeAccess(!!res.data?.profile?.free_access); } })
      .catch(() => { if (live) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enrollmentId, endpointBase]);

  // Grant/revoke a comped seat for this enrollment (100% discount, normal student).
  const toggleFreeAccess = async () => {
    const next = !freeAccess;
    setSavingFa(true);
    try {
      if (next) await api.post(`/api/admin/accelerator/enrollments/${enrollmentId}/free-access`);
      else await api.delete(`/api/admin/accelerator/enrollments/${enrollmentId}/free-access`);
      setFreeAccess(next);
    } catch {
      /* leave the prior state on failure */
    } finally {
      setSavingFa(false);
    }
  };

  // Close on Escape.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = data?.profile;
  const a = data?.acquisition;

  return (
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1090 }} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`History for ${name}`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 94vw)',
          background: '#fff', zIndex: 1091, boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-3 border-bottom">
          <div className="d-flex justify-content-between align-items-start">
            <div style={{ minWidth: 0 }}>
              <h5 className="mb-0 text-truncate">{p?.full_name || name}</h5>
              <div className="text-muted small text-truncate">{p?.email || ''}</div>
            </div>
            <button className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="d-flex flex-wrap gap-1 mt-2 align-items-center">
            {p?.enrollment_type === 'explorer' && <span className="badge text-bg-secondary">Explorer</span>}
            {p?.payment_status && <span className={`badge ${p.payment_status === 'paid' ? 'text-bg-success' : 'text-bg-warning'}`}>{p.payment_status}</span>}
            {p?.portal_enabled && <span className="badge text-bg-info">Portal</span>}
            {freeAccess && <span className="badge text-bg-success" title="Comped seat — full access at $0">Free Access</span>}
            {p?.cohort && <span className="badge text-bg-light text-dark border">{p.cohort}</span>}
            {p?.total_paid > 0 && (
              <span className="badge text-bg-dark" title="Membership + deposits across every enrollment row for this email">
                ${Number(p?.total_paid).toLocaleString('en-US', { maximumFractionDigits: 2 })} collected
              </span>
            )}
            {!readOnly && (
              <>
                <button
                  className={`btn btn-sm ms-auto ${freeAccess ? 'btn-success' : 'btn-outline-success'}`}
                  disabled={freeAccess === null || savingFa}
                  onClick={toggleFreeAccess}
                  title="Comp this person's seat — full program access at $0 (a 100% discount; not a staff role)"
                >
                  <i className="ri-gift-line me-1" aria-hidden="true"></i>
                  {savingFa ? '…' : freeAccess ? 'Free Access ✓' : 'Grant Free Access'}
                </button>
                <button className="btn btn-outline-primary btn-sm" onClick={() => onViewAsStudent?.(enrollmentId)}>
                  <i className="ri-eye-line me-1" aria-hidden="true"></i>View as student
                </button>
              </>
            )}
          </div>
          {p?.enrollment_records > 1 && (
            <div className="small text-muted mt-1">
              <i className="ri-information-line me-1" aria-hidden="true"></i>
              {p?.enrollment_records} enrollment records share this email — payments below are combined across all of them.
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3" style={{ overflowY: 'auto' }}>
          {loading ? (
            <div className="text-center py-5"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
          ) : error || !data ? (
            <div className="text-center text-muted py-5">Could not load history.</div>
          ) : (
            <>
              {/* At a glance */}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Stat value={data.summary.emails} label="emails" />
                <Stat value={data.summary.campaigns} label="campaigns" />
                <Stat value={data.summary.pagesViewed} label="pages seen" />
                <Stat value={data.summary.sessionsAttended} label="attended" />
                <Stat value={data.summary.submissions} label="submissions" />
                <Stat value={data.summary.lessonsCompleted} label="lessons" />
              </div>

              {/* Profile */}
              <div className="mb-3">
                <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>Profile</div>
                {p?.company && p.company !== 'Prospect' && <Field label="Company">{p.company}</Field>}
                {p?.title && <Field label="Title">{p.title}</Field>}
                {p?.phone && <Field label="Phone">{p.phone}</Field>}
                <Field label="Registered">{fmt(p?.created_at)} <span className="text-muted">· {timeAgo(p?.created_at)}</span></Field>
                {p?.notes && <Field label="Notes">{p.notes}</Field>}
              </div>

              {/* Acquisition */}
              {a && (
                <div className="mb-3">
                  <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>Where they came from</div>
                  {a.source && <Field label="Source">{a.source}</Field>}
                  {a.page_url && <Field label="Page"><a href={a.page_url} target="_blank" rel="noopener noreferrer">{a.page_url}</a></Field>}
                  {a.utm_campaign && <Field label="Campaign">{a.utm_campaign}</Field>}
                  {a.utm_source && <Field label="UTM source">{a.utm_source}</Field>}
                  {a.form_type && <Field label="Form">{a.form_type}</Field>}
                  {(a.status || a.pipeline_stage) && <Field label="Pipeline">{[a.status, a.pipeline_stage].filter(Boolean).join(' · ')}</Field>}
                  {a.lead_score != null && <Field label="Lead score">{a.lead_score}{a.lead_temperature ? ` · ${a.lead_temperature}` : ''}</Field>}
                  {a.last_contacted_at && <Field label="Last contact">{fmt(a.last_contacted_at)}</Field>}
                </div>
              )}

              {/* Project */}
              {data.project && (
                <div className="mb-3">
                  <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>Project</div>
                  {data.project.name && <Field label="Name">{data.project.name}</Field>}
                  {data.project.stage && <Field label="Stage">{data.project.stage}</Field>}
                  {data.project.requirements_pct != null && <Field label="Requirements">{data.project.requirements_pct}%</Field>}
                  {data.project.github && <Field label="GitHub"><a href={data.project.github} target="_blank" rel="noopener noreferrer">repo</a></Field>}
                </div>
              )}

              {/* Curriculum */}
              {data.curriculum && (data.curriculum.goal || data.curriculum.identified_use_case) && (
                <div className="mb-3">
                  <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>Learning</div>
                  {data.curriculum.goal && <Field label="Goal">{data.curriculum.goal}</Field>}
                  {data.curriculum.identified_use_case && <Field label="Use case">{data.curriculum.identified_use_case}</Field>}
                  {data.curriculum.ai_maturity_level != null && <Field label="AI maturity">{data.curriculum.ai_maturity_level}</Field>}
                </div>
              )}

              {/* Timeline */}
              <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                History &amp; activity ({data.timeline.length})
              </div>
              {data.timeline.length === 0 ? (
                <div className="text-muted small">No recorded activity yet.</div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {data.timeline.map((ev, i) => (
                    <div key={i} className="d-flex" style={{ gap: 10 }}>
                      <div className="d-flex flex-column align-items-center" style={{ width: 20 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: TONE_COLOR[ev.tone] || '#94a3b8', marginTop: 5, flexShrink: 0 }} />
                        {i < data.timeline.length - 1 && <span style={{ flex: 1, width: 2, background: '#e5e7eb' }} />}
                      </div>
                      <div className="pb-3" style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem' }}>
                          <i className={`ri-${ev.icon} me-1`} style={{ color: TONE_COLOR[ev.tone] }} aria-hidden="true"></i>
                          <span className="fw-medium">{ev.title}</span>
                        </div>
                        {ev.detail && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{ev.detail}</div>}
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>{fmt(ev.at)} · {timeAgo(ev.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default PersonHistoryDrawer;
