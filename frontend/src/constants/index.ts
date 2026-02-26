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

export const NAV_LINKS = [
  { path: '/', label: 'Home' },
  { path: '/program', label: 'Program' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/sponsorship', label: 'Sponsorship' },
  { path: '/advisory', label: 'Advisory' },
  { path: '/case-studies', label: 'Case Studies' },
  { path: '/enroll', label: 'Enroll' },
  { path: '/contact', label: 'Contact' },
];

export const FOOTER_LINKS = [
  { path: '/program', label: 'Program' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/sponsorship', label: 'Corporate Sponsorship' },
  { path: '/advisory', label: 'Enterprise AI Advisory' },
  { path: '/case-studies', label: 'Case Studies' },
  { path: '/enroll', label: 'Enroll' },
  { path: '/contact', label: 'Contact' },
];
