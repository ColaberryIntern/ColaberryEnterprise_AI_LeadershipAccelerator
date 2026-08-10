/**
 * v2Lab.ts -- the five steps of the AI Opportunity Lab.
 *
 * WHAT THIS CAN AND CANNOT PROMISE
 * `surface.opportunity.lab` is VERIFIED but its capability is `unbuilt`: its
 * registry wording is "Map an AI opportunity in five steps and get a scored
 * assessment", and the scoring half does not exist. ExecutiveROICalculatorPage
 * makes zero /api/ calls, so the existing "calculator" computes nothing on a
 * server and nothing is retained.
 *
 * So this page does the half that is real. It captures a structured description
 * of the opportunity and routes it to a person. It does NOT return a score, an
 * ROI figure, a payback period or a readiness rating, because generating any of
 * those client-side would be inventing a number and presenting it as analysis --
 * which is exactly the defect the claims registry exists to prevent.
 *
 * NO MIGRATION AND NO NEW ENDPOINT
 * Every answer maps onto columns the `leads` table already has, posted to the
 * existing rate-limited, Zod-validated POST /api/leads. Adding a public endpoint
 * would mean adding a public attack surface; reusing this one means the input is
 * already validated server-side by `leadSchema` in services/leadService.ts.
 */

export type StepId = 'function' | 'friction' | 'volume' | 'outcome' | 'contact';

export interface LabOption {
  readonly value: string;
  readonly label: string;
  /** Shown under the label. Plain language, no jargon. */
  readonly hint?: string;
}

export interface LabStep {
  readonly id: StepId;
  readonly n: number;
  readonly title: string;
  readonly question: string;
  readonly help: string;
  readonly options?: readonly LabOption[];
}

