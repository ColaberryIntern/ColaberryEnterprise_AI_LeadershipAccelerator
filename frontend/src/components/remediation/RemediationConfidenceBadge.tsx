import React from 'react';

export interface RemediationConfidenceBadgeProps {
  confidence: number;
  tier: 'low' | 'moderate' | 'high';
  reasons?: string[];
  size?: 'sm' | 'md';
}

const TIER_BG: Record<string, string> = { high: '#dcfce7', moderate: '#fef3c7', low: '#fee2e2' };
const TIER_FG: Record<string, string> = { high: '#15803d', moderate: '#92400e', low: '#b91c1c' };

export function RemediationConfidenceBadge({ confidence, tier, reasons, size = 'sm' }: RemediationConfidenceBadgeProps) {
  const fontSize = size === 'sm' ? 9 : 11;
  const padding = size === 'sm' ? '2px 6px' : '3px 9px';
  const title = reasons && reasons.length > 0 ? reasons.join(' ') : `Confidence ${confidence}/100 (${tier})`;
  return (
    <span
      className="badge d-inline-flex align-items-center gap-1"
      title={title}
      style={{ background: TIER_BG[tier], color: TIER_FG[tier], fontSize, padding, fontWeight: 600 }}
    >
      <i className="bi bi-shield-check" style={{ fontSize }}></i>
      {confidence}/100
    </span>
  );
}
