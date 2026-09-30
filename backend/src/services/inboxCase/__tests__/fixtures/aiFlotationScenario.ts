import { RawCandidateItem } from '../../sources/caseSourceAdapter';
import { normalizeSubject } from '../../textNormalization';

// Synthetic fixture for the "AI Flotation LLC" topic-resolution scenario
// (root directive section 20). Entirely fabricated example.com identities.
// Models subject variations (exact / Fwd: / a differently-worded subject
// still about the same company), a forwarded internal message, several
// participants, a Basecamp project reference, sent-mail context, one
// unresolved ownership question, and one waiting-on-third-party commitment.

function item(overrides: Partial<RawCandidateItem>): RawCandidateItem {
  const title = overrides.title || '(no subject)';
  return {
    source_type: 'email',
    source_id: Math.random().toString(36).slice(2),
    provider: 'gmail_colaberry',
    source_url: null,
    title,
    occurred_at: new Date('2026-07-05T09:00:00Z'),
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

const AGREEMENT_BC_REF = { url: 'https://3.basecamp.com/1/buckets/77/todos/301', accountId: '1', projectId: '77', recordingType: 'todos', recordingId: '301' };

// Thread T1: the exact-phrase match, plus an internal Fwd: with the SAME
// normalized subject (prefix-stripped), plus a prior sent reply.
export const t1Original = item({
  title: 'AI Flotation LLC — Services Agreement',
  thread_id: 'thread-t1',
  message_id: '<t1-1@example.com>',
  participants: ['prospect@aiflotation.example.com', 'ali@example.com'],
  body_excerpt: 'Attaching the draft services agreement for AI Flotation LLC for your review. Basecamp: https://3.basecamp.com/1/buckets/77/todos/301',
  basecamp_refs: [AGREEMENT_BC_REF],
});
export const t1Forward = item({
  title: 'Fwd: AI Flotation LLC — Services Agreement',
  thread_id: 'thread-t1',
  message_id: '<t1-2@example.com>',
  in_reply_to: ['<t1-1@example.com>'],
  participants: ['ali@example.com', 'ram@example.com'],
  body_excerpt: 'Ram, can you take a look at this before we sign?',
});
export const t1SentReply = item({
  source_type: 'sent_email',
  title: 'Re: AI Flotation LLC — Services Agreement',
  thread_id: 'thread-t1',
  message_id: '<t1-sent@example.com>',
  in_reply_to: ['<t1-1@example.com>'],
  participants: ['ali@example.com', 'prospect@aiflotation.example.com'],
  body_excerpt: 'Reviewed, a few redlines attached, let us know if these work.',
});

// Thread T2: a different exact subject, still about the same company —
// the "waiting on a third party" commitment.
export const t2Invoice = item({
  title: 'RE: AI Flotation LLC Invoice #204',
  thread_id: 'thread-t2',
  message_id: '<t2-1@example.com>',
  participants: ['billing@aiflotation.example.com', 'ali@example.com'],
  body_excerpt: 'AI Flotation LLC confirmed payment will be sent by their finance team next week — waiting on them to send the wire confirmation.',
});

// Thread T3: an internal, unresolved ownership question — must NOT merge
// with T1/T2 (different thread, different participants, only the company
// name in common).
export const t3OwnershipQuestion = item({
  title: 'Who owns the AI Flotation relationship?',
  thread_id: 'thread-t3',
  message_id: '<t3-1@example.com>',
  participants: ['ram@example.com', 'ali@example.com'],
  body_excerpt: 'Is this AI Flotation LLC opportunity Ram’s or Ali’s to drive? Sales isn’t sure who to loop the prospect through.',
});

export const aiFlotationGmailCandidates: RawCandidateItem[] = [
  t1Original,
  t1Forward,
  t1SentReply,
  t2Invoice,
  t3OwnershipQuestion,
];

export const aiFlotationBasecampCandidates: RawCandidateItem[] = [
  item({
    source_type: 'basecamp_todo',
    provider: 'basecamp',
    title: 'AI Flotation LLC — Services Agreement signature',
    source_url: AGREEMENT_BC_REF.url,
    source_id: AGREEMENT_BC_REF.recordingId,
    basecamp_refs: [AGREEMENT_BC_REF],
    body_excerpt: 'Track signature status on the AI Flotation LLC services agreement.',
  }),
];
