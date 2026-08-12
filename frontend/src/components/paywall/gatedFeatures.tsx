import React from 'react';

export type GatedFeatureKey = 'classroom' | 'projects' | 'cert-prep';

export interface GatedFeatureCopy {
  key: GatedFeatureKey;
  eyebrow: string;
  title: string;
  subtitle: string;
  benefits: string[];
  ctaLabel: string;
  ctaTo: string;
}

const ICONS = {
  classroom: (
    <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M4 5h16v12H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 21h6M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M9 3h6M8 8h8v12H8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
  ),
  'cert-prep': (
    <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
  ),
};

export function gatedFeatureIcon(feature: GatedFeatureKey): React.ReactNode {
  return ICONS[feature];
}

/**
 * The upsell copy for every page a free/unpaid account can click into but not
 * open — one shared visual component (PaywallScreen), different copy per
 * surface. Adding a new gated page = one new entry here + wiring <PageGate> on
 * its route (see routes/portalRoutes.tsx).
 */
export const GATED_FEATURES: Record<GatedFeatureKey, GatedFeatureCopy> = {
  classroom: {
    key: 'classroom',
    eyebrow: 'Classroom',
    title: 'Unlock the full 12-week Accelerator',
    subtitle: 'Every week of curriculum, live Build Day classes, and hands-on labs — enroll and pay to open it all.',
    benefits: [
      '12 weeks of guided AI Systems Architect curriculum',
      'Live weekly Build Day classes with real feedback',
      'Graded projects that build your certification portfolio',
      'Full access to the Colaberry community and mentors',
    ],
    ctaLabel: 'Enroll to unlock →',
    ctaTo: '/portal/settings?tab=subscription',
  },
  projects: {
    key: 'projects',
    eyebrow: 'Projects',
    title: 'Build a real, shippable AI project',
    subtitle: 'Turn a raw idea into a working tool with guided build sessions and hands-on review — paid seats only.',
    benefits: [
      'Guided project builds from idea to shipped tool',
      'Structured build sessions with real accountability',
      'Feedback on real, working AI systems you create',
      'Every completed build counts toward certification',
    ],
    ctaLabel: 'Enroll to start building →',
    ctaTo: '/portal/settings?tab=subscription',
  },
  'cert-prep': {
    key: 'cert-prep',
    eyebrow: 'Cert Prep',
    title: 'Get certification-ready',
    subtitle: 'Practice exams and a study track mapped directly to the AI Systems Architect certification.',
    benefits: [
      'Practice exams mapped to the real certification',
      'A guided study track, not a generic question bank',
      'Track your readiness as you progress',
    ],
    ctaLabel: 'Enroll to unlock →',
    ctaTo: '/portal/settings?tab=subscription',
  },
};
