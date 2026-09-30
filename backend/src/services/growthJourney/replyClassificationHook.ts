import { env } from '../../config/env';
import type { GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { classifyError } from '../../utils/errorClassifier';
import type { ClassifySubjectArgs, ClassifySubjectResult } from './classificationService';

/**
 * The one line a reply webhook adds (Phase 2, T225): record a classification
 * for the reply, AFTER the webhook has done everything it already did.
 *
 * Fire-and-forget by contract. It returns before the classification runs, it
 * never throws, it never awaits anything the caller's response depends on, and
 * it changes no status code — a rejected promise here is logged with its class
 * and nothing else. Opt-out handling, Explorer routing and the auto-reply all
 * happen exactly as before; this only observes.
 *
 * Phase 5 T515: once the classification has resolved - never before, never
 * awaited by the webhook - two more fire-and-forget steps follow it: the reply
 * becomes an outcome on the receipt that sent what it answers
 * (`execution/replyOutcome`), and the subject is decided again under the
 * reply's brands (`execution/replyRedecide`). Both are gated by their own
 * flags and never throw; a rejection anywhere in the chain is the same one
 * logged line.
 *
 * Master-gated through the flags the process resolved at boot (`env.growthJourney`,
 * i.e. the flags module — no environment variable is read here). While the
 * master is off — production today — `classifySubject` returns `disabled`
 * before touching the database.
 *
 * The service is required LAZILY, inside the call, not imported at the top:
 * its import chain constructs the Sequelize instance, and the webhook
 * controllers are loaded by tests that stub `env` without a database URL. The
 * controllers already use this pattern for their own lazy dependencies.
 */

export interface ReplyClassificationArgs {
  leadId: number;
  body: string;
  channel: 'email' | 'sms';
  campaignId: string | null;
  providerMessageId?: string | null;
}

type ClassifySubject = (args: ClassifySubjectArgs) => Promise<ClassifySubjectResult>;

function logHookFailure(channel: string, leadId: number, err: unknown): void {
  console.error(
    JSON.stringify({
      service: 'growth-journey',
      event: 'growth_journey.classification.reply_hook_failed',
      channel,
      lead_id: leadId,
      error_class: classifyError(err),
    }),
  );
}

export function recordReplyClassification(args: ReplyClassificationArgs, flags: GrowthJourneyFlags = env.growthJourney): void {
  let classifySubject: ClassifySubject;
  try {
    ({ classifySubject } = require('./classificationService') as { classifySubject: ClassifySubject });
  } catch (err: unknown) {
    logHookFailure(args.channel, args.leadId, err);
    return;
  }
  const reply = { body: args.body, channel: args.channel, campaign_id: args.campaignId, provider_message_id: args.providerMessageId ?? null };
  void classifySubject({ anchor: { leadId: args.leadId }, trigger: 'reply', extras: { reply }, flags })
    .then(() => afterReplyClassified(args, flags))
    .catch((err: unknown) => logHookFailure(args.channel, args.leadId, err));
}

type RecordReplyOutcome = (a: { leadId: number; campaignId: string | null; providerMessageId: string | null; flags: GrowthJourneyFlags }) => Promise<unknown>;
type RedecideOnReply = (a: { leadId: number; campaignId: string | null; flags: GrowthJourneyFlags }) => Promise<unknown>;

/**
 * T515: what follows a classified reply - the outcome first (the re-decision's context may read it), then the
 * re-decision. Required lazily, as the classifier is, and only with the master on: both steps answer `disabled`
 * themselves when it is off, so nothing is lost, and the modules' import chains (a model file, the database) are never
 * loaded where the master is off - the same rule the inbound auto-reply applies to its guard.
 */
async function afterReplyClassified(args: ReplyClassificationArgs, flags: GrowthJourneyFlags): Promise<void> {
  if (!flags.growthJourneyEnabled) return;
  const { recordReplyOutcome } = require('./execution/replyOutcome') as { recordReplyOutcome: RecordReplyOutcome };
  const { redecideOnReply } = require('./execution/replyRedecide') as { redecideOnReply: RedecideOnReply };
  await recordReplyOutcome({ leadId: args.leadId, campaignId: args.campaignId, providerMessageId: args.providerMessageId ?? null, flags });
  await redecideOnReply({ leadId: args.leadId, campaignId: args.campaignId, flags });
}
