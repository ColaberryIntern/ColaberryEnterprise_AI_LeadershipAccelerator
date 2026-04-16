import React from 'react';

type ClassificationState = 'INBOX' | 'AUTOMATION' | 'SILENT_HOLD' | 'ASK_USER';

interface ClassificationBadgeProps {
  state: ClassificationState;
}

const STATE_CONFIG: Record<ClassificationState, { color: string; label: string }> = {
  INBOX: { color: 'success', label: 'Inbox' },
  AUTOMATION: { color: 'secondary', label: 'Automation' },
  SILENT_HOLD: { color: 'warning', label: 'Silent Hold' },
  ASK_USER: { color: 'info', label: 'Ask User' },
};

export default function ClassificationBadge({ state }: ClassificationBadgeProps) {
  const config = STATE_CONFIG[state] || { color: 'secondary', label: state };
  return <span className={`badge bg-${config.color}`}>{config.label}</span>;
}
