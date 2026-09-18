import React from 'react';
import { AssessmentRecommendation, ProjectStanding, RequirementStatus } from '../../../services/adminInternshipApi';

/**
 * Shared badges for the internship review surface. Extracted from the old
 * 1000-line page so the tab components can share them. Every one of these is
 * advice or a fact — never a decision.
 */

const pill: React.CSSProperties = { color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 10px' };

/** The AI's suggested posture. Advice, not a decision. */
export const RecommendationBadge: React.FC<{ value: AssessmentRecommendation }> = ({ value }) => {
  const map: Record<AssessmentRecommendation, { label: string; bg: string }> = {
    approve: { label: 'Suggests: Approve', bg: '#2e7d5b' },
    approve_with_conditions: { label: 'Suggests: Approve with conditions', bg: '#1f7a8c' },
    concerns: { label: 'Suggests: Concerns', bg: '#b23a3a' },
    follow_up: { label: 'Suggests: Follow up', bg: '#a8690f' },
    not_ready: { label: 'Suggests: Not ready', bg: '#6b7280' },
  };
  const m = map[value];
  return <span className="badge" style={{ ...pill, background: m.bg }}>{m.label}</span>;
};

/** Standing pill for the AI project review — how the build is tracking. */
export const StandingBadge: React.FC<{ value: ProjectStanding }> = ({ value }) => {
  const map: Record<ProjectStanding, { label: string; bg: string }> = {
    on_track: { label: 'On track', bg: '#2e7d5b' },
    needs_attention: { label: 'Needs attention', bg: '#a8690f' },
    stalled: { label: 'Stalled', bg: '#b23a3a' },
    not_started: { label: 'Not started', bg: '#6b7280' },
    unknown: { label: 'Unknown', bg: '#6b7280' },
  };
  const m = map[value];
  return <span className="badge" style={{ ...pill, background: m.bg }}>{m.label}</span>;
};

/** Green / red / amber for a requirement's status. */
export const RequirementDot: React.FC<{ status: RequirementStatus }> = ({ status }) => {
  const color = status === 'met' ? '#2e7d5b' : status === 'not_met' ? '#b23a3a' : '#a8690f';
  const label = status === 'met' ? 'Met' : status === 'not_met' ? 'Not met' : 'Unclear';
  return (
    <span
      aria-label={label}
      title={label}
      style={{ flex: 'none', width: 11, height: 11, borderRadius: '50%', background: color, marginTop: 4, display: 'inline-block' }}
    />
  );
};
