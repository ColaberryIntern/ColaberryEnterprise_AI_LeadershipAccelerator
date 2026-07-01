import React from 'react';

interface Props {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <div className="text-center py-5">
      {icon && (
        <div className="mb-3" style={{ fontSize: '2.5rem', opacity: 0.5 }} aria-hidden="true">
          {icon}
        </div>
      )}
      <h5 className="text-muted fw-semibold mb-2">{title}</h5>
      {description && <p className="text-muted small mb-3">{description}</p>}
      {actionLabel && onAction && (
        <button className="btn btn-sm" style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
