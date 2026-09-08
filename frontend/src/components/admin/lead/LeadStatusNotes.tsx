import React, { useState } from 'react';
import api from '../../../utils/api';
import { STATUS_VALUES } from '../../../constants';

/**
 * Status and notes editing, extracted from AdminLeadDetailPage.
 *
 * Extracted rather than reimplemented for the same reason as the pipeline bar:
 * the 360 profile is meant to replace that page, and two implementations of a
 * WRITE path drift. One of them then keeps writing while nobody is looking at
 * it.
 *
 * Both pages render this, so a lead's status is changed in exactly one place.
 */

interface Props {
  leadId: number;
  initialStatus: string | null;
  initialNotes: string | null;
  onSaved?: () => void;
}

export default function LeadStatusNotes({ leadId, initialStatus, initialNotes, onSaved }: Props) {
  const [status, setStatus] = useState(initialStatus ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.patch(`/api/admin/leads/${leadId}`, { status, notes });
      setMessage({ text: 'Saved', ok: true });
      onSaved?.();
    } catch {
      // Named as a failure rather than left ambiguous: someone who typed notes
      // and saw nothing happen will assume they were kept.
      setMessage({ text: 'Could not save. Your changes are not stored.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-3">
        <label className="form-label small text-muted" htmlFor={`lead-status-${leadId}`}>Status</label>
        <select
          id={`lead-status-${leadId}`}
          className="form-select form-select-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {(STATUS_VALUES as string[]).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label small text-muted" htmlFor={`lead-notes-${leadId}`}>Notes</label>
        <textarea
          id={`lead-notes-${leadId}`}
          className="form-control form-control-sm"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this person…"
        />
      </div>

      <div className="d-flex align-items-center gap-3">
        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {message && (
          <span className={`small ${message.ok ? 'text-success' : 'text-danger'}`}>{message.text}</span>
        )}
      </div>
    </>
  );
}
