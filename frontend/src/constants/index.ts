export const CONTACT_EMAIL = 'info@colaberry.com';

export const PIPELINE_STAGES = [
  { key: 'new_lead', value: 'new_lead', label: 'New Lead', color: '#0dcaf0' },
  { key: 'contacted', value: 'contacted', label: 'Contacted', color: '#0d6efd' },
  { key: 'meeting_scheduled', value: 'meeting_scheduled', label: 'Meeting Scheduled', color: '#6f42c1' },
  { key: 'proposal_sent', value: 'proposal_sent', label: 'Proposal Sent', color: '#fd7e14' },
  { key: 'negotiation', value: 'negotiation', label: 'Negotiation', color: '#ffc107' },
  { key: 'enrolled', value: 'enrolled', label: 'Enrolled', color: '#198754' },
  { key: 'lost', value: 'lost', label: 'Lost', color: '#6c757d' },
];

export const PIPELINE_STAGE_COLORS: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s.color])
);

export const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'lost', label: 'Lost' },
];

export const STATUS_VALUES = STATUS_OPTIONS.map((s) => s.value);

export const COMPANY_SIZE_OPTIONS = [
  { value: '', label: 'Select company size' },
  { value: '1-49', label: '1-49 employees' },
  { value: '50-249', label: '50-249 employees' },
  { value: '250-999', label: '250-999 employees' },
  { value: '1000-4999', label: '1,000-4,999 employees' },
  { value: '5000+', label: '5,000+ employees' },
];

export const APPOINTMENT_TYPES = [
  { value: 'strategy_call', label: 'Strategy Call' },
  { value: 'demo', label: 'Demo' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'enrollment_close', label: 'Enrollment Close' },
];

export type NavItem = {
  label: string;
  path?: string;
  children?: { path: string; label: string }[];
};

/**
 * Single-persona navigation.
 * There is ONE visitor: a decision-maker who is also the learner, evaluating
 * the platform for their company and wanting to experience it themselves. No
 * two-door split. One primary CTA everywhere: "$0 to start" -> /try (the
 * $0 account funnel that gives them BOTH the learner experience and their own
 * organization / management view). A soft secondary invites a guided walkthrough.
 * Nav carries informational links only; the CTAs render as buttons in
 * PublicNavbar (see PRIMARY_CTA / SECONDARY_CTA).
 *
 * THE LABEL IS NOT A COPY CHOICE. It read "Start free" until 2026-10-07. A school
 * may not advertise the word (40 TAC 807.172(d), Texas Workforce Commission), and
 * the only approved phrasings are "$0 to start" and "No card needed" - the first
 * for anything a visitor clicks, because a button names an action, and the second
 * for the reassurance line beside it. Do not shorten this back to the old label.
 */
export const NAV_LINKS: NavItem[] = [
  { path: '/', label: 'Home' },
  {
    label: 'The Program',
    children: [
      { path: '/program', label: 'Program' },
      { path: '/pricing', label: 'Pricing' },
      { path: '/case-studies', label: 'Case Studies' },
      { path: '/demo-day', label: 'Demo Day' },
    ],
  },
  { path: '/contact', label: 'Contact' },
];

/** One primary CTA everywhere: open a $0 account. Soft secondary for a guided walkthrough. */
export const PRIMARY_CTA = { path: '/try', label: '$0 to start' };
export const SECONDARY_CTA = { path: '/contact', label: 'Book a walkthrough' };

/** Footer link columns. Informational only; the $0-to-start CTA lives in its own column. */
export const FOOTER_LINKS = [
  { path: '/program', label: 'How It Works' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/case-studies', label: 'Case Studies' },
  { path: '/demo-day', label: 'Demo Day' },
  { path: '/contact', label: 'Contact' },
];

/** Footer tagline — matches the new positioning. */
export const FOOTER_TAGLINE = 'Most people consume AI. Very few learn to build with it.';
