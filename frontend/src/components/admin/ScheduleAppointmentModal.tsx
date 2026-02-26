import React, { useState } from 'react';
import api from '../../utils/api';
import Modal from '../ui/Modal';
import { APPOINTMENT_TYPES } from '../../constants';

interface ScheduleAppointmentModalProps {
  leadId: number;
  leadName: string;
  show: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function ScheduleAppointmentModal({ leadId, leadName, show, onClose, onCreated }: ScheduleAppointmentModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('strategy_call');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !scheduledAt) {
      setError('Title and date/time are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.post('/api/admin/appointments', {
        lead_id: leadId,
        title,
        type,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        description,
      });
      setTitle('');
      setType('strategy_call');
      setScheduledAt('');
      setDurationMinutes(30);
      setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create appointment:', err);
      setError('Failed to create appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Schedule Appointment"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="schedule-apt-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Scheduling...' : 'Schedule'}
          </button>
        </>
      }
    >
      <form id="schedule-apt-form" onSubmit={handleSubmit}>
        <div className="mb-2">
          <span className="text-muted small">Lead: </span>
          <span className="fw-medium">{leadName}</span>
        </div>

        {error && <div className="alert alert-danger py-2 small">{error}</div>}

        <div className="mb-3">
          <label htmlFor="apt-title" className="form-label small">Title</label>
          <input
            id="apt-title"
            type="text"
            className="form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Strategy Call with John"
          />
        </div>

        <div className="mb-3">
          <label htmlFor="apt-type" className="form-label small">Type</label>
          <select
            id="apt-type"
            className="form-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {APPOINTMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="row mb-3">
          <div className="col-8">
            <label htmlFor="apt-datetime" className="form-label small">Date & Time</label>
            <input
              id="apt-datetime"
              type="datetime-local"
              className="form-control"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="col-4">
            <label htmlFor="apt-duration" className="form-label small">Duration (min)</label>
            <input
              id="apt-duration"
              type="number"
              className="form-control"
              value={durationMinutes}
              min={15}
              max={120}
              step={15}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="apt-desc" className="form-label small">Description (optional)</label>
          <textarea
            id="apt-desc"
            className="form-control"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes about this appointment..."
          />
        </div>
      </form>
    </Modal>
  );
}

export default ScheduleAppointmentModal;
