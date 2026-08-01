import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Course {
  id: string;
  name: string;
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
}

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'info'> = {
  open: 'success',
  closed: 'neutral',
  completed: 'info',
};

const emptyForm = {
  name: '',
  description: '',
  start_date: '',
  core_day: 'Monday',
  core_time: 'Evening',
  optional_lab_day: '',
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
    setShowModal(true);
  }

  function openEdit(c: ManagedCohort) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description || '',
      start_date: c.start_date,
      core_day: c.core_day,
      core_time: c.core_time,
      optional_lab_day: c.optional_lab_day || '',
      timezone: c.timezone || 'America/Chicago',
      max_seats: c.max_seats,
      status: c.status,
      cohort_type: c.cohort_type || 'accelerator',
      program_id: c.program?.id || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.start_date || !form.core_day) {
      showToast('Name, start date, and core day are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        description: form.description || undefined,
        start_date: form.start_date,
        core_day: form.core_day,
        core_time: form.core_time,
        optional_lab_day: form.optional_lab_day || undefined,
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
                  <td className="small">
                    {c.core_day}{c.core_time ? ` · ${c.core_time}` : ''}
                    {c.optional_lab_day ? ` (+ ${c.optional_lab_day} lab)` : ''}
                  </td>
                  <td className="small text-center">{c.enrolled_count}/{c.max_seats}</td>
                  <td className="small text-center">
                    <StatusBadge label={c.status} tone={STATUS_TONE[c.status] || 'neutral'} />
                  </td>
                  <td className="text-end">
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
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Start Date</label>
                      <input type="date" className="form-control form-control-sm" value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">Core Day</label>
                      <select className="form-select form-select-sm" value={form.core_day}
                        onChange={(e) => setForm({ ...form, core_day: e.target.value })}>
                        {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Core Time</label>
                      <input type="text" className="form-control form-control-sm" value={form.core_time}
                        onChange={(e) => setForm({ ...form, core_time: e.target.value })} placeholder="e.g. Evening" />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">Optional Lab Day</label>
                      <select className="form-select form-select-sm" value={form.optional_lab_day}
                        onChange={(e) => setForm({ ...form, optional_lab_day: e.target.value })}>
                        <option value="">None</option>
                        {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
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
