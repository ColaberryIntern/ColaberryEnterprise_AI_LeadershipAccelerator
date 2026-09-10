/**
 * The offer-letter package — versioned templates, in code.
 *
 * ── WHY IN CODE, AND WHY VERSIONED ─────────────────────────────────────────
 *
 * The contract: "Generate the official offer-letter package from versioned
 * templates… Produce a locked PDF with document ID, template version, generation
 * date, applicant identity, and checksum/hash."
 *
 * A template edited in a database row would silently change what a future letter
 * says with nothing in the diff, and the version stamped on already-issued letters
 * would stop describing the wording that was actually issued. Here, changing a
 * word is a code change with a version bump, and `internship_document_templates`
 * mirrors it for audit.
 *
 * ── "UNPAID" MEANS NO STIPEND, NOT NO COST ─────────────────────────────────
 *
 * The contract names an "Unpaid Internship Offer Letter", and that is accurate:
 * Colaberry pays no stipend. But the internship also REQUIRES the membership
 * ($149/mo billed annually or $199 month-to-month, waived for anyone already
 * paying Colaberry — confirmed by Ali 2026-09-09). A letter that said "unpaid"
 * and stopped there would be read as "free", so both facts are stated together.
 *
 * ── WHAT THESE DOCUMENTS DO NOT DO ─────────────────────────────────────────
 *
 * They do not create an employment relationship, and they say so. They are also
 * not electronically signable — this version deliberately builds no e-signature
 * flow, so every letter instructs the applicant to print, sign by hand, and upload.
 */

export type TemplateKey =
  | 'unpaid_internship_offer'
  | 'ip_agreement'
  | 'acceptance_acknowledgement'
  | 'recording_consent'
  | 'conditional_approval_addendum'
  | 'work_authorization_request';

export interface TemplateSection {
  heading?: string;
  /** Paragraphs. `{{placeholders}}` are substituted from DocumentFacts. */
  body: readonly string[];
  /** Rendered as a bulleted list rather than prose. */
  bullets?: readonly string[];
}

export interface DocumentTemplate {
  key: TemplateKey;
  version: number;
  title: string;
  /** Whether every applicant needs it, or only some. */
  requirement: 'always' | 'conditional';
  /** Plain sentence a reviewer/applicant sees explaining why it is in the pack. */
  why: string;
  /** True when the applicant must physically sign this one. */
  requires_signature: boolean;
  sections: readonly TemplateSection[];
}

/** Everything a template may interpolate. Nothing else is available to it. */
export interface DocumentFacts {
  legal_name: string;
  document_public_id: string;
  generated_on: string;          // YYYY-MM-DD
  template_version: number;
  start_on: string | null;       // the rolling Monday, when known
  weekly_hours: number;
  max_active_projects: number;
  membership_monthly_annual: string;
  membership_monthly_monthly: string;
  tooling_monthly_estimate: string;
  conditions: string | null;
}

const HOURS = 25;
const PROJECTS = 2;

