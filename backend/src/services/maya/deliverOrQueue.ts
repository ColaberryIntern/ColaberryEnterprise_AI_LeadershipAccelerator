import { createBooking, type BookingResult } from '../calendarService';
import { sendStrategyCallConfirmation, renderAdmissionsDocument } from '../emailService';
import { sendSmsViaGhl } from '../ghlService';
import { routeLeadToCampaign } from '../mayaCampaignRouter';
import type { CalendarTarget } from '../calendarTarget';
import { resolveMayaMode, type MayaMode } from './mayaPromotion';
import { enqueueOutbound } from './mayaOutboundQueue';
import type { MayaToolCapability } from './mayaToolGovernance';
import { capabilityRefusalSentence } from './mayaToolGate';

/**
 * THE SEAM. Every effect of Maya's that can reach a real person passes through this module, and
 * this is the only module allowed to name the providers that do the reaching.
 *
 * -- WHY THE GATE IS ON THE EFFECT AND NOT ON THE TOOL --
 *
 * The obvious design is to gate the TOOL: look up the tool's capability, refuse if it is off.
 * An independent audit of that design found it leaks, and the example is `schedule_strategy_call`.
 * One tool call reached a person FOUR separate ways, at four call sites, all of them before a
 * tool-level gate would have had anything to show for itself:
 *
 *   createBooking                  a Google Calendar event with the visitor as an attendee,
 *                                  plus a 60-minute email reminder Google sends itself
 *   sendStrategyCallConfirmation   a confirmation email
 *   sendSmsViaGhl                  writes `cory_sms_composed`, which TRIGGERS a GoHighLevel
 *                                  workflow - an external automation we do not control
 *   routeLeadToCampaign(...)       fire-and-forget, error swallowed, straight into the cron
 *     .catch(() => {})             chain that composes bodies with AI at send time
 *
 * Gating the tool would have meant one answer for four different effects with four different
 * risk profiles. The audit's prescription was to turn booking off. That was not applied:
 * booking works today, a visitor who asks for a meeting is not Maya reaching out, and turning
 * off a working feature is a regression dressed as safety.
 *
 * So the gate moved down to the effect. Each function below resolves ITS OWN capability,
 * whatever tool invoked it. Booking therefore keeps working exactly as it does today, while the
 * SMS it used to fire resolves `sendSmsSummary` (refused) and the campaign enrolment resolves
 * `enrollInCampaign` (refused). The audit reviewed this and withdrew its prescription, because
 * `routeLeadToCampaign` has four call sites and tool-level gating would have left two open.
 *
 * -- THE FOUR MODES, AND WHAT EACH ONE MEANS HERE --
 *
 *   off     refuse by name and say why. The provider is never called.
 *   shadow  the caller composed; nothing is delivered and nothing is queued. A dry run.
 *   review  the rendered message is QUEUED. It leaves only when a named person approves it.
 *   live    deliver now, still consent-checked and still idempotent.
 *
 * `review` only means something for an effect whose message can be rendered before send time.
 * An effect that defers composition - campaign enrolment, whose bodies are written by a cron
 * hours later - cannot be queued, because the row would not BE the message. Those capabilities
 * are refused rather than queued, and the refusal is in `mayaPromotion.REFUSED_CAPABILITIES`.
 */

export type EffectOutcome = 'delivered' | 'queued' | 'refused' | 'shadowed' | 'failed';

export interface EffectResult<T = void> {
  outcome: EffectOutcome;
  capability: MayaToolCapability;
  mode: MayaMode;
  /** A sentence fit to show a person. Never a stack trace, never a provider error body. */
  message: string;
  /**
   * The operator-facing reason, for the structured log and the audit row. NEVER relayed to the
   * person: a provider's error text can carry a URL, a contact id or an upstream payload.
   *
   * This field exists because the first version of the seam did not have it, and an existing
   * test caught what that cost. `smsTool.ts` carries a long comment about a defect where
   * `sendSmsViaGhl`'s return value was discarded: it returns `{ success: false, error }`
   * WITHOUT throwing, so a GoHighLevel rejection was logged as a completed send. Collapsing
   * every non-delivery into one word would have reintroduced exactly that blindness one layer
   * up.
   */
  detail?: string;
  /** Present only when the effect actually ran. */
  value?: T;
}

function log(event: string, capability: MayaToolCapability, mode: MayaMode, outcome: EffectOutcome, context: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'refused' ? 'warn' : 'info',
    service: 'maya', event, outcome: outcome === 'delivered' ? 'success' : 'partial',
    context: { capability, mode, effect_outcome: outcome, ...context },
  }));
}

/**
 * The shared decision. Resolves the capability's mode and runs exactly one of four branches.
 *
 * `onLive` is the only path that reaches a provider, and it is passed in as a closure so the
 * provider call physically cannot happen before the mode is known. An `if (mode === 'live')`
 * written by each caller would be the same logic with N chances to forget it.
 */