export const LAB_STEPS: readonly LabStep[] = [
  {
    id: 'function',
    n: 1,
    title: 'The work',
    question: 'Where does the work happen?',
    help: 'Pick the function that owns the process you have in mind.',
    options: [
      { value: 'operations', label: 'Operations', hint: 'Fulfilment, scheduling, logistics' },
      { value: 'finance', label: 'Finance', hint: 'Close, reconciliation, reporting' },
      { value: 'customer', label: 'Customer operations', hint: 'Support, claims, onboarding' },
      { value: 'engineering', label: 'Engineering or IT', hint: 'Delivery, tickets, internal tools' },
      { value: 'people', label: 'People', hint: 'Hiring, onboarding, capability' },
      { value: 'other', label: 'Something else', hint: 'Describe it in your own words later' },
    ],
  },
  {
    id: 'friction',
    n: 2,
    title: 'The friction',
    question: 'What makes it slow or expensive today?',
    help: 'The constraint matters more than the tooling. Choose the closest fit.',
    options: [
      { value: 'manual_review', label: 'Manual review of documents or data' },
      { value: 'handoffs', label: 'Too many handoffs between people or systems' },
      { value: 'knowledge', label: 'Knowledge sits with a few individuals' },
      { value: 'inconsistent', label: 'Inconsistent decisions across the team' },
      { value: 'backlog', label: 'A backlog nobody can get ahead of' },
    ],
  },
  {
    id: 'volume',
    n: 3,
    title: 'The scale',
    question: 'How often does this happen?',
    help: 'A rough order of magnitude is enough.',
    options: [
      { value: 'continuous', label: 'Continuously, through the day' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly, or on a cycle' },
    ],
  },
  {
    id: 'outcome',
    n: 4,
    title: 'The outcome',
    question: 'What would make this worth doing?',
    help: 'What has to be true afterwards for this to count as a success.',
    options: [
      { value: 'cycle_time', label: 'The same work, materially faster' },
      { value: 'capacity', label: 'More throughput without more headcount' },
      { value: 'quality', label: 'Fewer errors or more consistent decisions' },
      { value: 'capability', label: 'The team can build and run this themselves' },
      { value: 'evidence', label: 'Evidence of capability we can show a board' },
    ],
  },
  {
    id: 'contact',
    n: 5,
    title: 'You',
    question: 'Who should we reply to?',
    help: 'A person reads what you have written and replies. No automated scoring.',
  },
];

/** Timeline is a real `leads` column, so it is captured rather than inferred. */
export const TIMELINE_OPTIONS: readonly LabOption[] = [
  { value: 'now', label: 'Actively working on it now' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'Sometime this year' },
  { value: 'exploring', label: 'Just exploring' },
];

export const COMPANY_SIZE_OPTIONS: readonly LabOption[] = [
  { value: '1-50', label: '1 to 50' },
  { value: '51-250', label: '51 to 250' },
  { value: '251-1000', label: '251 to 1,000' },
  { value: '1000+', label: 'More than 1,000' },
];

/** Values posted to the existing leads endpoint. */
export const LAB_FORM_TYPE = 'opportunity_lab';
export const LAB_SOURCE = 'website';

/**
 * Compose the free-text summary sent as `message`.
 *
 * Deliberately a readable narrative rather than a JSON blob: a salesperson opens
 * this in a lead record and needs to understand it without a decoder. The raw
 * selections stay recoverable because each answer's label is written out in full.
 */
export function composeSummary(
  answers: Readonly<Record<string, string>>,
  freeText: string,
): string {
  const labelFor = (stepId: StepId): string => {
    const step = LAB_STEPS.find((s) => s.id === stepId);
    const opt = step?.options?.find((o) => o.value === answers[stepId]);
    return opt ? opt.label : 'Not answered';
  };

  const lines = [
    'AI Opportunity Lab submission',
    '',
    `Function: ${labelFor('function')}`,
    `Friction: ${labelFor('friction')}`,
    `Frequency: ${labelFor('volume')}`,
    `Desired outcome: ${labelFor('outcome')}`,
  ];

  if (freeText.trim()) {
    lines.push('', 'In their words:', freeText.trim());
  }

  return lines.join('\n');
}

export interface ContactErrors {
  name?: string;
  email?: string;
  consent?: string;
}

/**
 * Validate the final step.
 *
 * Extracted so "consent is required before we contact you" is a tested invariant
 * rather than an inline condition someone could relax without a test failing.
 */
export function validateContact(contact: LabContact): ContactErrors {
  const errors: ContactErrors = {};
  if (!contact.name.trim()) errors.name = 'Tell us who you are.';
  if (!contact.email.trim()) {
    errors.email = 'We need an address to reply to.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
    errors.email = 'That address does not look right.';
  }
  if (!contact.consent) errors.consent = 'We need your agreement before we contact you.';
  return errors;
}

export interface LabContact {
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly title: string;
  readonly companySize: string;
  readonly timeline: string;
  readonly consent: boolean;
}

/**
 * Build the POST /api/leads body.
 *
 * Extracted from the component so the payload is directly testable. The thing
 * worth asserting is not what it contains but what it OMITS: no
 * `visitor_fingerprint`, no client-computed score, and no field the person did
 * not knowingly provide. Every key here maps to an existing `leads` column
 * validated by `leadSchema`.
 */
export function buildLeadPayload(
  contact: LabContact,
  answers: Readonly<Record<string, string>>,
  freeText: string,
  utm: Readonly<Record<string, string>>,
  pageUrl: string,
): Record<string, unknown> {
  return {
    name: contact.name.trim(),
    email: contact.email.trim(),
    company: contact.company.trim(),
    title: contact.title.trim(),
    company_size: contact.companySize,
    timeline: contact.timeline,
    interest_area: answers.function || '',
    message: composeSummary(answers, freeText),
    form_type: LAB_FORM_TYPE,
    source: LAB_SOURCE,
    consent_contact: contact.consent,
    page_url: pageUrl,
    ...utm,
  };
}