export const DOCUMENT_TEMPLATES: Record<TemplateKey, DocumentTemplate> = {
  unpaid_internship_offer: {
    key: 'unpaid_internship_offer',
    version: 1,
    title: 'AI Internship Offer Letter',
    requirement: 'always',
    why: 'The offer itself. Sets out the hours, the project work, the costs and the fact that it is not employment.',
    requires_signature: true,
    sections: [
      {
        body: [
          'Dear {{legal_name}},',
          'We are pleased to offer you a place on the Colaberry AI Internship. This letter sets out what the internship is, what it asks of you, and what it does not promise. Please read it in full before signing.',
        ],
      },
      {
        heading: 'What the internship is',
        body: [
          'The AI Internship is a full-time, fully online apprenticeship in which you work on real Colaberry AI projects alongside the training programme. You will be assigned a manager and will be accountable for your own KPIs and your projects\' KPIs.',
          'It is open-ended. There is no fixed end date: the internship runs until you secure a full-time role in the AI field, at which point we ask for one to two weeks\' notice.',
        ],
      },
      {
        heading: 'What we ask of you',
        body: [],
        bullets: [
          `At least ${HOURS} hours a week.`,
          'Attendance at the required internship and class meetings, and notice to the team before any meeting you cannot attend.',
          `Work on as many as ${PROJECTS} active projects at a time.`,
          'You are not employed full time elsewhere for the duration of the internship.',
          'Your own Claude Code account and your own API key with billing available. You obtain and pay for these directly.',
        ],
      },
      {
        heading: 'This is not employment, and it is not paid',
        body: [
          'Colaberry does not pay a stipend, salary, or other compensation for the internship. This letter does not create an employment relationship, a contract of employment, or any entitlement to wages, benefits, or continued participation.',
          'Either you or Colaberry may end your participation at any time.',
        ],
      },
      {
        heading: 'What it costs you',
        body: [
          'The internship is included with Colaberry membership rather than sold separately. Membership is {{membership_monthly_annual}} a month when billed annually, or {{membership_monthly_monthly}} a month billed monthly. If you already pay Colaberry as a current student, the fee is waived.',
          'Separately, and not covered by membership, you pay your own third-party tool costs directly to those providers — typically around {{tooling_monthly_estimate}} a month for a Claude Code subscription and your own API usage.',
        ],
      },
      {
        heading: 'Your credentials stay yours',
        body: [
          'You must never share a password, API key, or other credential with Colaberry staff, with our AI interviewer, or by entering it into the Colaberry platform. We will never ask you for one. If anything claiming to be Colaberry asks you for a credential, it is not us — stop and tell us.',
        ],
      },
      {
        heading: 'Signing',
        body: [
          'Print this letter, sign and date it by hand, and upload the signed copy to your portal. We cannot start you until we have it.',
          'Document ID {{document_public_id}} · Template version {{template_version}} · Generated {{generated_on}}',
        ],
      },
      {
        heading: 'Signature',
        body: [
          'Signed: ______________________________________',
          'Print name: __________________________________',
          'Date: ________________________________________',
        ],
      },
    ],
  },

  ip_agreement: {
    key: 'ip_agreement',
    version: 1,
    title: 'Intellectual Property and Confidentiality Agreement',
    requirement: 'always',
    why: 'You will work on real client projects, so this covers who owns the work and what stays confidential.',
    requires_signature: true,
    sections: [
      {
        body: [
          'This agreement is between Colaberry and {{legal_name}} ("you"), and applies to work you do as part of the Colaberry AI Internship.',
        ],
      },
      {
        heading: 'Work product',
        body: [
          'Work you create in the course of an assigned Colaberry project, using Colaberry or client materials, belongs to Colaberry or to the client as the relevant engagement specifies.',
          'This does not extend to work you do on your own time, with your own materials, outside your assigned projects. Your personal projects remain yours.',
        ],
      },
      {
        heading: 'Confidentiality',
        body: [
          'Client data, client identities where not public, project documents, and internal materials are confidential. Do not publish, repost, or share them, including in a portfolio, without written permission.',
          'You may describe your work in general terms for your own portfolio once a project is complete, provided you name no confidential client detail and check with your manager first.',
        ],
      },
      {
        heading: 'Your own accounts',
        body: [
          'You will use your own Claude Code account and your own API key. You are responsible for their security. Do not put client data into any tool or account that has not been approved for that project.',
        ],
      },
      {
        heading: 'Signature',
        body: [
          'Signed: ______________________________________',
          'Print name: __________________________________',
          'Date: ________________________________________',
          'Document ID {{document_public_id}} · Template version {{template_version}} · Generated {{generated_on}}',
        ],
      },
    ],
  },

  acceptance_acknowledgement: {
    key: 'acceptance_acknowledgement',
    version: 1,
    title: 'Acceptance and Acknowledgement',
    requirement: 'always',
    why: 'A short page confirming you have read the terms and accept them, so nothing rests on assumption.',
    requires_signature: true,
    sections: [
      {
        body: [
          'I, {{legal_name}}, accept the offer of a place on the Colaberry AI Internship and confirm the following.',
        ],
      },
      {
        body: [],
        bullets: [
          `I can commit at least ${HOURS} hours a week and will attend the required meetings.`,
          'I am not employed full time elsewhere.',
          'I understand the internship is unpaid by Colaberry and creates no employment relationship.',
          'I understand the internship requires Colaberry membership, and I understand what that costs.',
          'I have, or will obtain before I start, my own Claude Code account and my own API key with billing available, at my own cost.',
          'I understand I must never share a password or API key with Colaberry staff, with the AI interviewer, or by entering it into the platform.',
          'I have read and signed the Intellectual Property and Confidentiality Agreement.',
        ],
      },
      {
        heading: 'Signature',
        body: [
          'Signed: ______________________________________',
          'Print name: __________________________________',
          'Date: ________________________________________',
          'Document ID {{document_public_id}} · Template version {{template_version}} · Generated {{generated_on}}',
        ],
      },
    ],
  },

  recording_consent: {
    key: 'recording_consent',
    version: 1,
    title: 'Call Recording and Transcription Consent',
    requirement: 'conditional',
    why: 'Only needed when a written record of recording consent is required separately from the portal tick-box.',
    requires_signature: true,
    sections: [
      {
        body: [
          'I, {{legal_name}}, consent to Colaberry recording and transcribing AI interviewer calls made to me in connection with my AI Internship application.',
          'I understand that I may withdraw this consent at any time, that withdrawing it will not affect my application, and that I can complete any remaining interview questions in writing instead.',
        ],
      },
      {
        heading: 'Signature',
        body: [
          'Signed: ______________________________________',
          'Date: ________________________________________',
          'Document ID {{document_public_id}} · Template version {{template_version}} · Generated {{generated_on}}',
        ],
      },
    ],
  },

  conditional_approval_addendum: {
    key: 'conditional_approval_addendum',
    version: 1,
    title: 'Conditional Approval Addendum',
    requirement: 'conditional',
    why: 'Records the specific conditions attached to your approval, so nothing depends on remembering a conversation.',
    requires_signature: true,
    sections: [
      {
        body: [
          'Your place on the Colaberry AI Internship is offered subject to the conditions below. This addendum forms part of your offer letter.',
        ],
      },
      {
        heading: 'Conditions',
        body: ['{{conditions}}'],
      },
      {
        body: [
          'Your place is not confirmed and you cannot start until these conditions are met. If they cannot be met, tell us — we would rather adjust than have you arrive unable to start.',
        ],
      },
      {
        heading: 'Signature',
        body: [
          'Signed: ______________________________________',
          'Date: ________________________________________',
          'Document ID {{document_public_id}} · Template version {{template_version}} · Generated {{generated_on}}',
        ],
      },
    ],
  },

  work_authorization_request: {
    key: 'work_authorization_request',
    version: 1,
    title: 'Work Authorisation Documents — What We Need',
    requirement: 'conditional',
    why: 'Included when your intake indicated CPT, OPT, EAD, or university placement paperwork.',
    // Instructions, not a signature page.
    requires_signature: false,
    sections: [
      {
        body: [
          'Your application indicated that work-authorisation paperwork applies to you. This page says what to upload. It does not need signing.',
        ],
      },
      {
        heading: 'What to upload',
        body: [],
        bullets: [
          'CPT: your I-20 with the CPT authorisation page, and your school\'s authorisation letter if it issues one.',
          'OPT or STEM OPT: your EAD card, front and back.',
          'EAD: your EAD card, front and back.',
          'University placement: whatever form your institution requires us to complete, and the name and email of the person who signs it.',
          'Not sure: upload what you have and say what you are unsure about. We would rather look at it than have you guess.',
        ],
      },
      {
        body: [
          'Colaberry does not provide immigration advice, and nothing here should be relied on as such. Check with your institution\'s international office about what your status allows.',
          'Document ID {{document_public_id}} · Template version {{template_version}} · Generated {{generated_on}}',
        ],
      },
    ],
  },
};

