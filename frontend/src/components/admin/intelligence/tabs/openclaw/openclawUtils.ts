/**
 * Shared constants and helper functions for the OpenClaw UI.
 * Extracted from OpenclawTab.tsx for reuse across sub-tabs.
 */

// ── Platform Colors ──────────────────────────────────────────────────────────

export const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500',
  hackernews: '#FF6600',
  linkedin: '#0A66C2',
  devto: '#0A0A0A',
  quora: '#B92B27',
  medium: '#00AB6C',
  hashnode: '#2962FF',
  discourse: '#FFC107',
  twitter: '#1DA1F2',
  bluesky: '#0085FF',
  youtube: '#FF0000',
  producthunt: '#DA552F',
  facebook_groups: '#1877F2',
  linkedin_comments: '#0A66C2',
};

// ── Platform Strategy Classification ─────────────────────────────────────────

export const PLATFORM_STRATEGY: Record<string, string> = {
  reddit: 'PASSIVE_SIGNAL',
  quora: 'PASSIVE_SIGNAL',
  hackernews: 'PASSIVE_SIGNAL',
  facebook_groups: 'PASSIVE_SIGNAL',
  linkedin_comments: 'PASSIVE_SIGNAL',
  twitter: 'HYBRID_ENGAGEMENT',
  bluesky: 'HYBRID_ENGAGEMENT',
  devto: 'HYBRID_ENGAGEMENT',
  hashnode: 'HYBRID_ENGAGEMENT',
  discourse: 'HYBRID_ENGAGEMENT',
  producthunt: 'HYBRID_ENGAGEMENT',
  linkedin: 'AUTHORITY_BROADCAST',
  medium: 'AUTHORITY_BROADCAST',
  youtube: 'AUTHORITY_BROADCAST',
};

export const STRATEGY_BADGES: Record<string, { label: string; bg: string }> = {
  PASSIVE_SIGNAL: { label: 'Passive', bg: '#6c757d' },
  HYBRID_ENGAGEMENT: { label: 'Hybrid', bg: '#0d6efd' },
  AUTHORITY_BROADCAST: { label: 'Authority', bg: '#198754' },
};

// ── Status / Result Badges ───────────────────────────────────────────────────

export const STATUS_BADGES: Record<string, string> = {
  draft: 'warning',
  approved: 'info',
  rejected: 'danger',
  pending_review: 'warning',
  ready_to_post: 'primary',
  ready_for_manual_post: 'warning',
  posted: 'success',
  failed: 'danger',
  removed: 'secondary',
};

export const RESULT_BADGES: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
  flagged: 'info',
};

// ── Intent / Seniority Helpers ───────────────────────────────────────────────

export const INTENT_COLOR = (score: number | null): string => {
  if (!score) return 'secondary';
  if (score >= 0.7) return 'danger';
  if (score >= 0.4) return 'warning';
  return 'secondary';
};

export const SENIORITY_LABEL: Record<string, string> = {
  c_level: 'C-Level',
  vp: 'VP',
  director: 'Director',
  manager: 'Manager',
  ic: 'IC',
  unknown: '\u2014',
};

// ── Time / Duration Formatters ───────────────────────────────────────────────

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function formatMs(ms: number | null): string {
  if (!ms) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
