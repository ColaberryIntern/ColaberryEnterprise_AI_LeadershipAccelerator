// SAFETY: This is the single source of truth for the marketing monitoring agents.
// Rules are READ-ONLY evaluation criteria — they never modify the DOM.

export type RuleCategory = 'ux_ui' | 'marketing_strategy' | 'conversion_testing';
export type CheckType = 'selector_exists' | 'selector_attr' | 'text_content' | 'meta_tag' | 'selector_count';

export interface BlueprintRule {
  id: string;
  category: RuleCategory;
  description: string;
  required: boolean;
  validationCriteria: string;
  severityWeight: number; // 1-5
  checkType: CheckType;
  selector?: string;
  attribute?: string;
  textPattern?: string; // serializable regex source
  metaName?: string;
  minCount?: number;
  maxCount?: number;
  appliesTo: string[]; // route paths or ['*']
}

export const CONFIDENCE_THRESHOLD = 0.90;
export const BLUEPRINT_ALIGNMENT_THRESHOLD = 4;

// All public routes from publicRoutes.tsx
export const PUBLIC_ROUTES = [
  '/', '/program', '/pricing', '/sponsorship', '/advisory',
  '/case-studies', '/enroll', '/contact', '/strategy-call-prep',
];

export const MARKETING_BLUEPRINT: BlueprintRule[] = [
  // ═══════════════════════════════════════════
  // CORE POSITIONING PILLARS
  // ═══════════════════════════════════════════
  {
    id: 'pos-001',
    category: 'marketing_strategy',
    description: 'Hero section contains primary positioning statement',
    required: true,
    validationCriteria: 'Hero section must contain messaging about building AI capability internally',
    severityWeight: 5,
    checkType: 'text_content',
    selector: '[aria-label="Hero"] h1, .hero-bg h1',
    textPattern: '(AI|artificial intelligence).*(internal|inside|organization|capability|system)',
    appliesTo: ['/'],
  },
  {
    id: 'pos-002',
    category: 'marketing_strategy',
    description: 'Speed-to-value positioning present',
    required: true,
    validationCriteria: 'Homepage must emphasize speed from strategy to deployed systems',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: 'strategy to.*(deploy|production|system)|3 [Ww]eeks|expert guidance.*implementation',
    appliesTo: ['/'],
  },
  {
    id: 'pos-003',
    category: 'marketing_strategy',
    description: 'Internal capability ownership messaging',
    required: true,
    validationCriteria: 'Page must emphasize internal ownership over outsourcing',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(internal|inside your|within your|ownership|capability).*(AI|solution|build)',
    appliesTo: ['/', '/program'],
  },

  // ═══════════════════════════════════════════
  // DUAL AUDIENCE MODEL
  // ═══════════════════════════════════════════
  {
    id: 'aud-001',
    category: 'marketing_strategy',
    description: 'Executive audience targeting present',
    required: true,
    validationCriteria: 'Must reference executive/director/VP/CIO/CTO audience',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(director|VP|CIO|CTO|CDO|executive|C-suite|technical leader)',
    appliesTo: ['/', '/program', '/pricing'],
  },
  {
    id: 'aud-002',
    category: 'marketing_strategy',
    description: 'Corporate sponsor audience addressed',
    required: true,
    validationCriteria: 'Sponsorship page must have ROI framing for corporate decision makers',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(ROI|return on investment|cost.*justif|sponsor|corporate)',
    appliesTo: ['/sponsorship'],
  },
  {
    id: 'aud-003',
    category: 'marketing_strategy',
    description: 'Technical champion emphasis on program page',
    required: false,
    validationCriteria: 'Program page should address technical leaders who build and deploy',
    severityWeight: 3,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(technical leader|architect|deploy|implement|build|hands-on)',
    appliesTo: ['/program'],
  },

  // ═══════════════════════════════════════════
  // CLAUDE CODE MESSAGING
  // ═══════════════════════════════════════════
  {
    id: 'cc-001',
    category: 'marketing_strategy',
    description: 'Claude Code referenced on program page',
    required: true,
    validationCriteria: 'Program page must mention Claude Code as execution engine/partner',
    severityWeight: 5,
    checkType: 'text_content',
    selector: 'body',
    textPattern: 'Claude Code',
    appliesTo: ['/program'],
  },
  {
    id: 'cc-002',
    category: 'marketing_strategy',
    description: 'AI tools/execution engine referenced on homepage',
    required: false,
    validationCriteria: 'Homepage should reference AI execution tools or Claude Code in value proposition',
    severityWeight: 3,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(Claude Code|AI.*tool|execution.*engine|AI.*partner)',
    appliesTo: ['/'],
  },

  // ═══════════════════════════════════════════
  // ARTIFACT EMPHASIS
  // ═══════════════════════════════════════════
  {
    id: 'art-001',
    category: 'marketing_strategy',
    description: 'Concrete deliverables listed',
    required: true,
    validationCriteria: 'Must list specific artifacts: POC, roadmap, architecture templates, executive deck',
    severityWeight: 5,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(POC|proof of concept|roadmap|architecture.*template|executive.*deck|presentation)',
    appliesTo: ['/', '/program'],
  },
  {
    id: 'art-002',
    category: 'marketing_strategy',
    description: 'Deliverables section or value stack present',
    required: true,
    validationCriteria: 'A dedicated section listing what participants walk away with',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: '[aria-label*="Deliver"], [aria-label*="Walk Away"], [aria-label*="Value Stack"], [aria-label*="What You"]',
    appliesTo: ['/', '/program'],
  },

  // ═══════════════════════════════════════════
  // LEAD MAGNET REQUIREMENTS
  // ═══════════════════════════════════════════
  {
    id: 'lm-001',
    category: 'conversion_testing',
    description: 'Lead capture form present on homepage',
    required: true,
    validationCriteria: 'Homepage must have a LeadCaptureForm for executive briefing download',
    severityWeight: 5,
    checkType: 'selector_exists',
    selector: 'form[data-form-type], form',
    minCount: 1,
    appliesTo: ['/'],
  },
  {
    id: 'lm-002',
    category: 'conversion_testing',
    description: 'Sponsorship kit download form present',
    required: true,
    validationCriteria: 'Sponsorship page must have a download form for the sponsorship kit',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: 'form',
    minCount: 1,
    appliesTo: ['/sponsorship'],
  },
  {
    id: 'lm-003',
    category: 'conversion_testing',
    description: 'High-intent pages have lead capture or CTA',
    required: true,
    validationCriteria: 'Pricing and program pages must have a form or strong CTA to enrollment/strategy call',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: 'form, a[href*="enroll"], a[href*="strategy"], button[data-track-cta]',
    minCount: 1,
    appliesTo: ['/pricing', '/program'],
  },

  // ═══════════════════════════════════════════
  // REQUIRED PAGES AND CTAs
  // ═══════════════════════════════════════════
  {
    id: 'cta-001',
    category: 'conversion_testing',
    description: 'At least one primary CTA button per page',
    required: true,
    validationCriteria: 'Every page must have at least one .btn-primary, .btn-hero-primary, or [data-track-cta]',
    severityWeight: 5,
    checkType: 'selector_exists',
    selector: '.btn-primary, .btn-hero-primary, [data-track-cta], a.btn[href*="enroll"]',
    minCount: 1,
    appliesTo: ['*'],
  },
  {
    id: 'cta-002',
    category: 'ux_ui',
    description: 'Hero section has CTA above fold',
    required: true,
    validationCriteria: 'Hero section must contain at least one call-to-action button',
    severityWeight: 5,
    checkType: 'selector_exists',
    selector: '[aria-label="Hero"] .btn, [aria-label="Page Header"] .btn, .hero-bg .btn',
    minCount: 1,
    appliesTo: ['/', '/program', '/pricing', '/sponsorship'],
  },
  {
    id: 'cta-003',
    category: 'conversion_testing',
    description: 'Enroll CTA accessible from key pages',
    required: true,
    validationCriteria: 'Homepage, pricing, and program pages must link to /enroll',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: 'a[href*="/enroll"]',
    minCount: 1,
    appliesTo: ['/', '/pricing', '/program'],
  },

  // ═══════════════════════════════════════════
  // REQUIRED TRACKING HOOKS
  // ═══════════════════════════════════════════
  {
    id: 'trk-001',
    category: 'conversion_testing',
    description: 'CTA buttons have tracking attributes',
    required: false,
    validationCriteria: 'Primary CTA buttons should have data-track-cta attribute for analytics',
    severityWeight: 3,
    checkType: 'selector_exists',
    selector: '[data-track-cta]',
    minCount: 1,
    appliesTo: ['/', '/program', '/pricing', '/enroll'],
  },
  {
    id: 'trk-002',
    category: 'conversion_testing',
    description: 'Forms submit to lead capture endpoint',
    required: true,
    validationCriteria: 'Lead capture forms must be connected to backend (form element present with submit handler)',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: 'form button[type="submit"], form input[type="submit"]',
    minCount: 1,
    appliesTo: ['/', '/sponsorship', '/contact'],
  },

  // ═══════════════════════════════════════════
  // SCARCITY ELEMENTS
  // ═══════════════════════════════════════════
  {
    id: 'scar-001',
    category: 'marketing_strategy',
    description: 'Cohort date or deadline visible on homepage',
    required: true,
    validationCriteria: 'Homepage should show upcoming cohort date or enrollment deadline',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(cohort|march|april|may|june|deadline|limited|seats|enrollment.*open)',
    appliesTo: ['/'],
  },
  {
    id: 'scar-002',
    category: 'marketing_strategy',
    description: 'Seat availability or capacity shown on enrollment page',
    required: true,
    validationCriteria: 'Enrollment page must show remaining seats or cohort capacity',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(seat|capacity|remaining|available|limited|spot)',
    appliesTo: ['/enroll'],
  },

  // ═══════════════════════════════════════════
  // TRUST SIGNALS
  // ═══════════════════════════════════════════
  {
    id: 'trust-001',
    category: 'marketing_strategy',
    description: 'Trust indicators near forms',
    required: false,
    validationCriteria: 'Lead capture forms should have nearby trust signals (privacy, security, guarantee)',
    severityWeight: 3,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(privacy|secure|no spam|confidential|unsubscribe|guarantee)',
    appliesTo: ['/', '/sponsorship', '/contact'],
  },
  {
    id: 'trust-002',
    category: 'marketing_strategy',
    description: 'Case studies have quantified results',
    required: true,
    validationCriteria: 'Case studies must include specific metrics or percentage improvements',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(\\d+%|\\$\\d|\\d+x|reduced.*by|increased.*by|saved)',
    appliesTo: ['/case-studies'],
  },

  // ═══════════════════════════════════════════
  // RAM BOOK AUTHORITY BLOCK
  // ═══════════════════════════════════════════
  {
    id: 'auth-001',
    category: 'marketing_strategy',
    description: 'Instructor/founder authority section present',
    required: true,
    validationCriteria: 'Homepage or program page must have an authority section with instructor credentials',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(Ram|founder|instructor|author|book|credential|experience|year)',
    appliesTo: ['/', '/program'],
  },

  // ═══════════════════════════════════════════
  // SEO REQUIREMENTS (UX/UI)
  // ═══════════════════════════════════════════
  {
    id: 'seo-001',
    category: 'ux_ui',
    description: 'Page has title tag',
    required: true,
    validationCriteria: 'Every page must have a non-empty <title> tag',
    severityWeight: 5,
    checkType: 'meta_tag',
    metaName: 'title',
    appliesTo: ['*'],
  },
  {
    id: 'seo-002',
    category: 'ux_ui',
    description: 'Meta description present',
    required: true,
    validationCriteria: 'Every page must have a meta description between 120-160 characters',
    severityWeight: 4,
    checkType: 'meta_tag',
    metaName: 'description',
    appliesTo: ['*'],
  },
  {
    id: 'seo-003',
    category: 'ux_ui',
    description: 'Open Graph title present',
    required: true,
    validationCriteria: 'Every page must have og:title meta tag',
    severityWeight: 3,
    checkType: 'meta_tag',
    metaName: 'og:title',
    appliesTo: ['*'],
  },
  {
    id: 'seo-004',
    category: 'ux_ui',
    description: 'Open Graph description present',
    required: true,
    validationCriteria: 'Every page must have og:description meta tag',
    severityWeight: 3,
    checkType: 'meta_tag',
    metaName: 'og:description',
    appliesTo: ['*'],
  },

  // ═══════════════════════════════════════════
  // ACCESSIBILITY (UX/UI)
  // ═══════════════════════════════════════════
  {
    id: 'a11y-001',
    category: 'ux_ui',
    description: 'Skip navigation link present',
    required: true,
    validationCriteria: 'Page must have a skip-to-content link for keyboard navigation',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: '.skip-nav, a[href="#main-content"]',
    minCount: 1,
    appliesTo: ['*'],
  },
  {
    id: 'a11y-002',
    category: 'ux_ui',
    description: 'Images have alt attributes',
    required: true,
    validationCriteria: 'All <img> tags must have alt attributes',
    severityWeight: 4,
    checkType: 'selector_attr',
    selector: 'img',
    attribute: 'alt',
    appliesTo: ['*'],
  },
  {
    id: 'a11y-003',
    category: 'ux_ui',
    description: 'Sections have aria-label for landmarks',
    required: false,
    validationCriteria: 'Major content sections should have aria-label for screen readers',
    severityWeight: 3,
    checkType: 'selector_exists',
    selector: 'section[aria-label]',
    minCount: 2,
    appliesTo: ['*'],
  },
  {
    id: 'a11y-004',
    category: 'ux_ui',
    description: 'Main content landmark present',
    required: true,
    validationCriteria: 'Page must have a <main> element or #main-content',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: 'main, #main-content',
    minCount: 1,
    appliesTo: ['*'],
  },

  // ═══════════════════════════════════════════
  // LAYOUT & VISUAL (UX/UI)
  // ═══════════════════════════════════════════
  {
    id: 'ux-001',
    category: 'ux_ui',
    description: 'Hero section present on key pages',
    required: true,
    validationCriteria: 'Main pages must have a hero/header section',
    severityWeight: 4,
    checkType: 'selector_exists',
    selector: '.hero-bg, [aria-label="Hero"], [aria-label="Page Header"]',
    minCount: 1,
    appliesTo: ['/', '/program', '/pricing', '/sponsorship', '/advisory', '/case-studies'],
  },
  {
    id: 'ux-002',
    category: 'ux_ui',
    description: 'Page has proper heading hierarchy',
    required: true,
    validationCriteria: 'Page must have exactly one <h1> element',
    severityWeight: 3,
    checkType: 'selector_count',
    selector: 'h1',
    minCount: 1,
    maxCount: 1,
    appliesTo: ['*'],
  },
  {
    id: 'ux-003',
    category: 'ux_ui',
    description: 'Footer visible on page',
    required: true,
    validationCriteria: 'Page must have a footer element',
    severityWeight: 3,
    checkType: 'selector_exists',
    selector: 'footer',
    minCount: 1,
    appliesTo: ['*'],
  },

  // ═══════════════════════════════════════════
  // CONVERSION PATH DEFINITIONS
  // ═══════════════════════════════════════════
  {
    id: 'conv-001',
    category: 'conversion_testing',
    description: 'Strategy call CTA on high-intent pages',
    required: true,
    validationCriteria: 'Pricing and program pages should offer strategy call booking',
    severityWeight: 4,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(strategy.*call|schedule.*call|book.*call|consultation)',
    appliesTo: ['/pricing', '/program', '/'],
  },
  {
    id: 'conv-002',
    category: 'conversion_testing',
    description: 'Contact page has functional form',
    required: true,
    validationCriteria: 'Contact page must have a form with email field and submit button',
    severityWeight: 5,
    checkType: 'selector_exists',
    selector: 'form input[type="email"], form input[name="email"]',
    minCount: 1,
    appliesTo: ['/contact'],
  },
  {
    id: 'conv-003',
    category: 'conversion_testing',
    description: 'Pricing page shows clear price',
    required: true,
    validationCriteria: 'Pricing page must display the program price',
    severityWeight: 5,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '\\$[0-9,]+',
    appliesTo: ['/pricing'],
  },
  {
    id: 'conv-004',
    category: 'conversion_testing',
    description: 'Enrollment page has payment options',
    required: true,
    validationCriteria: 'Enrollment page must offer payment method selection (credit card, invoice)',
    severityWeight: 5,
    checkType: 'text_content',
    selector: 'body',
    textPattern: '(credit card|invoice|payment|stripe|pay)',
    appliesTo: ['/enroll'],
  },
];

// Health score category weights (must sum to 1.0)
export const HEALTH_WEIGHTS: Record<string, number> = {
  positioning: 0.20,
  cta_clarity: 0.15,
  artifact_emphasis: 0.10,
  claude_code_visibility: 0.10,
  funnel_integrity: 0.15,
  lead_magnets: 0.10,
  tracking_coverage: 0.05,
  seo: 0.10,
  accessibility: 0.05,
};
