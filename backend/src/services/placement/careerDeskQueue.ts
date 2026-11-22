import { label } from './timeLabel';
import type { ConfirmRow, HeldRow, ItemRow, RelatedRow, ReviewIvRow } from './careerDeskStore';

/**
 * Career Prep v27, CP11.1 (kit F9): the staff desk's REVIEW QUEUE in plain words, and which actions each kind offers.
 * PURE (no I/O, `now` passed in). Two sources feed it:
 *   item       an open placement_review_items row: low_confidence, unmatched_learner, unmatched_update, ambiguous_update,
 *              not_booked, recording_mismatch (every kind the table's CHECK allows).
 *   interview  an interview a person must act on: in `review` (mid confidence, the booking link gave up after its tries,
 *              or no employer address to reply to), or booked with its room and invites given up (confirm_gave_up).
 * Text that came from an email (company, position, subject) has every link removed, so no meeting link can ride
 * along into the desk (provider-URL rule); only named fields are copied out of a summary, never the summary itself.
 */
export const ITEM_KINDS = ['low_confidence', 'unmatched_learner', 'unmatched_update', 'ambiguous_update', 'not_booked', 'recording_mismatch'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export type InterviewKind = 'needs_review' | 'booking_gave_up' | 'no_contact' | 'confirm_gave_up';
export const ITEM_ACTIONS = ['make_interview', 'match', 'handled', 'dismiss', 'nudge', 'called', 'recheck_recording'] as const;
export type ItemAction = (typeof ITEM_ACTIONS)[number];
export const INTERVIEW_ACTIONS = ['send_link', 'not_interview', 'retry_confirm'] as const;
export type InterviewAction = (typeof INTERVIEW_ACTIONS)[number];

export const ACTIONS_FOR: Record<ItemKind | InterviewKind, ReadonlyArray<ItemAction | InterviewAction>> = {
  low_confidence: ['make_interview', 'dismiss'],
  unmatched_learner: ['match', 'dismiss'],
  unmatched_update: ['handled', 'dismiss'],
  ambiguous_update: ['handled', 'dismiss'],
  not_booked: ['nudge', 'called'],
  recording_mismatch: ['recheck_recording'],
  needs_review: ['send_link', 'not_interview'],
  booking_gave_up: ['send_link', 'not_interview'],
  no_contact: ['send_link', 'not_interview'],
  confirm_gave_up: ['retry_confirm'],
};

const TITLE: Record<ItemKind | InterviewKind, string> = {
  low_confidence: 'Low confidence: is this an interview?',
  unmatched_learner: 'No learner matched this email',
  unmatched_update: 'An update matched no open interview',
  ambiguous_update: 'An update matched more than one interview',
  not_booked: 'Not booked in 24 h',
  recording_mismatch: 'Meeting recording does not match consent',
  needs_review: 'Check this interview before the booking link goes',
  booking_gave_up: 'The booking link could not be sent',
  no_contact: 'No employer email to reply to',
  confirm_gave_up: 'The room and invites did not finish',
};

export const ACTION_LABEL: Record<ItemAction | InterviewAction, string> = {
  make_interview: 'Send booking link', match: 'Match and send', handled: 'I updated it by hand', dismiss: 'Not an interview',
  nudge: 'Send a nudge', called: 'I called them', recheck_recording: 'I checked the Zoom meeting',
  send_link: 'Send booking link', not_interview: 'Not an interview', retry_confirm: 'Try the room and invites again',
};

export interface Related { interviewId: string; company: string | null; position: string | null; state: string; startsAt: string | null }
export interface QueueItem {
  source: 'item' | 'interview'; id: string; kind: ItemKind | InterviewKind; title: string; detail: string | null;
  learner: string | null; enrollmentId: string | null; interviewId: string | null; company: string | null; position: string | null;
  subject: string | null; confidence: number | null; since: string; related: Related[];
  needsContact: boolean; actions: Array<{ action: ItemAction | InterviewAction; label: string }>;
}
export interface HeldReply { interviewId: string; learner: string | null; enrollmentId: string; company: string | null; position: string | null;
  hasContact: boolean; heldAt: string; heldLabel: string; action: { action: 'send_link'; label: string } }

const CENTRAL = 'America/Chicago';
const iso = (d: Date | string) => new Date(d).toISOString();
/** Text from an email, trimmed, links removed, capped. */
export function plain(v: unknown, max = 300): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\b(?:https?|wss?):\/\/\S+|\bwww\.\S+/gi, '[link removed]').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const summaryOf = (s: unknown): Record<string, unknown> => {
  if (typeof s === 'string') { try { const p = JSON.parse(s); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
};
const actionsOf = (k: ItemKind | InterviewKind) => ACTIONS_FOR[k].map((action) => ({ action,
  label: action === 'dismiss' && (k === 'unmatched_update' || k === 'ambiguous_update') ? 'Nothing to change' : ACTION_LABEL[action] }));
export const isItemKind = (k: string): k is ItemKind => (ITEM_KINDS as readonly string[]).includes(k);

function relatedFor(r: ItemRow, all: RelatedRow[], s: Record<string, unknown>): Related[] {
  if (r.kind !== 'unmatched_update' && r.kind !== 'ambiguous_update') return [];
  const picked = Array.isArray(s.candidate_interview_ids) ? new Set(s.candidate_interview_ids.map(String)) : null;
  return all.filter((x) => x.enrollment_id === r.enrollment_id && (!picked || r.kind !== 'ambiguous_update' || picked.has(String(x.id))))
    .slice(0, 20).map((x) => ({ interviewId: String(x.id), company: plain(x.company, 200), position: plain(x.position, 200), state: x.state, startsAt: x.starts_at ? iso(x.starts_at) : null }));
}

function itemDetail(kind: ItemKind, s: Record<string, unknown>, now: Date): string | null {
  if (kind === 'recording_mismatch') {
    const seen = s.seen === 'on' || s.seen === 'off' ? s.seen : 'cannot tell';
    return `Zoom says recording is ${seen}; everyone's choice means ${s.expected === 'on' ? 'on' : 'off'}. The join link is withheld until a person checks the Zoom meeting.`;
  }
  if (kind === 'not_booked' && typeof s.link_sent_at === 'string') return `Booking link sent ${label(new Date(s.link_sent_at), CENTRAL)}; still not booked (${label(now, CENTRAL)}).`;
  if (kind === 'unmatched_update') return 'Nothing was changed. The learner\'s interviews are listed (an earlier round of the same company may be the one).';
  if (kind === 'ambiguous_update') return 'Nothing was changed until a person picks which interview it is about.';
  return null;
}

export function itemView(r: ItemRow, all: RelatedRow[], now: Date): QueueItem | null {
  if (!isItemKind(r.kind)) return null;
  const s = summaryOf(r.summary);
  return { source: 'item', id: String(r.id), kind: r.kind, title: TITLE[r.kind], detail: itemDetail(r.kind, s, now), learner: plain(r.full_name, 160),
    enrollmentId: r.enrollment_id, interviewId: r.interview_id, company: plain(s.company, 200), position: plain(s.position, 200), subject: plain(s.subject),
    confidence: num(s.confidence), since: iso(r.created_at), related: relatedFor(r, all, s), needsContact: false, actions: actionsOf(r.kind) };
}

const reviewKind = (reason: string | null): InterviewKind =>
  (reason === 'booking_link_gave_up' ? 'booking_gave_up' : reason === 'booking_link_no_contact' ? 'no_contact' : 'needs_review');

export function reviewInterviewView(r: ReviewIvRow): QueueItem {
  const kind = reviewKind(r.reason);
  const contact = plain(r.contact_email, 254);
  return { source: 'interview', id: String(r.id), kind, title: TITLE[kind],
    detail: contact ? `Employer contact: ${[plain(r.contact_name, 160), contact].filter(Boolean).join(', ')}` : 'No employer email on file: add one to send the booking link.',
    learner: plain(r.full_name, 160), enrollmentId: r.enrollment_id, interviewId: String(r.id), company: plain(r.company, 200), position: plain(r.position, 200),
    subject: null, confidence: num(r.confidence), since: iso(r.updated_at), related: [], needsContact: !contact, actions: actionsOf(kind) };
}

export function confirmView(r: ConfirmRow): QueueItem {
  return { source: 'interview', id: String(r.id), kind: 'confirm_gave_up', title: TITLE.confirm_gave_up,
    detail: `Booked for ${label(new Date(r.starts_at), CENTRAL)}. Check Zoom and email, then try again.`, learner: plain(r.full_name, 160), enrollmentId: r.enrollment_id,
    interviewId: String(r.id), company: plain(r.company, 200), position: plain(r.position, 200), subject: null, confidence: null, since: iso(r.starts_at),
    related: [], needsContact: false, actions: actionsOf('confirm_gave_up') };
}

export function heldView(r: HeldRow): HeldReply {
  return { interviewId: String(r.id), learner: plain(r.full_name, 160), enrollmentId: r.enrollment_id, company: plain(r.company, 200), position: plain(r.position, 200),
    hasContact: Boolean(plain(r.contact_email, 254)), heldAt: iso(r.held_at), heldLabel: label(new Date(r.held_at), CENTRAL),
    action: { action: 'send_link', label: ACTION_LABEL.send_link } };
}

/** Why replies are held, in the desk's words (T16 carry: a momentary switch-read failure also holds one, for good). */
export const HELD_NOTE = 'A booking link is held when employer email was switched off when it was due, or when the switch could not be read at that moment. '
  + 'A held link is never sent later on its own: it waits here until you send it.';
