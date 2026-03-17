import React from 'react';

interface SectionStepLabelProps {
  stepNumber: number;
  totalSteps: number;
  label: string;
  status: 'completed' | 'active' | 'upcoming';
}

export default function SectionStepLabel({ stepNumber, totalSteps, label, status }: SectionStepLabelProps) {
  const color = status === 'completed'
    ? 'var(--color-accent)'
    : status === 'active'
      ? 'var(--color-primary)'
      : 'var(--color-text-light)';

  const icon = status === 'completed'
    ? 'bi-check-circle-fill'
    : status === 'active'
      ? 'bi-arrow-right-circle-fill'
      : '';

  return (
    <div className="mb-2" style={{ color, fontSize: 12, fontWeight: 600 }}>
      {icon && <i className={`bi ${icon} me-1`} style={{ fontSize: 11 }}></i>}
      Step {stepNumber} of {totalSteps} — {label}
    </div>
  );
}
