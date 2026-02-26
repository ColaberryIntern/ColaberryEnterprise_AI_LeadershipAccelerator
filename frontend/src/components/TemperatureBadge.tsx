import React from 'react';

const TEMP_CONFIG: Record<string, { bg: string; label: string }> = {
  cold: { bg: 'bg-primary', label: 'Cold' },
  cool: { bg: 'bg-info', label: 'Cool' },
  warm: { bg: 'bg-warning text-dark', label: 'Warm' },
  hot: { bg: 'bg-danger', label: 'Hot' },
  qualified: { bg: 'bg-success', label: 'Qualified' },
};

interface Props {
  temperature: string | null | undefined;
  size?: 'sm' | 'md';
}

export default function TemperatureBadge({ temperature, size = 'sm' }: Props) {
  const temp = temperature || 'cold';
  const config = TEMP_CONFIG[temp] || TEMP_CONFIG.cold;
  const sizeClass = size === 'md' ? 'fs-6' : '';
  return (
    <span className={`badge ${config.bg} ${sizeClass}`}>
      {config.label}
    </span>
  );
}
