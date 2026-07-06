import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../ui/ToastProvider';

interface KbCourse { id: string; name: string; }
interface KbCohort {
  id: string; course_id: string; name: string; cohort_number: number;
  open_house_date: string | null; open_house_url: string | null; start_date: string | null; end_date: string | null;
  expo_date: string | null; price_annual: number | null; price_monthly: number | null;
  seats_total: number | null; seats_remaining: number | null;
  enrollment_url: string | null; waitlist_url: string | null; is_active: boolean;
}

interface Props {
  cohort: KbCohort | null;
  defaultCourseId?: string;
  courses: KbCourse[];
  hasActiveCohortForCourse: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  course_id: string; name: string; cohort_number: string; open_house_date: string; open_house_url: string;
  start_date: string; end_date: string; expo_date: string; price_annual: string; price_monthly: string;
  seats_total: string; seats_remaining: string; enrollment_url: string; waitlist_url: string; is_active: boolean;
}

const emptyForm = (defaultCourseId?: string): FormState => ({
  course_id: defaultCourseId ?? '', name: '', cohort_number: '', open_house_date: '', open_house_url: '',
  start_date: '', end_date: '', expo_date: '', price_annual: '', price_monthly: '',
  seats_total: '', seats_remaining: '', enrollment_url: '', waitlist_url: '', is_active: false,
});

const CohortEditModal: React.FC<Props> = ({ cohort, defaultCourseId, courses, hasActiveCohortForCourse, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm(defaultCourseId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(cohort ? {
      course_id: cohort.course_id,
      name: cohort.name,
      cohort_number: String(cohort.cohort_number),
      open_house_date: cohort.open_house_date ?? '',
      open_house_url: cohort.open_house_url ?? '',
      start_date: cohort.start_date ?? '',
      end_date: cohort.end_date ?? '',
      expo_date: cohort.expo_date ?? '',
      price_annual: cohort.price_annual != null ? String(cohort.price_annual) : '',
      price_monthly: cohort.price_monthly != null ? String(cohort.price_monthly) : '',
      seats_total: cohort.seats_total != null ? String(cohort.seats_total) : '',
      seats_remaining: cohort.seats_remaining != null ? String(cohort.seats_remaining) : '',
      enrollment_url: cohort.enrollment_url ?? '',
      waitlist_url: cohort.waitlist_url ?? '',
      is_active: cohort.is_active,
    } : emptyForm(defaultCourseId));
  }, [cohort, defaultCourseId]);

  const canSave = form.course_id && form.name.trim() && form.cohort_number.trim();

  const toIntOrUndefined = (v: string) => (v.trim() === '' ? undefined : parseInt(v, 10));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        course_id: form.course_id,
        name: form.name,
        cohort_number: parseInt(form.cohort_number, 10),
        open_house_date: form.open_house_date || undefined,
        open_house_url: form.open_house_url || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        expo_date: form.expo_date || undefined,
        price_annual: toIntOrUndefined(form.price_annual),
        price_monthly: toIntOrUndefined(form.price_monthly),
        seats_total: toIntOrUndefined(form.seats_total),
        seats_remaining: toIntOrUndefined(form.seats_remaining),
        enrollment_url: form.enrollment_url || undefined,
        waitlist_url: form.waitlist_url || undefined,
        is_active: form.is_active,
      };
      if (cohort) {
        await api.put(`/api/admin/kb/cohorts/${cohort.id}`, payload);
        showToast('Cohort updated.', 'success');
      } else {
        await api.post('/api/admin/kb/cohorts', payload);
        showToast('Cohort created.', 'success');
      }
      onSaved();
      onClose();
    } catch {
      showToast('Failed to save cohort.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{cohort ? 'Edit Cohort' : 'Add Cohort'}</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Course</label>
                  <select className="form-select form-select-sm" value={form.course_id} disabled={!!cohort}
                    onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
                    <option value="">Select a course...</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Cohort Name</label>
                  <input type="text" className="form-control form-control-sm" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cohort 2" />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Cohort Number</label>
                  <input type="number" className="form-control form-control-sm" value={form.cohort_number}
                    onChange={(e) => setForm({ ...form, cohort_number: e.target.value })} placeholder="2" />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Open House Date</label>
                  <input type="text" className="form-control form-control-sm" value={form.open_house_date}
                    onChange={(e) => setForm({ ...form, open_house_date: e.target.value })} placeholder="Thursday, July 16, 2026" />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Open House URL</label>
                  <input type="text" className="form-control form-control-sm" value={form.open_house_url}
                    onChange={(e) => setForm({ ...form, open_house_url: e.target.value })} placeholder="enterprise.colaberry.ai/open-house" />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Start Date</label>
                  <input type="text" className="form-control form-control-sm" value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })} placeholder="Thursday, July 23, 2026" />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">End Date</label>
                  <input type="text" className="form-control form-control-sm" value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })} placeholder="October 15, 2026" />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Expo / Demo Date</label>
                  <input type="text" className="form-control form-control-sm" value={form.expo_date}
                    onChange={(e) => setForm({ ...form, expo_date: e.target.value })} placeholder="October 2026" />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Annual Price ($/mo)</label>
                  <input type="number" className="form-control form-control-sm" value={form.price_annual}
                    onChange={(e) => setForm({ ...form, price_annual: e.target.value })} placeholder="149" />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Monthly Price ($/mo)</label>
                  <input type="number" className="form-control form-control-sm" value={form.price_monthly}
                    onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} placeholder="199" />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Total Seats</label>
                  <input type="number" className="form-control form-control-sm" value={form.seats_total}
                    onChange={(e) => setForm({ ...form, seats_total: e.target.value })} placeholder="40" />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Remaining Seats</label>
                  <input type="number" className="form-control form-control-sm" value={form.seats_remaining}
                    onChange={(e) => setForm({ ...form, seats_remaining: e.target.value })} placeholder="32" />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Enrollment URL</label>
                  <input type="text" className="form-control form-control-sm" value={form.enrollment_url}
                    onChange={(e) => setForm({ ...form, enrollment_url: e.target.value })} placeholder="enterprise.colaberry.ai" />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Waitlist URL</label>
                  <input type="text" className="form-control form-control-sm" value={form.waitlist_url}
                    onChange={(e) => setForm({ ...form, waitlist_url: e.target.value })} placeholder="enterprise.colaberry.ai/waitlist" />
                </div>
              </div>

              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" role="switch" id="cohortIsActive"
                  checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <label className="form-check-label small" htmlFor="cohortIsActive">Set as Active</label>
              </div>
              {form.is_active && hasActiveCohortForCourse && (!cohort || !cohort.is_active) && (
                <div className="alert alert-warning small py-2 mt-2 mb-0">
                  This course already has an active cohort. Activating this one will automatically deactivate it.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={saving || !canSave} onClick={handleSubmit}>
                {saving ? 'Saving…' : cohort ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CohortEditModal;
