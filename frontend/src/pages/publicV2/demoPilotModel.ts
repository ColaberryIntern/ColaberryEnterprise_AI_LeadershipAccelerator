/**
 * demoPilotModel - what /demo-pilot asks, how it is checked, and the one figure the
 * intake shows back (W28).
 *
 * Ali, 2026-11-20: the form starts the intake, the AI interview asks the rest, and the page
 * shows the time this saves from THEIR numbers (Q2 A). So the form stays short and the cost
 * question is two numbers rather than free text: people, and hours a week between them.
 * Nothing here states a figure of our own; a measured one needs a Claim Registry row first.
 */

import { phoneProblem } from '../../utils/phone';

export const SERVICES = ['Build', 'Guide', 'Train', 'Not sure yet'] as const;

export const DEPARTMENTS = [
  'Finance',
  'Operations',
  'Customer service',
  'Sales',
  'HR',
  'IT & Data',
  'Company-wide',
  'Other',
] as const;

export const START_TIMINGS = ['This month', 'This quarter', 'Next quarter', 'Just exploring'] as const;

export const WHAT_HAPPENS: readonly { n: string; title: string; body: string }[] = [
  {
    n: '1',
    title: 'Talk to our AI for 10 minutes',
    body: 'Right after you send this, by phone or by typing. It only asks what the form leaves out.',
  },
  {
    n: '2',
    title: 'We do the homework',
    body: 'We research your company and draft options for your pilot before we meet.',
  },
  {
    n: '3',
    title: 'Our first meeting starts with your options',
    body: 'Not with our questions. Then you see the demo pilot and decide.',
  },
];

export interface PilotForm {
  fullName: string;
  email: string;
  company: string;
  role: string;
  phone: string;
  callConsent: boolean;
  website: string;
  service: string;
  department: string;
  process: string;
  peopleCount: string;
  hoursPerWeek: string;
  requiredReturn: string;
  startTiming: string;
  otherDeciders: string;
  consentContact: boolean;
}

export const EMPTY: PilotForm = {
  fullName: '',
  email: '',
  company: '',
  role: '',
  phone: '',
  callConsent: false,
  website: '',
  service: '',
  department: '',
  process: '',
  peopleCount: '',
  hoursPerWeek: '',
  requiredReturn: '',
  startTiming: '',
  otherDeciders: '',
  consentContact: false,
};

/** A typed number, or null for blank or nonsense. Never negative. */
export function figure(raw: string): number | null {
  const t = String(raw || '').replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validate(f: PilotForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.fullName.trim()) e.fullName = 'Please tell us your name';
  if (!f.email.trim()) e.email = 'Please give us a work email';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'That does not look like an email address';
  if (!f.company.trim()) e.company = 'Please tell us your company, so we can research it before we meet';
  if (!f.process.trim()) e.process = 'Name one process, even roughly';
  // PH1: every public lead form requires a phone number, checked by the one shared rule.
  const phoneError = phoneProblem(f.phone);
  if (phoneError) e.phone = phoneError;
  if (f.peopleCount.trim() && figure(f.peopleCount) === null) e.peopleCount = 'A number, please';
  if (f.hoursPerWeek.trim() && figure(f.hoursPerWeek) === null) e.hoursPerWeek = 'A number, please';
  // Blocking, deliberately: consent to be contacted is a compliance surface, not a style choice.
  if (!f.consentContact) e.consentContact = 'You must agree to be contacted';
  return e;
}

/** The body POST /api/enterprise/intake takes. */
export function toIntakeBody(
  f: PilotForm,
  tracking: { utmSource?: string; utmMedium?: string; utmCampaign?: string; pageUrl?: string },
): Record<string, unknown> {
  const phone = f.phone.trim();
  return {
    fullName: f.fullName.trim(),
    email: f.email.trim(),
    company: f.company.trim(),
    role: f.role.trim(),
    phone,
    callConsent: f.callConsent,
    website: f.website.trim(),
    service: f.service,
    department: f.department,
    process: f.process.trim(),
    peopleCount: figure(f.peopleCount),
    hoursPerWeek: figure(f.hoursPerWeek),
    requiredReturn: f.requiredReturn.trim(),
    startTiming: f.startTiming,
    otherDeciders: f.otherDeciders.trim(),
    consentContact: f.consentContact,
    utmSource: tracking.utmSource || '',
    utmMedium: tracking.utmMedium || '',
    utmCampaign: tracking.utmCampaign || '',
    pageUrl: tracking.pageUrl || '',
  };
}

/**
 * Their process, in hours a year, from their own two numbers. `hoursPerWeek` is already the
 * total across the people, as the form asks, so the people count is context, not a factor.
 * Null when they gave no hours: no figure beats an invented one.
 */
export function hoursPerYear(hoursPerWeek: number | null): number | null {
  if (hoursPerWeek === null || !(hoursPerWeek > 0)) return null;
  return Math.round(hoursPerWeek * 52);
}

export const formatHours = (n: number): string => n.toLocaleString('en-US');