export const TEMPLATE_KEYS = Object.keys(DOCUMENT_TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DOCUMENT_TEMPLATES, value);
}

export function documentTemplate(key: TemplateKey): DocumentTemplate {
  return DOCUMENT_TEMPLATES[key];
}

/**
 * Which documents this particular applicant must sign.
 *
 * Per-applicant rather than a fixed list: "Do not activate cohort membership until
 * all documents marked required for THAT APPLICANT have been verified." Someone on
 * OPT has a work-authorisation page in their pack and someone who needs no visa
 * paperwork does not, and neither should be blocked on the other's document.
 */
export function requiredTemplatesFor(params: {
  workAuthCategory?: string | null;
  hasConditions: boolean;
  needsWrittenRecordingConsent?: boolean;
}): TemplateKey[] {
  const keys: TemplateKey[] = [
    'unpaid_internship_offer',
    'ip_agreement',
    'acceptance_acknowledgement',
  ];

  if (params.hasConditions) keys.push('conditional_approval_addendum');
  if (params.needsWrittenRecordingConsent) keys.push('recording_consent');

  const wa = (params.workAuthCategory || '').toLowerCase();
  // 'none' and 'other' are excluded deliberately: 'none' means no paperwork
  // applies, and 'other' is too vague to generate a document about — a reviewer
  // asks instead. 'unsure' IS included, because someone who does not know is
  // exactly who needs the page telling them what to send.
  if (['cpt', 'opt', 'ead', 'university_placement', 'unsure'].includes(wa)) {
    keys.push('work_authorization_request');
  }

  return keys;
}

/** Substitute `{{placeholders}}`. An unknown placeholder is left visible, never blanked. */
export function interpolate(text: string, facts: DocumentFacts): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const value = (facts as unknown as Record<string, unknown>)[key];
    if (value === null || value === undefined || value === '') {
      // Leaving the marker visible is deliberate. A silently blanked placeholder
      // produces a letter reading "Membership is  a month", which looks like a
      // typo and gets signed; a visible {{marker}} is obviously a bug and gets
      // caught before anyone signs it.
      return whole;
    }
    return String(value);
  });
}
