import { RawCandidateItem } from '../../sources/caseSourceAdapter';
import { normalizeSubject } from '../../textNormalization';

// Synthetic fixture for the "resolve everything involving Kes" scenario
// (root directive section 20). Entirely fabricated example.com identities —
// no real names, addresses, or Basecamp IDs. Models seven inbox-style
// emails across three genuinely distinct threads, one informational email
// that only mentions the name in passing, one Basecamp record unrelated to
// any of the three threads, and one prior sent reply used as context.

function item(overrides: Partial<RawCandidateItem>): RawCandidateItem {
  const title = overrides.title || '(no subject)';
  return {
    source_type: 'email',
    source_id: Math.random().toString(36).slice(2),
    provider: 'gmail_colaberry',
    source_url: null,
    title,
    occurred_at: new Date('2026-07-01T12:00:00Z'),
    participants: [],
    subject_normalized: normalizeSubject(title),
    thread_id: null,
    message_id: null,
    in_reply_to: [],
    basecamp_refs: [],
    attachment_names: [],
    body_excerpt: '',
    snapshot: {},
    ...overrides,
  };
}

// Case A: a decision Ali owes (NEEDS_ALI candidate) — thread K1, 2 messages.
export const k1Msg1 = item({
  title: 'Kes travel reimbursement — need your decision',
  thread_id: 'thread-k1',
  message_id: '<k1-1@example.com>',
  participants: ['kes@example.com', 'ali@example.com'],
  body_excerpt: 'Kes submitted a reimbursement above the standard cap. Ali, can you approve the exception or should we cap it at policy?',
});
export const k1Msg2 = item({
  title: 'Re: Kes travel reimbursement — need your decision',
  thread_id: 'thread-k1',
  message_id: '<k1-2@example.com>',
  in_reply_to: ['<k1-1@example.com>'],
  participants: ['kes@example.com', 'ali@example.com'],
  body_excerpt: 'Following up — still waiting on your call here.',
});
export const k1SentReply = item({
  source_type: 'sent_email',
  title: 'Re: Kes travel reimbursement — need your decision',
  thread_id: 'thread-k1',
  message_id: '<k1-sent@example.com>',
  in_reply_to: ['<k1-1@example.com>'],
  participants: ['ali@example.com', 'kes@example.com'],
  body_excerpt: 'Approved at policy cap, thanks for flagging.',
});

// Case B: a missing-evidence issue (referenced attachment never actually
// attached) — thread K2, 2 messages + 1 Basecamp notification email that
// references the SAME Basecamp todo as a K2 message, so it merges via the
// shared Basecamp reference rather than via subject text.
const K2_BC_REF = { url: 'https://3.basecamp.com/1/buckets/9/todos/555', accountId: '1', projectId: '9', recordingType: 'todos', recordingId: '555' };
export const k2Msg1 = item({
  title: 'Vendor onboarding checklist for Kes',
  thread_id: 'thread-k2',
  message_id: '<k2-1@example.com>',
  participants: ['kes@example.com', 'vendor@example.com'],
  body_excerpt: 'See the attached signed W9 for the new vendor. Basecamp task: https://3.basecamp.com/1/buckets/9/todos/555',
  basecamp_refs: [K2_BC_REF],
  attachment_names: [], // the email SAYS "attached" but nothing was actually attached
});
export const k2Msg2 = item({
  title: 'Re: Vendor onboarding checklist for Kes',
  thread_id: 'thread-k2',
  message_id: '<k2-2@example.com>',
  in_reply_to: ['<k2-1@example.com>'],
  participants: ['kes@example.com', 'vendor@example.com'],
  body_excerpt: 'Still don’t see the W9 attached, can you resend?',
});
export const k2BasecampNotification = item({
  title: '[Basecamp] Kes commented on Vendor onboarding checklist',
  participants: ['notifications@basecamp.com', 'ali@example.com'],
  body_excerpt: 'Kes: "Resending the W9 today." https://3.basecamp.com/1/buckets/9/todos/555',
  basecamp_refs: [K2_BC_REF],
});

// Case C: a standalone WAITING-shaped case — thread K3, 1 message, no reply
// yet, so it forms its own singleton case rather than merging with A or B.
export const k3Msg1 = item({
  title: 'Kes payroll question',
  thread_id: 'thread-k3',
  message_id: '<k3-1@example.com>',
  participants: ['kes@example.com', 'payroll@example.com'],
  body_excerpt: 'Kes asked about a payroll discrepancy, waiting on payroll to confirm the correction.',
});

// Unrelated Basecamp record — different project entirely, shares only the
// bare name "Kes" as an assignee, must NOT be pulled into cases A/B/C.
const UNRELATED_BC_REF = { url: 'https://3.basecamp.com/1/buckets/40/todos/900', accountId: '1', projectId: '40', recordingType: 'todos', recordingId: '900' };
export const unrelatedBasecampNotification = item({
  title: '[Basecamp] Kes assigned to Marketing Newsletter Task',
  participants: ['notifications@basecamp.com'],
  body_excerpt: 'Kes was assigned to a completely unrelated marketing to-do. https://3.basecamp.com/1/buckets/40/todos/900',
  basecamp_refs: [UNRELATED_BC_REF],
});

// Purely informational — name mentioned once, no thread/basecamp linkage,
// no participant overlap with any of A/B/C. Should score as weak/ambiguous
// and be excluded from case formation entirely.
export const informationalEmail = item({
  title: 'Company newsletter — Q3 highlights',
  participants: ['newsletter@example.com', 'ali@example.com'],
  body_excerpt: 'Congrats to Kes and the whole team on a great quarter! Also: office snacks restocked.',
});

export const kesGmailCandidates: RawCandidateItem[] = [
  k1Msg1,
  k1Msg2,
  k1SentReply,
  k2Msg1,
  k2Msg2,
  k2BasecampNotification,
  k3Msg1,
  unrelatedBasecampNotification,
  informationalEmail,
];

export const kesBasecampCandidates: RawCandidateItem[] = [
  item({
    source_type: 'basecamp_todo',
    provider: 'basecamp',
    title: 'Vendor onboarding checklist',
    source_url: K2_BC_REF.url,
    source_id: K2_BC_REF.recordingId,
    basecamp_refs: [K2_BC_REF],
    body_excerpt: 'Collect signed W9 from new vendor before payment can be released.',
  }),
  item({
    source_type: 'basecamp_todo',
    provider: 'basecamp',
    title: 'Marketing Newsletter Task',
    source_url: UNRELATED_BC_REF.url,
    source_id: UNRELATED_BC_REF.recordingId,
    basecamp_refs: [UNRELATED_BC_REF],
    body_excerpt: 'Draft the Q3 marketing newsletter.',
  }),
];
