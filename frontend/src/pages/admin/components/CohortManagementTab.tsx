import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Quick-nav targets: tab key -> button label. Every value here must match a real
// TabKey on AdminAcceleratorPage.tsx, or the deep link silently lands on the
// default tab instead of the intended one.
const QUICK_NAV_TABS: { key: string; label: string }[] = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'participants', label: 'Participants' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'submissions', label: 'Submissions' },
  { key: 'readiness', label: 'Readiness' },
];

interface Course {
  id: string;
  name: string;
}

interface DayTime {
  start_time: string;
  end_time: string;
}

export interface ManagedCohort {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  core_day: string;
  core_time: string;
  optional_lab_day?: string;
  timezone?: string;
  max_seats: number;
  seats_taken: number;
  enrolled_count: number;
  status: 'open' | 'closed' | 'completed';
  cohort_type?: string;
  program?: { id: string; name: string } | null;
  settings_json?: { schedule?: { day_times?: Record<string, DayTime> } } | null;
}

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'info'> = {
  open: 'success',
  closed: 'neutral',
  completed: 'info',
};

/** 24h "HH:MM" -> "H:MM AM/PM", matching the format the backend's own
 *  deriveScheduleFromDays()/SessionControlTab.tsx already use for display. */
function formatTimeLabel(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}:00 ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** Best-effort extraction of a 24h "HH:MM" start time from a free-text legacy
 *  core_time string (e.g. "6:00 PM - 7:30 PM", "1:00-3:00 PM CT", "Evening") — used
 *  only to prefill the new picker for a cohort that hasn't been re-saved through it
 *  yet. Falls back to '13:00' (the same default parseCoreTime() uses server-side)
 *  when nothing recognizable is found; the admin can always adjust it. */