async function gate<T>(
  capability: MayaToolCapability,
  effect: string,
  handlers: {
    onLive: () => Promise<T>;
    onQueue?: () => Promise<{ queued: boolean; message: string }>;
    liveMessage?: (value: T) => string;
  },
  context: Record<string, unknown> = {},
): Promise<EffectResult<T>> {
  const { mode } = await resolveMayaMode(capability);

  if (mode === 'off') {
    log(`maya_effect_refused:${effect}`, capability, mode, 'refused', context);
    return { outcome: 'refused', capability, mode, message: capabilityRefusalSentence(capability) };
  }

  if (mode === 'shadow') {
    log(`maya_effect_shadowed:${effect}`, capability, mode, 'shadowed', context);
    return {
      outcome: 'shadowed', capability, mode,
      message: 'I have made a note of this. Nothing has been sent while this is still being reviewed.',
    };
  }

  if (mode === 'review') {
    if (!handlers.onQueue) {
      // An effect with no queue handler cannot be held for approval, so `review` must not
      // silently fall through to delivery. Refusing is the only safe reading.
      log(`maya_effect_unqueueable:${effect}`, capability, mode, 'refused', context);
      return {
        outcome: 'refused', capability, mode,
        message: 'A person needs to handle that one. I have not done it myself.',
      };
    }
    const queued = await handlers.onQueue();
    log(`maya_effect_queued:${effect}`, capability, mode, 'queued', context);
    return { outcome: queued.queued ? 'queued' : 'refused', capability, mode, message: queued.message };
  }

  // A PROVIDER REJECTION IS NOT A DELIVERY, and some of these providers say no by returning
  // rather than throwing. `sendSmsViaGhl` is the one with history: it returns
  // `{ success: false, error }` on any GoHighLevel failure without throwing, which once caused
  // a rejected write to be logged as a completed send and relayed to the visitor as "sent".
  // Each `onLive` below is responsible for THROWING on a rejection its provider reports by
  // return value, and this catch turns that into a `failed` outcome carrying the reason.
  try {
    const value = await handlers.onLive();
    log(`maya_effect_delivered:${effect}`, capability, mode, 'delivered', context);
    return {
      outcome: 'delivered', capability, mode, value,
      message: handlers.liveMessage ? handlers.liveMessage(value) : 'Done.',
    };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    log(`maya_effect_failed:${effect}`, capability, mode, 'failed', { ...context, detail });
    return {
      outcome: 'failed', capability, mode, detail,
      // Deliberately does NOT say it was sent, and deliberately does not repeat `detail`.
      message: 'That did not go through just now. I have logged it so a member of the team can '
        + 'pick it up.',
    };
  }
}

// ─── The effects ────────────────────────────────────────────────────────────

export interface CalendarEventInput {
  name: string; email: string; company: string; phone: string;
  slotStart: string; timezone: string;
  /** The resolved calendar, passed in so this module needs no opinion about which one. */
  calendar: CalendarTarget;
}

/**
 * The calendar write. `bookStrategyCall` at live, which is the ONE declared exception to the
 * per-message approval invariant:
 *
 *   TRANSACTIONAL RECEIPT POLICY. An effect may be live without per-message approval only if it
 *   is a receipt of an action the person themselves just performed, addressed to that person,
 *   and its body is a fixed, reviewed template limited to the facts of that transaction - what,
 *   when, with whom, how to join or cancel - composed before send time, one per transaction.
 *   Outreach never qualifies.
 *
 * A visitor who picked a time is asking for this. A test pins the exemption to this effect and
 * the confirmation below, so nothing else can inherit it quietly.
 */
export function bookCalendarEvent(input: CalendarEventInput): Promise<EffectResult<BookingResult>> {
  return gate('bookStrategyCall', 'calendar_invite', {
    onLive: () => createBooking({
      name: input.name, email: input.email, company: input.company,
      phone: input.phone, slotStart: input.slotStart, timezone: input.timezone,
    }, input.calendar),
  }, { slot_start: input.slotStart });
}

export interface BookingConfirmationInput {
  to: string; name: string; scheduledAt: Date; timezone: string; meetLink: string;
}

/** The confirmation email. Same capability, same declared exception, same fixed template. */
export function sendBookingConfirmation(input: BookingConfirmationInput): Promise<EffectResult<string>> {
  return gate('bookStrategyCall', 'booking_confirmation', {
    onLive: () => sendStrategyCallConfirmation(input),
  });
}

/**
 * ANY SMS Maya would cause, from any caller. Resolves `sendSmsSummary`, which is REFUSED BY NAME, so this returns a
 * refusal from every caller including booking.
 *
 * This is the severing that matters most and the one most likely to be read as a regression, so
 * it is worth being exact: booking still books and still confirms. What stops is the text
 * message, which was not a message we composed at all - `sendSmsViaGhl` writes a record that
 * TRIGGERS a GoHighLevel workflow, and what that workflow sends is configured outside this
 * codebase. There is no version of "hold it for approval" for a message we never see.
 */
