/**
 * Explorer Growth OS — inbound reply routing. Plan §15.5, §21.3; EPIC 8.
 *
 * Plan §21.3: "Explorer campaigns must NOT use the bypassing auto-reply path."
 *
 * WHAT IT BYPASSES, CONCRETELY. The lead auto-reply block in
 * `mandrillWebhookController` calls `generateMessage` and hands the result
 * straight to nodemailer. It never passes through `messageValidatorService`, so
 * none of the validator's guards apply to it — including the Explorer fact
 * guard, which exists precisely to stop a generated message asserting a date or
 * price nobody resolved. An Explorer reply reaching that path would be answered
 * by an unvalidated generator.
 *
 * So this router's job is mostly to say NO on behalf of Explorer learners:
 * classify the reply, record what it means, and stop the bypassing path from
 * running. Nothing here sends anything, and there is no code path in this file
 * that can.
 *
 * ADDITIVE BY CONSTRUCTION. `shouldRouteExplorerReply` returns false whenever
 * the flag is off or the sender is not a known Explorer, which is every
 * existing campaign in the system. A lead who is not an Explorer takes exactly
 * the path they took before this file existed.
 */
import { ExplorerJourneyProfile } from '../../models';
import { env } from '../../config/env';
import { isExplorerFeatureEnabled } from '../../config/explorerGrowthFlags';
import { classifyExplorerReply, type Classification } from './explorerReplyClassifier';

export interface ExplorerReplyContext {
  /** Resolved Explorer enrollment, or null when this sender is not one. */
  enrollmentId: string | null;
  /** `EXPLORER_GROWTH_OS_ENABLED` && `EXPLORER_COMMERCIAL_ENABLED`-style gate. */
  flagEnabled: boolean;
}

/**
 * Should the Explorer path handle this reply at all?
 *
 * Both conditions, and both fail closed. An unknown sender is not an Explorer,
 * and a flag we could not read is off.
 */
export function shouldRouteExplorerReply(ctx: ExplorerReplyContext): boolean {
  return ctx.flagEnabled === true && typeof ctx.enrollmentId === 'string' && ctx.enrollmentId.length > 0;
}

export interface ExplorerReplyOutcome {
  handled: boolean;
  /** Null when not handled. */
  classification: Classification | null;
  /**
   * Whether the caller must skip its own auto-reply.
   *
   * TRUE WHENEVER WE HANDLED IT, without exception — including when
   * classification fell back to OTHER. "We could not classify this" is not a
   * licence for an unvalidated generator to answer instead; it is the strongest
   * reason to stay quiet.
   */
  suppressAutoReply: boolean;
}

/** Not an Explorer, or the flag is off: the caller proceeds exactly as before. */
export const NOT_HANDLED: ExplorerReplyOutcome = {
  handled: false,
  classification: null,
  suppressAutoReply: false,
};

/**
 * Decide what happens to one inbound Explorer reply.
 *
 * Pure. The model classification is passed in and persistence is the caller's
 * job, so the routing decision — the part that determines whether a real person
 * receives an automated email — is testable with no I/O at all.
 */
export function routeExplorerReply(
  ctx: ExplorerReplyContext,
  body: string,
  modelClass: string | null = null,
): ExplorerReplyOutcome {
  if (!shouldRouteExplorerReply(ctx)) return NOT_HANDLED;

  return {
    handled: true,
    classification: classifyExplorerReply(body, modelClass),
    suppressAutoReply: true,
  };
}

/**
 * The I/O wrapper the webhook calls: is this lead an Explorer, and is the
 * feature on?
 *
 * Read through `isExplorerFeatureEnabled` so BOTH the master flag and the
 * sub-flag must be on — a direct sub-flag read would let this run with the
 * master switch off, and a guard test scans backend source for exactly that.
 *
 * NO MODEL CALL YET. Classification runs on deterministic rules alone, which
 * means opt-out detection works and everything else lands as OTHER →
 * RECORD_ONLY. That is deliberate for the first deployment: the routing change
 * is the risky part, and adding an LLM call to the inbound webhook in the same
 * change would make a failure impossible to attribute.
 *
 * THROWS RATHER THAN GUESSING. The caller fails closed on an exception — see
 * the webhook — because "we could not tell whether this is an Explorer" must
 * not become "assume they are not one" and answer with an unvalidated
 * generator.
 */
export async function resolveExplorerReplyRouting(
  leadId: string | number,
  body: string,
): Promise<ExplorerReplyOutcome> {
  if (!isExplorerFeatureEnabled('journeyIntelligence', env.explorerGrowth)) {
    return NOT_HANDLED;
  }

  const profile = (await ExplorerJourneyProfile.findOne({
    where: { lead_id: leadId } as any,
    attributes: ['enrollment_id'],
  })) as { enrollment_id: string } | null;

  return routeExplorerReply(
    { enrollmentId: profile?.enrollment_id ?? null, flagEnabled: true },
    body,
    null,
  );
}
