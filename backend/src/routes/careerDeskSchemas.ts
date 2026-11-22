import { z } from 'zod';
import { INTERVIEW_ACTIONS, ITEM_ACTIONS } from '../services/placement/careerDeskQueue';
import { INVOICE_STATUSES } from '../services/placement/careerDeskViews';

/**
 * Career Prep v27, CP11.1: the staff desk's request shapes (strict: an unknown key is a 400) and its response contracts
 * (routes/campusRoutes.sendValidated: a mismatch throws in development and is logged in production).
 */
export const Uuid = z.string().uuid();
export const BigId = z.string().regex(/^[1-9][0-9]{0,17}$/);
const note = z.string().trim().max(500).optional();

export const ItemActionBody = z.object({ action: z.enum(ITEM_ACTIONS), enrollmentId: Uuid.optional(), note }).strict()
  .refine((b) => b.action !== 'match' || Boolean(b.enrollmentId), { message: 'Pick the learner to match.' });
export const InterviewActionBody = z.object({ action: z.enum(INTERVIEW_ACTIONS), contactEmail: z.string().trim().toLowerCase().email().max(254).optional(), note }).strict();
export const TypeBody = z.object({ type: z.enum(['recruiter', 'hiring_manager', 'technical', 'behavioral']) }).strict();
export const ForwardingBody = z.object({ action: z.enum(['open', 'confirm']) }).strict();
export const InvoiceBody = z.object({ status: z.enum(INVOICE_STATUSES) }).strict();
export const PutForwardBody = z.object({ enrollmentId: Uuid }).strict();

const when = z.string();
const text = z.string().nullable();
const switchState = z.enum(['on', 'off', 'unreadable']);
const recording = z.object({ status: z.literal('scope_missing'), note: z.string(), since: when }).nullable();

export const OverviewResponse = z.object({
  recruiters: z.array(z.object({ name: z.string() })), switches: z.object({ employerMail: switchState, inboxTests: switchState }), recording, heldNote: z.string(),
}).strict();

const QueueItem = z.object({
  source: z.enum(['item', 'interview']), id: z.string(), kind: z.string(), title: z.string(), detail: text, learner: text, enrollmentId: text, interviewId: text,
  company: text, position: text, subject: text, confidence: z.number().nullable(), since: when, needsContact: z.boolean(),
  related: z.array(z.object({ interviewId: z.string(), company: text, position: text, state: z.string(), startsAt: text }).strict()),
  actions: z.array(z.object({ action: z.string(), label: z.string() }).strict()),
}).strict();
const Held = z.object({ interviewId: z.string(), learner: text, enrollmentId: z.string(), company: text, position: text, hasContact: z.boolean(), heldAt: when, heldLabel: z.string(),
  action: z.object({ action: z.literal('send_link'), label: z.string() }).strict() }).strict();
export const QueueResponse = z.object({ items: z.array(QueueItem), held: z.array(Held), heldNote: z.string() }).strict();

export const InboxesResponse = z.object({ testsSwitch: switchState, learners: z.array(z.object({
  enrollmentId: z.string(), learner: text, address: text, health: z.string(), healthLabel: z.string(), lastForwardedAt: text, lastForwardedLabel: text,
  last30Days: z.number(), lastTestAt: text, lastTestMs: z.number().nullable(), confirmationPending: z.boolean(), canSendTest: z.boolean() }).strict()) }).strict();

export const BookingsResponse = z.object({ recording, bookings: z.array(z.object({
  interviewId: z.string(), enrollmentId: z.string(), learner: text, company: text, position: text, type: text, typeLine: z.string(), interviewers: z.array(z.string()),
  startsAt: when, startsLabel: z.string(), minutes: z.number(), state: z.string(), stateLabel: z.string(), recording: text }).strict()) }).strict();

export const PlacementsResponse = z.object({
  feeRate: z.object({ rate: z.number(), label: z.string() }).strict(),
  kpis: z.object({ openOffers: z.number(), accepted: z.number(), fees: z.string(), invoiced: z.string(), paid: z.string() }).strict(),
  offers: z.array(z.object({ offerId: z.string(), enrollmentId: z.string(), learner: text, client: text, company: z.string(), role: z.string(), pay: z.string(),
    firstYear: z.string(), feeRate: z.string(), fee: z.string(), feeCents: z.number(), status: z.string(), statusLabel: z.string(), startDate: text, sentAt: when,
    invoice: z.object({ id: z.string(), status: z.string(), statusLabel: z.string() }).strict().nullable() }).strict()),
  clients: z.array(z.object({ id: z.string(), name: z.string(), candidates: z.number() }).strict()),
}).strict();

export const ActionResponse = z.object({ outcome: z.string(), message: z.string(), interviewId: z.string().optional(), link: text.optional(), code: text.optional() }).strict();
