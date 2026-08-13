/**
 * v2Signup.ts -- creating a free business account.
 *
 * THE SHAPE OF THIS IS DICTATED BY TWO REAL CONTRACTS, NOT BY PREFERENCE
 *
 * 1. `POST /api/portal/org/register` (services/orgApi.ts) accepts exactly
 *    `{ name, company?, email }` and returns a JWT. It is passwordless. Asking
 *    for twelve fields before it would invent friction the product does not
 *    require, and every extra required field on a signup form costs signups.
 *
 * 2. `POST /api/leads` validates against `leadSchema` (backend/src/services/
 *    leadService.ts) and DOES store role, title, company size, timeline,
 *    interest area, phone, a free-text message, and two booleans that exist
 *    precisely for qualification: `evaluating_90_days` and
 *    `corporate_sponsorship_interest`.
 *
 * So the account is created from the three fields it needs, and everything worth
 * knowing is asked immediately afterwards, once the account exists and the
 * person is already in. Nothing here is collected for the sake of it: every
 * field below lands in a column that exists. A form that asks for data with
 * nowhere to store it is theatre, and it is the same defect as a claim with no
 * evidence behind it.
 */

import type { IconName } from '../components/publicV2/Icon';

/* ─────────────────────────────────────────────────────────── step 1: account ── */

export interface AccountInput {
  readonly fullName: string;
  readonly workEmail: string;
  readonly company: string;
}

export interface AccountErrors {
  fullName?: string;
  workEmail?: string;
  company?: string;
}

/** Domains that suggest a personal address. Not rejected -- flagged in copy only. */
const CONSUMER_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com',
  'proton.me', 'protonmail.com', 'live.com', 'msn.com',
];

export function isConsumerEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  return CONSUMER_DOMAINS.includes(domain);
}

/**
 * Validate the three fields the account actually needs.
 *
 * A personal email address is NOT an error. The account works with one, and
 * blocking it would turn a soft preference into a wall in front of a free
 * product. The form says why a work address is better and moves on.
 */
export function validateAccount(input: AccountInput): AccountErrors {
  const errors: AccountErrors = {};
  if (!input.fullName.trim()) errors.fullName = 'We need a name to put on the account.';
  if (!input.workEmail.trim()) {
    errors.workEmail = 'We need an address to send the account to.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.workEmail.trim())) {
    errors.workEmail = 'That address does not look right.';
  }
  if (!input.company.trim()) errors.company = 'Your organization names the workspace.';
  return errors;
}

/** Exactly the body `registerOrg` accepts. Nothing else is sent to it. */
export function buildAccountBody(input: AccountInput): {
  name: string;
  email: string;
  company?: string;
} {
  const company = input.company.trim();
  return {
    name: input.fullName.trim(),
    email: input.workEmail.trim(),
    company: company || undefined,
  };
}

/* ────────────────────────────────────────────────────────── step 2: context ── */

export interface ChoiceField {
  readonly value: string;
  readonly label: string;
}

export const ROLE_OPTIONS: readonly ChoiceField[] = [
  { value: 'exec', label: 'Executive or owner' },
  { value: 'tech_leader', label: 'Technology leader' },
  { value: 'people_leader', label: 'People or L&D leader' },
  { value: 'ops_leader', label: 'Operations leader' },
  { value: 'ic', label: 'Individual contributor' },
];

export const TEAM_SIZE_OPTIONS: readonly ChoiceField[] = [
  { value: '1-9', label: '1 to 9' },
  { value: '10-49', label: '10 to 49' },
  { value: '50-199', label: '50 to 199' },
  { value: '200-999', label: '200 to 999' },
  { value: '1000+', label: '1,000 or more' },
];

export const TIMELINE_OPTIONS: readonly ChoiceField[] = [
  { value: 'now', label: 'We are working on it now' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'Later this year' },
  { value: 'exploring', label: 'Just exploring' },
];

export interface GoalOption {
  readonly value: string;
  readonly label: string;
  readonly icon: IconName;
}

/** What they want out of it. Maps to `interest_area`. */
export const GOAL_OPTIONS: readonly GoalOption[] = [
  { value: 'measure_readiness', label: 'Measure where my team actually stands', icon: 'gauge' },
  { value: 'train_builders', label: 'Turn my people into AI builders', icon: 'ladder' },
  { value: 'ship_workflow', label: 'Get one workflow into production', icon: 'bolt' },
  { value: 'governance', label: 'Put governance around AI we already use', icon: 'shieldCheck' },
  { value: 'evaluating', label: 'Evaluating options for later', icon: 'compass' },
];

export interface ContextInput {
  readonly role: string;
  readonly teamSize: string;
  readonly timeline: string;
  readonly goal: string;
  readonly phone: string;
  readonly notes: string;
  readonly evaluating90Days: boolean;
  readonly sponsorshipInterest: boolean;
  readonly consentContact: boolean;
}

export const SIGNUP_FORM_TYPE = 'business_account';

function labelFor(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label || 'Not answered';
}

/**
 * The qualification payload.
 *
 * Every key maps to a column `leadSchema` accepts. The narrative `message` is
 * written out in full so a salesperson reading the lead record understands it
 * without a decoder, and so the selections stay recoverable as words rather
 * than as codes.
 */
export function buildContextPayload(
  account: AccountInput,
  ctx: ContextInput,
  utm: Readonly<Record<string, string>>,
  pageUrl: string,
): Record<string, unknown> {
  const lines = [
    'Free business account created.',
    '',
    `Role: ${labelFor(ROLE_OPTIONS, ctx.role)}`,
    `Team size: ${labelFor(TEAM_SIZE_OPTIONS, ctx.teamSize)}`,
    `Timeline: ${labelFor(TIMELINE_OPTIONS, ctx.timeline)}`,
    `Wants to: ${labelFor(GOAL_OPTIONS, ctx.goal)}`,
  ];
  if (ctx.evaluating90Days) lines.push('Evaluating within 90 days: yes');
  if (ctx.sponsorshipInterest) lines.push('Interested in sponsoring seats for their team: yes');
  if (ctx.notes.trim()) lines.push('', 'In their words:', ctx.notes.trim());

  return {
    name: account.fullName.trim(),
    email: account.workEmail.trim(),
    company: account.company.trim(),
    role: ctx.role,
    title: labelFor(ROLE_OPTIONS, ctx.role),
    phone: ctx.phone.trim(),
    company_size: ctx.teamSize,
    timeline: ctx.timeline,
    interest_area: ctx.goal,
    message: lines.join('\n'),
    evaluating_90_days: ctx.evaluating90Days,
    corporate_sponsorship_interest: ctx.sponsorshipInterest,
    consent_contact: ctx.consentContact,
    form_type: SIGNUP_FORM_TYPE,
    source: 'website',
    page_url: pageUrl,
    ...utm,
  };
}

/** What the account gives them, stated where they are deciding to create it. */
export const ACCOUNT_INCLUDES: readonly { readonly icon: IconName; readonly text: string }[] = [
  { icon: 'grid', text: 'The manager view of your organization and the learner experience, in one account' },
  { icon: 'people', text: 'Invite your team, and the sample data gives way to their real progress' },
  { icon: 'gauge', text: 'Readiness, builder XP, evidence and evaluations tracked per person' },
  { icon: 'lock', text: 'No credit card, and no sales call required to look around' },
];
