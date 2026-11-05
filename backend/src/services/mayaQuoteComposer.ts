import { findBannedCopy } from './content/bannedCopyMatch';
import { listQuotableAssets, quotableAssetDigest, type QuotableAsset } from './content/quotableAssets';
import { resolveLeadForVisitor } from './mayaToolsService';
import { sendAgentEmail, type AgentEmailResult } from './agents/tools/agentEmailTool';

/**
 * Maya composing an email from marketing material she is cleared to quote.
 *
 * This is the second half of the Email tab ticket. The first half, `content/quotableAssets.ts`,
 * decides WHAT may be quoted; this decides whether a particular composed message may become a
 * draft, and writes it if so.
 *
 * ── NOTHING HERE CAN SEND, AND THAT RESTS ON THREE INDEPENDENT FACTS ────────
 *
 * Not on configuration, and not on Maya being disabled today, because both of those are one
 * database row away from changing:
 *
 *   1. `sendAgentEmail` HAS NO TRANSPORT. Its type admits an outcome of `sent`, but no code
 *      path in that file returns one; the branch where "everything lines up" returns `drafted`
 *      with reason `transport_not_wired`. Verified by reading every `outcome:` it returns.
 *   2. THIS CALLER PASSES NO `campaignId`, deliberately. `sendAgentEmail` treats a missing
 *      campaign as missing brand scope and drafts on that ground alone, before reaching the
 *      branch above. So even if a transport were wired tomorrow, this path still drafts.
 *   3. THE DRAFT STATUS IS `agent_draft`, and the scheduler only ever claims `pending`.
 *
 * A test asserts each of these separately, so removing any one of them fails the build rather
 * than quietly leaving the other two carrying a load they were not sized for.
 *
 * ── WHY THE GATE RUNS ON THE COMPOSED MESSAGE, NOT ONLY ON THE ASSETS ───────
 *
 * `quotableAssets` already refuses an asset whose own title or summary breaks a copy rule. That
 * is not enough. The measured failure is the other direction: `bannedCopyInstruction`'s docblock
 * records a live Explorer render where the guard refused 8 of 12 drafts, every one for the same
 * banned word, in prose THE MODEL WROTE UNPROMPTED. The assets it was handed were clean. So the
 * composed subject and body are screened here, after the model has written them, which is the
 * only place that failure is visible.
 *
 * ── WHY SHE CANNOT NAME AN ASSET THAT IS NOT ON THE LIST ────────────────────
 *
 * The asset ids she cites are re-resolved against a fresh `listQuotableAssets()` rather than
 * trusted. A model that has seen a refused asset once can cite it later, and a model that has
 * seen nothing at all can invent a plausible uuid. Both are refusals here, and both name what
 * went wrong rather than silently dropping the citation - a draft that quietly lost its source
 * is worse than one that was refused, because it looks finished.
 */

/** What happened to the composition. Never `sent`: see the docblock. */
export type QuoteComposeOutcome = 'drafted' | 'refused_copy' | 'refused_asset' | 'no_recipient';

export interface QuoteComposeResult {
  outcome: QuoteComposeOutcome;
  /** One line, safe to show an operator. */
  reason: string;
  /** The row id in the draft queue, when one was written. */
  draftId: string | null;
  /** Copy rules the COMPOSED message breaks. Non-empty exactly when `refused_copy`. */
  ruleIds: string[];
  /** Asset ids cited that are not quotable. Non-empty exactly when `refused_asset`. */
  unquotable: string[];
}

export interface QuoteComposeRequest {
  /** The conversation's visitor, from which the lead and address are resolved. */
  visitorId: string;
  subject: string;
  body: string;
  /** The assets the message draws on. Each is re-checked against the quotable set. */
  assetIds: string[];
}

/** Injected so the whole path is testable without a database or a live model. */
export interface QuoteComposeDeps {
  listAssets: typeof listQuotableAssets;
  resolveLead: typeof resolveLeadForVisitor;
  draft: typeof sendAgentEmail;
}

export const DEFAULT_DEPS: QuoteComposeDeps = {
  listAssets: listQuotableAssets,
  resolveLead: resolveLeadForVisitor,
  draft: sendAgentEmail,
};

/** The identity whose grant and autonomy `sendAgentEmail` checks. */
export const COMPOSER_AGENT_NAME = 'Maya';

const result = (
  outcome: QuoteComposeOutcome,
  reason: string,
  over: Partial<QuoteComposeResult> = {},
): QuoteComposeResult => ({ outcome, reason, draftId: null, ruleIds: [], unquotable: [], ...over });

/**
 * Compose a quoted email into the draft queue, or refuse and say why.
 *
 * Never throws: an agent turn must not die because a draft could not be decided. Every refusal
 * carries the information needed to retry, because "no" with no reason is how a model loops.
 */
export async function composeQuotedEmail(
  req: QuoteComposeRequest,
  deps: QuoteComposeDeps = DEFAULT_DEPS,
): Promise<QuoteComposeResult> {
  const lead = await deps.resolveLead(req.visitorId);
  if (!lead?.email) {
    return result('no_recipient', 'No lead with an email address is linked to this conversation yet.');
  }

  // Re-resolved, never trusted. See the docblock.
  const set = await deps.listAssets();
  const permitted = new Map(set.quotable.map((a: QuotableAsset) => [a.id, a]));
  const unquotable = req.assetIds.filter((id) => !permitted.has(id));
  if (unquotable.length > 0) {
    return result(
      'refused_asset',
      `${unquotable.length} cited asset(s) are not cleared to quote. Use only the assets listed `
      + 'for you, and cite them by the id given there.',
      { unquotable },
    );
  }

  // THE GATE AT THE POINT OF QUOTING. Subject and body together: a rule broken in the subject
  // line reaches the recipient's inbox list even if the body is never opened.
  const hits = findBannedCopy(`${req.subject}\n${req.body}`);
  if (hits.length > 0) {
    const ruleIds = Array.from(new Set(hits.map((h) => h.rule_id)));
    return result(
      'refused_copy',
      'The composed message breaks a copy rule and was not drafted. Rewrite it using the '
      + 'approved wording and try again.',
      { ruleIds },
    );
  }

  // NO campaignId, deliberately: fact 2 in the docblock. This is the line that keeps the path
  // drafting even if a transport is wired later, so it is not an omission to be tidied up.
  const written: AgentEmailResult = await deps.draft({
    agentName: COMPOSER_AGENT_NAME,
    leadId: lead.id,
    toEmail: lead.email,
    subject: req.subject,
    body: req.body,
  });

  return result(
    'drafted',
    `Drafted for review (${written.reason}). Nothing was sent.`,
    { draftId: written.draftId ?? null },
  );
}

/**
 * The material Maya may quote, as a model-ready block.
 *
 * Thin on purpose: the digest's wording, including the copy rules it carries, belongs to
 * `quotableAssets` so there is one place the instruction can be got right.
 */
export async function quotableMaterialForMaya(
  deps: Pick<QuoteComposeDeps, 'listAssets'> = DEFAULT_DEPS,
): Promise<{ digest: string; assets: QuotableAsset[]; refusedCount: number }> {
  const set = await deps.listAssets();
  return { digest: quotableAssetDigest(set), assets: set.quotable, refusedCount: set.refused.length };
}