export function sendSmsToContact(contactId: string, body: string): Promise<EffectResult<void>> {
  return gate('sendSmsSummary', 'sms', {
    onLive: async () => {
      // THE RETURN VALUE IS THE WHOLE POINT. `sendSmsViaGhl` does not throw on a GoHighLevel
      // failure; it returns `{ success: false, error }`. Discarding it is the defect
      // `smsTool.ts` documents at length, where a rejected write was logged as a completed send
      // and relayed to the visitor as "sent". Throwing here is what turns that into a `failed`
      // outcome carrying the provider's reason.
      const sent = await sendSmsViaGhl(contactId, body);
      if (!sent?.success) throw new Error(String(sent?.error ?? 'SmsProviderRejected'));
    },
  });
}

/**
 * Campaign enrolment. Resolves `enrollInCampaign`, REFUSED BY NAME, from every caller.
 *
 * Four call sites reach this today and two of them are in `captureLeadDetails`, which runs on
 * EVERY lead Maya captures. So this is the highest-volume severing in the run, and it is
 * declared rather than discovered: after this ships, capturing a lead captures the lead and
 * does not enrol it.
 *
 * Measured before accepting it, read-only against production on 2026-11-13: 15,618 live
 * campaign leads and 46,015 scheduled emails exist, but the last one actually sent was
 * 2026-08-21, nothing in 84 days, and Maya's own two enrolment actions are both `skipped`. The
 * brand relationship gate has held this path shut since August. Severing it costs nothing
 * operationally today; the point is that the safety was somebody else's gate and this build
 * should not depend on it.
 */
export function enrolLeadInCampaign(
  leadId: number, interestType: string, visitorId: string, conversationId: string,
): Promise<EffectResult<unknown>> {
  return gate('enrollInCampaign', 'campaign_enrolment', {
    onLive: () => routeLeadToCampaign(leadId, interestType, visitorId, conversationId),
  }, { interest_type: interestType });
}

export interface AdmissionsDocumentInput {
  to: string; name: string; documentType: string;
  documentUrl?: string; documentContent?: string;
  recipientRef: string; correlationId: string; visitorId: string;
}

/**
 * The admissions document. `sendDocument` ships at `review`, so this QUEUES.
 *
 * THE BYTES ARE RENDERED HERE, at compose time, and the queue row holds them. That is the whole
 * reason `renderAdmissionsDocument` was split out of `sendAdmissionsDocument`: the HTML used to
 * be assembled inside the sender, so a row holding a summary would have read as reviewed while
 * the message that actually left was produced afterwards from inputs nobody saw. Approval
 * transmits the stored bytes verbatim and re-renders nothing.
 */
export function queueAdmissionsDocument(input: AdmissionsDocumentInput): Promise<EffectResult<string>> {
  const rendered = renderAdmissionsDocument({
    to: input.to, name: input.name, documentType: input.documentType,
    documentUrl: input.documentUrl, documentContent: input.documentContent,
  });

  return gate('sendDocument', 'admissions_document', {
    onLive: async () => {
      if (!rendered) throw new Error('NoDocumentToSend');
      // Even at `live` this goes through the queue's own delivery path rather than calling the
      // sender directly, so there is exactly one way an admissions document leaves.
      const { id } = await enqueueOutbound({
        recipientRef: input.recipientRef, recipientAddress: input.to, recipientDisplay: input.name,
        channel: 'email', subject: rendered.subject, body: rendered.html,
        composedBy: 'send_document', capability: 'sendDocument',
        correlationId: input.correlationId,
        idempotencyKey: `maya-doc-${input.documentType}-${input.visitorId}`,
      });
      return id;
    },
    onQueue: async () => {
      if (!rendered) {
        // No document to send is a refusal, not an empty queue row. A letter describing an
        // enclosure that does not exist is worse than no letter.
        return { queued: false, message: 'I do not have that document to hand right now. I have asked the team to send it to you directly.' };
      }
      await enqueueOutbound({
        recipientRef: input.recipientRef, recipientAddress: input.to, recipientDisplay: input.name,
        channel: 'email', subject: rendered.subject, body: rendered.html,
        composedBy: 'send_document', capability: 'sendDocument',
        correlationId: input.correlationId,
        idempotencyKey: `maya-doc-${input.documentType}-${input.visitorId}`,
      });
      return {
        queued: true,
        message: `I have put the ${input.documentType.replace(/_/g, ' ')} together for you. `
          + 'A member of the team checks every message before it goes out, so it will reach you '
          + 'shortly rather than this second.',
      };
    },
  }, { document_type: input.documentType, recipient_ref: input.recipientRef });
}
