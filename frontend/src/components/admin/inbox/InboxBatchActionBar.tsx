import React, { useState } from 'react';

interface InboxBatchActionBarProps {
  selectedCount: number;
  onAction: (action: string) => void;
}

const ACTIONS = [
  { value: 'INBOX', label: 'Move to Inbox' },
  { value: 'AUTOMATION', label: 'Move to Automation' },
  { value: 'DISMISS', label: 'Dismiss' },
];

export default function InboxBatchActionBar({ selectedCount, onAction }: InboxBatchActionBarProps) {
  const [action, setAction] = useState('');

  if (selectedCount === 0) return null;

  const handleApply = () => {
    if (action) {
      onAction(action);
      setAction('');
    }
  };

  return (
    <div className="alert alert-primary d-flex align-items-center justify-content-between py-2 mb-3">
      <div className="d-flex align-items-center gap-2">
        <span className="badge bg-primary">{selectedCount} selected</span>
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">Select Action...</option>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <button
          className="btn btn-primary btn-sm"
          disabled={!action}
          onClick={handleApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
