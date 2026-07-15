import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../ui/ToastProvider';

interface Person {
  id: string; name: string; email: string | null; phone: string | null;
  work_hours: string | null; time_zone: string | null; areas: string[];
  shift_note: string | null; calendar_link: string | null;
}

interface Props {
  person: Person | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string; email: string; phone: string; work_hours: string; time_zone: string;
  calendar_link: string; areas: string; shift_note: string;
}

const EMPTY_FORM: FormState = { name: '', email: '', phone: '', work_hours: '', time_zone: '', calendar_link: '', areas: '', shift_note: '' };

const PersonEditModal: React.FC<Props> = ({ person, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(person ? {
      name: person.name,
      email: person.email ?? '',
      phone: person.phone ?? '',
      work_hours: person.work_hours ?? '',
      time_zone: person.time_zone ?? '',
      calendar_link: person.calendar_link ?? '',
      areas: (person.areas ?? []).join(', '),
      shift_note: person.shift_note ?? '',
    } : EMPTY_FORM);
  }, [person]);

  const canSave = form.name.trim().length > 0;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        work_hours: form.work_hours || undefined,
        time_zone: form.time_zone || undefined,
        calendar_link: form.calendar_link || undefined,
        areas: form.areas.split(',').map((a) => a.trim()).filter(Boolean),
        shift_note: form.shift_note || undefined,
      };
      if (person) {
        await api.put(`/api/admin/kb/persons/${person.id}`, payload);
        showToast('Person updated.', 'success');
      } else {
        await api.post('/api/admin/kb/persons', payload);
        showToast('Person created.', 'success');
      }
      onSaved();
      onClose();
    } catch {
      showToast('Failed to save person.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{person ? 'Edit Responsible Person' : 'Add Responsible Person'}</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="mb-3">
                <label className="form-label small fw-medium">Name</label>
                <input type="text" className="form-control form-control-sm" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Email</label>
                  <input type="email" className="form-control form-control-sm" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Phone</label>
                  <input type="text" className="form-control form-control-sm" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Work Hours</label>
                  <input type="text" className="form-control form-control-sm" value={form.work_hours}
                    onChange={(e) => setForm({ ...form, work_hours: e.target.value })} placeholder="Mon–Fri, 9AM–5PM" />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Time Zone</label>
                  <input type="text" className="form-control form-control-sm" value={form.time_zone}
                    onChange={(e) => setForm({ ...form, time_zone: e.target.value })} placeholder="CST (UTC−6)" />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-medium">Calendar Link</label>
                <input type="text" className="form-control form-control-sm" value={form.calendar_link}
                  onChange={(e) => setForm({ ...form, calendar_link: e.target.value })} />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-medium">Areas (comma-separated)</label>
                <input type="text" className="form-control form-control-sm" value={form.areas}
                  onChange={(e) => setForm({ ...form, areas: e.target.value })} placeholder="Admissions, Customer Support" />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-medium">Shift Note</label>
                <input type="text" className="form-control form-control-sm" value={form.shift_note}
                  onChange={(e) => setForm({ ...form, shift_note: e.target.value })} placeholder="Early shift" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={saving || !canSave} onClick={handleSubmit}>
                {saving ? 'Saving…' : person ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PersonEditModal;
