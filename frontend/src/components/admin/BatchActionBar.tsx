import React, { useState } from 'react';
import api from '../../utils/api';

const PIPELINE_STAGES = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'lost', label: 'Lost' },
];

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'lost', label: 'Lost' },
];

interface BatchActionBarProps {
  selectedIds: number[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

function BatchActionBar({ selectedIds, onClearSelection, onActionComplete }: BatchActionBarProps) {
  const [action, setAction] = useState('');
  const [value, setValue] = useState('');
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!action || !value || selectedIds.length === 0) return;

    setApplying(true);
    try {
      const updates: Record<string, string> = {};
      if (action === 'pipeline_stage') updates.pipeline_stage = value;
      if (action === 'status') updates.status = value;

      await api.patch('/api/admin/leads/batch', { ids: selectedIds, ...updates });
      onClearSelection();
      onActionComplete();
    } catch (err) {
      console.error('Batch update failed:', err);
    } finally {
      setApplying(false);
      setAction('');
      setValue('');
    }
  };

  const options = action === 'pipeline_stage' ? PIPELINE_STAGES : action === 'status' ? STATUS_OPTIONS : [];

  return (
    <div className="alert alert-primary d-flex align-items-center justify-content-between py-2 mb-3">
      <div className="d-flex align-items-center gap-2">
        <span className="badge bg-primary">{selectedIds.length} selected</span>
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={action}
          onChange={(e) => { setAction(e.target.value); setValue(''); }}
        >
          <option value="">Select Action...</option>
          <option value="pipeline_stage">Change Pipeline Stage</option>
          <option value="status">Change Status</option>
        </select>
        {action && (
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Select value...</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        <button
          className="btn btn-primary btn-sm"
          disabled={!action || !value || applying}
          onClick={handleApply}
        >
          {applying ? 'Applying...' : 'Apply'}
        </button>
      </div>
      <button className="btn btn-outline-secondary btn-sm" onClick={onClearSelection}>
        Clear Selection
      </button>
    </div>
  );
}

export default BatchActionBar;
