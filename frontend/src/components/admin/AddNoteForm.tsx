import React, { useState } from 'react';
import api from '../../utils/api';

interface AddNoteFormProps {
  leadId: number;
  onNoteAdded: () => void;
}

function AddNoteForm({ leadId, onNoteAdded }: AddNoteFormProps) {
  const [body, setBody] = useState('');
  const [type, setType] = useState('note');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setSaving(true);
    try {
      await api.post(`/api/admin/leads/${leadId}/activities`, {
        type,
        subject: type === 'note' ? 'Note added' : type === 'call' ? 'Call logged' : 'Email logged',
        body: body.trim(),
      });
      setBody('');
      onNoteAdded();
    } catch (err) {
      console.error('Failed to add activity:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="d-flex gap-2 mb-2">
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="note">Note</option>
          <option value="call">Call</option>
          <option value="email_sent">Email</option>
          <option value="sms">SMS</option>
        </select>
      </div>
      <textarea
        className="form-control form-control-sm mb-2"
        rows={3}
        placeholder="Add a note or log an activity..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={saving || !body.trim()}
      >
        {saving ? 'Saving...' : 'Add Activity'}
      </button>
    </form>
  );
}

export default AddNoteForm;