function guessTimeFromLegacyCoreTime(coreTime?: string): string {
  if (!coreTime) return '13:00';
  const match = coreTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '13:00';
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const mer = match[3]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Schedule summary for the list row — prefers the real per-day schedule; falls
 *  back to the legacy core_day/core_time/optional_lab_day display for any cohort
 *  that hasn't been saved through the new multi-day picker yet. */
function formatScheduleSummary(c: ManagedCohort): string {
  const dayTimes = c.settings_json?.schedule?.day_times;
  if (dayTimes && Object.keys(dayTimes).length) {
    return DAYS_OF_WEEK
      .filter((d) => dayTimes[d])
      .map((d) => `${d.slice(0, 3)} ${formatTimeLabel(dayTimes[d].start_time)}`)
      .join(', ');
  }
  if (!c.core_day) return '—';
  return `${c.core_day}${c.core_time ? ` · ${c.core_time}` : ''}${c.optional_lab_day ? ` (+ ${c.optional_lab_day} lab)` : ''}`;
}

const emptyForm = {
  name: '',
  description: '',
  start_date: '',
  timezone: 'America/Chicago',
  max_seats: 50,
  status: 'open' as 'open' | 'closed' | 'completed',
  cohort_type: 'accelerator',
  program_id: '',
};

interface Props {
  /** Called after a cohort is created, edited, or deleted so the parent page's
   *  (open-cohorts-only) selector dropdown can refresh too. */
  onCohortsChanged?: () => void;
}

/**
 * Cohorts management tab — the real CRUD surface the "Manage" entry point on the
 * admin dashboard used to promise but never delivered (it just routed to the
 * Accelerator page's Sessions tab with no way to add/edit a cohort). Lives before
 * the Sessions tab so an admin sets up the cohort (name, parent course, schedule,
 * capacity) before touching anything session-level.
 */
export default function CohortManagementTab({ onCohortsChanged }: Props) {
  const { showToast } = useToast();
  const [cohorts, setCohorts] = useState<ManagedCohort[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  // Multi-day, per-day-time schedule: day name -> 24h "HH:MM" start time. A day is
  // "selected" iff it has a key here.
  const [scheduleDays, setScheduleDays] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedCohort | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<{ dependents: any } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cohortsRes, coursesRes] = await Promise.all([
        api.get('/api/admin/cohorts'),
        api.get('/api/courses').catch(() => ({ data: [] })), // public course catalog; non-fatal if unavailable
      ]);
      setCohorts(cohortsRes.data.cohorts || []);
      setCourses((coursesRes.data || []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch {
      showToast('Failed to load cohorts', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setScheduleDays({});
    setShowModal(true);
  }

  function openEdit(c: ManagedCohort) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description || '',
      start_date: c.start_date,
      timezone: c.timezone || 'America/Chicago',
      max_seats: c.max_seats,
      status: c.status,
      cohort_type: c.cohort_type || 'accelerator',
      program_id: c.program?.id || '',
    });
    // Prefill the picker: prefer the real per-day schedule if this cohort was ever
    // saved through it; otherwise fall back to the legacy core_day/optional_lab_day
    // fields so editing an unrelated field (capacity, status) never forces a blind
    // re-entry of the whole schedule.
    const dayTimes = c.settings_json?.schedule?.day_times;
    if (dayTimes && Object.keys(dayTimes).length) {
      const next: Record<string, string> = {};
      for (const day of Object.keys(dayTimes)) next[day] = dayTimes[day].start_time;
      setScheduleDays(next);
    } else {
      const legacyTime = guessTimeFromLegacyCoreTime(c.core_time);
      const next: Record<string, string> = {};
      if (c.core_day) next[c.core_day] = legacyTime;
      if (c.optional_lab_day) next[c.optional_lab_day] = legacyTime;
      setScheduleDays(next);
    }
    setShowModal(true);
  }

  function toggleScheduleDay(day: string) {
    setScheduleDays((prev) => {
      if (prev[day] !== undefined) {
        const { [day]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [day]: '13:00' };
    });
  }

  function setScheduleDayTime(day: string, time: string) {
    setScheduleDays((prev) => ({ ...prev, [day]: time }));
  }

  async function handleSave() {
    const schedule_days = DAYS_OF_WEEK.filter((d) => scheduleDays[d] !== undefined)
      .map((d) => ({ day: d, time: scheduleDays[d] }));
    if (!form.name.trim() || !form.start_date || !schedule_days.length) {
      showToast('Name, start date, and at least one scheduled day are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        description: form.description || undefined,
        start_date: form.start_date,
        schedule_days,
        timezone: form.timezone,
        max_seats: Number(form.max_seats) || undefined,
        status: form.status,
        cohort_type: form.cohort_type || undefined,
        program_id: form.program_id || undefined,
      };
      if (editingId) {
        await api.patch(`/api/admin/cohorts/${editingId}`, payload);
        showToast('Cohort updated', 'success');
      } else {
        await api.post('/api/admin/cohorts', payload);
        showToast('Cohort created', 'success');
      }
      setShowModal(false);
      await load();
      onCohortsChanged?.();
    } catch (err: any) {
      const details = err?.response?.data?.details;
      const message = Array.isArray(details) && details.length
        ? details.map((d: any) => `${d.field}: ${d.message}`).join('; ')
        : err?.response?.data?.error || 'Failed to save cohort';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(force = false) {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/cohorts/${deleteTarget.id}${force ? '?force=true' : ''}`);
      showToast('Cohort deleted', 'success');
      setDeleteTarget(null);
      setDeleteBlocked(null);
      await load();
      onCohortsChanged?.();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setDeleteBlocked({ dependents: err.response.data.dependents });
      } else {
        showToast(err?.response?.data?.error || 'Failed to delete cohort', 'error');
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <SectionCard
        title={`Cohorts (${cohorts.length})`}
        subtitle="Create and manage cohorts — the scheduled batches students enroll into within a Course."
        padded={false}
        actions={
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="ri-add-line" aria-hidden="true" /> New Cohort
          </button>
        }
      >
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th className="small fw-medium">Name</th>
                <th className="small fw-medium">Course</th>
                <th className="small fw-medium">Start</th>
                <th className="small fw-medium">Schedule</th>
                <th className="small fw-medium text-center">Enrolled</th>
                <th className="small fw-medium text-center">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.id}>
                  <td className="small">{c.name}</td>
                  <td className="small text-muted">{c.program?.name || 'No parent course set'}</td>
                  <td className="small">{c.start_date}</td>
                  <td className="small">{formatScheduleSummary(c)}</td>
                  <td className="small text-center">{c.enrolled_count}/{c.max_seats}</td>
                  <td className="small text-center">
                    <StatusBadge label={c.status} tone={STATUS_TONE[c.status] || 'neutral'} />
                  </td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm me-1" role="group" aria-label={`Jump to ${c.name}`}>
                      {QUICK_NAV_TABS.map((t) => (
                        <Link
                          key={t.key}
                          to={`/admin/accelerator?tab=${t.key}&cohort=${c.id}`}
                          className="btn btn-outline-secondary"
                          title={`${t.label} for ${c.name}`}
                        >
                          {t.label}
                        </Link>
                      ))}
                    </div>
                    <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(c)}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => { setDeleteTarget(c); setDeleteBlocked(null); }}>Delete</button>
                  </td>
                </tr>
              ))}
              {cohorts.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted small py-4">No cohorts yet — click "New Cohort" to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Create / Edit Modal */}
      {showModal && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{editingId ? 'Edit Cohort' : 'New Cohort'}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Name</label>
                    <input type="text" className="form-control form-control-sm" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Cohort - November 2026" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Parent Course</label>
                    <select className="form-select form-select-sm" value={form.program_id}
                      onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
                      <option value="">No parent course</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Description</label>
                    <textarea className="form-control form-control-sm" rows={2} value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Start Date</label>
                    <input type="date" className="form-control form-control-sm" value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Class Days &amp; Times</label>
                    <div className="border rounded p-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <div key={day} className="d-flex align-items-center gap-2 py-1">
                          <div className="form-check mb-0" style={{ width: 130 }}>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              id={`day-${day}`}
                              checked={scheduleDays[day] !== undefined}
                              onChange={() => toggleScheduleDay(day)}
                            />
                            <label className="form-check-label small" htmlFor={`day-${day}`}>{day}</label>
                          </div>
                          {scheduleDays[day] !== undefined && (
                            <input
                              type="time"
                              className="form-control form-control-sm"
                              style={{ maxWidth: 140 }}
                              value={scheduleDays[day]}
                              onChange={(e) => setScheduleDayTime(day, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="form-text">Select every day this cohort meets and set that day's own time — e.g. Tuesday 6:00 PM and Saturday 10:00 AM.</div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Timezone</label>
                      <input type="text" className="form-control form-control-sm" value={form.timezone}
                        onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">Max Seats</label>
                      <input type="number" className="form-control form-control-sm" value={form.max_seats}
                        onChange={(e) => setForm({ ...form, max_seats: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Status</label>
                      <select className="form-select form-select-sm" value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">Cohort Type</label>
                      <input type="text" className="form-control form-control-sm" value={form.cohort_type}
                        onChange={(e) => setForm({ ...form, cohort_type: e.target.value })} placeholder="accelerator" />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirm — blocked case surfaces dependent counts and a force option */}
      <ConfirmModal
        show={!!deleteTarget && !deleteBlocked}
        title="Delete Cohort"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? This also removes any enrollments and sessions still attached to it.` : ''}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={() => handleDelete(false)}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        show={!!deleteTarget && !!deleteBlocked}
        title="Cohort Has Real Enrollments"
        message={deleteBlocked
          ? `This cohort has ${deleteBlocked.dependents.unsafeEnrollmentCount} non-withdrawn, paid enrollment(s) and ${deleteBlocked.dependents.liveSessionCount} session(s). Deleting will cascade-delete all of it. Force delete anyway?`
          : ''}
        confirmLabel="Force Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={() => handleDelete(true)}
        onCancel={() => { setDeleteTarget(null); setDeleteBlocked(null); }}
      />
    </>
  );
}
