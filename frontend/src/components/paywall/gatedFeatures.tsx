import React from 'react';

export type GatedFeatureKey = 'classroom' | 'projects' | 'cert-prep' | 'portfolio';

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
  portfolio: (
    <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 6V4h6v2M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
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
  portfolio: {
    key: 'portfolio',
    eyebrow: 'Portfolio',
    title: 'Build a portfolio employers can verify',
    subtitle: 'Your learning, projects and GitHub work automatically become a professional portfolio — with the evidence behind every claim.',
    benefits: [
      'Your class work becomes portfolio artifacts automatically',
      'Every capability shows the evidence that earned it',
      'One portfolio across all your projects and repositories',
      'Private by default — you control what is ever shared',
    ],
    ctaLabel: 'Enroll to unlock your portfolio →',
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
