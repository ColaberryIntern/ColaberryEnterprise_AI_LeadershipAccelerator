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
 * "One Class, Many Doors" navigation.
 * Two doors into ONE program:
 *   Door A — individuals self-serve ($149/mo membership personas) → "Join the Challenge"
 *   Door B — employers sponsor annual seats (talent discovery)     → "Sponsor Your Team"
 * Advisory / pilot / strategy-call links are demoted out of the primary nav.
 * The two-door CTAs render as buttons in PublicNavbar (see PRIMARY_CTA / SECONDARY_CTA).
 */
export const NAV_LINKS: NavItem[] = [
  { path: '/', label: 'Home' },
  {
    label: 'The Challenge',
    children: [
      { path: '/program', label: 'How It Works' },
      { path: '/membership/working-professionals', label: 'For Working Professionals' },
      { path: '/membership/beginners', label: 'For Beginners' },
      { path: '/membership/builders', label: 'For Builders' },
      { path: '/ai-architect/instructor', label: 'Your Instructor' },
    ],
  },
  {
    label: 'For Employers',
    children: [
      { path: '/sponsorship', label: 'Sponsor Your Team' },
      { path: '/case-studies', label: 'Proof & Case Studies' },
      { path: '/pricing', label: 'Pricing & Seats' },
    ],
  },
  { path: '/contact', label: 'Contact' },
];

/** The two doors, surfaced as the primary nav CTAs. */
export const PRIMARY_CTA = { path: '/enroll', label: 'Join the Challenge' };
export const SECONDARY_CTA = { path: '/sponsorship', label: 'Sponsor Your Team' };

/** Footer link columns. Advisory / pilot / strategy-call intentionally omitted. */
export const FOOTER_LINKS = [
  { path: '/program', label: 'How It Works' },
  { path: '/enroll', label: 'Join the Challenge' },
  { path: '/sponsorship', label: 'Sponsor Your Team' },
  { path: '/case-studies', label: 'Case Studies' },
  { path: '/pricing', label: 'Pricing & Seats' },
  { path: '/contact', label: 'Contact' },
];

/** Footer tagline — matches the new positioning. */
export const FOOTER_TAGLINE = 'Most people consume AI. Very few learn to build with it.';
