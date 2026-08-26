/**
 * Case Study OS — quotes. THE HIGHEST-RISK ASSET IN THE SYSTEM.
 *
 * BUILT LAST, DELIBERATELY, AND THE REASON IS NOT CAUTION — IT IS HISTORY.
 * `frontend/src/config/v2Proof.ts` names the remediation "Case studies
 * containing invented client quotations". This repository shipped them. The
 * publish gate's `ruleQuotes` exists because of that incident, and every line
 * below is written against it happening again.
 *
 * READ PRECISELY, THE EXISTING GATE HAS A DOOR IN IT. `ruleQuotes` blocks a
 * quotation in prose whose provenance tier is `ai_draft` OR `unknown`. It does
 * NOT block a human-attributed one — so today the way to get a quotation onto a
 * public page is to paste it into narrative prose and attach a non-AI
 * provenance entry. That works, and the result is untyped text with no
 * attributed speaker, no consent record and no reviewer.
 *
 * This module is the alternative to that door: a quotation carried as a
 * first-class row with a consent-bearing attribution, so the prose route stops
 * being the only route and can stay blocked.
 *
 * THREE RULES, AND THEY ARE NOT NEGOTIABLE:
 *
 *   1. AI MAY NEVER WRITE `text`. There is no generate path into this file.
 *      `classifyAiForbiddenPath` already classes anything matching
 *      /quote|testimonial|endorsement/ as forbidden, the draft generator's
 *      allowlist contains no quote path, and the draft store re-screens. AI may
 *      suggest WHERE a quote would strengthen the story — `suggestQuoteSlots`
 *      below returns positions and never words.
 *
 *   2. A NAMED QUOTE WITHOUT RECORDED CONSENT CANNOT EXIST. The TypeScript
 *      union has no shape for it, and `cs_quotes_named_requires_consent` is the
 *      same rule as a CHECK constraint — so it holds against direct SQL too,
 *      which is how this record's artifacts were promoted and therefore a real
 *      path rather than a theoretical one.
 *
 *   3. IF NO APPROVED QUOTE EXISTS, THE BLOCK DOES NOT RENDER. `listPublishable`
 *      returns an empty array and the surface shows nothing. A quote block is
 *      never filled to avoid an empty band.
 */

import { randomUUID } from 'crypto';
import { CaseStudyQuote as QuoteModel } from '../../models';
import type {
  CaseStudyQuote, CaseStudyQuoteAttribution, CaseStudyQuoteSource,
} from '../../types/caseStudyStory';
import { CASE_STUDY_QUOTE_SOURCES, quoteIsPublishable } from '../../types/caseStudyStory';
import type { CaseStudyBuiltByType, CaseStudyVerificationClass } from '../../types/caseStudy';
import { CaseStudyAdminError } from './caseStudyAdminStore';

export const MAX_QUOTE_CHARS = 1000;

const ATTRIBUTION_MODES = ['named', 'role_only', 'anonymous'] as const;

/** Rebuild the union from the flat row. An unknown mode is refused, never guessed. */
function attributionFrom(row: QuoteModel): CaseStudyQuoteAttribution {
  const kind = row.attribution_kind as CaseStudyBuiltByType;
  if (row.attribution_mode === 'named') {
    return {
      displayMode: 'named',
      displayName: row.display_name ?? '',
      role: row.attribution_role ?? '',
      kind,
      consentRecordedAt: (row.consent_recorded_at ?? new Date(0)).toISOString(),
    };
  }
  if (row.attribution_mode === 'role_only') {
    return { displayMode: 'role_only', role: row.attribution_role ?? '', kind };
  }
  return { displayMode: 'anonymous', kind };
}

const toContract = (row: QuoteModel): CaseStudyQuote => ({
  id: row.id,
  caseStudyId: row.case_study_id,
  text: row.quote_text,
  attribution: attributionFrom(row),
  source: row.quote_source as CaseStudyQuoteSource,
  verificationClass: row.verification_class as CaseStudyVerificationClass,
  approved: row.approved,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
});

export interface CreateQuoteInput {
  readonly caseStudyId: string;
  readonly text: string;
  readonly attribution: CaseStudyQuoteAttribution;
  readonly source: CaseStudyQuoteSource;
  readonly actor: string;
}

/**
 * Record a quotation a human obtained.
 *
 * Created `approved: false` and `verification_class: 'pending'` — publishable
 * on no axis. Approval is a separate act by a separate function, because a
 * person who types a quotation and a person who vouches for it are allowed to
 * be the same person but are never the same decision.
 */
export async function createQuote(input: CreateQuoteInput): Promise<CaseStudyQuote> {
  const text = String(input.text ?? '').trim();
  if (text.length === 0) {
    throw new CaseStudyAdminError('ValidationError', 'A quote needs words.', { field: 'text' });
  }
  if (text.length > MAX_QUOTE_CHARS) {
    throw new CaseStudyAdminError(
      'ValidationError', `A quote is capped at ${MAX_QUOTE_CHARS} characters.`, { field: 'text' },
    );
  }
  if (!CASE_STUDY_QUOTE_SOURCES.includes(input.source)) {
    throw new CaseStudyAdminError('ValidationError', 'Unknown quote source.', {
      field: 'source', allowed: CASE_STUDY_QUOTE_SOURCES,
    });
  }

  const attribution = input.attribution;
  if (!attribution || !ATTRIBUTION_MODES.includes(attribution.displayMode as any)) {
    throw new CaseStudyAdminError('ValidationError', 'Unknown attribution mode.', {
      field: 'attribution.displayMode', allowed: ATTRIBUTION_MODES,
    });
  }

  // The third gate on the same rule. The union blocks it at compile time and
  // the CHECK constraint blocks it in the database; this one exists so the
  // operator gets a sentence instead of a 500 from Postgres.
  if (attribution.displayMode === 'named') {
    if (!attribution.displayName || attribution.displayName.trim().length === 0) {
      throw new CaseStudyAdminError(
        'ValidationError', 'A named quote needs the name of the person who said it.',
        { field: 'attribution.displayName' },
      );
    }
    if (!attribution.consentRecordedAt || attribution.consentRecordedAt.trim().length === 0) {
      throw new CaseStudyAdminError(
        'ValidationError',
        'A named quote requires a recorded consent timestamp. Naming somebody who has not agreed '
          + 'to be named is the failure this record type exists to prevent.',
        { field: 'attribution.consentRecordedAt' },
      );
    }
  }

  const row = await QuoteModel.create({
    id: randomUUID(),
    case_study_id: input.caseStudyId,
    quote_text: text,
    attribution_mode: attribution.displayMode,
    display_name: attribution.displayMode === 'named' ? attribution.displayName.trim() : null,
    attribution_role: attribution.displayMode === 'anonymous'
      ? null : (attribution as { role?: string }).role?.trim() ?? null,
    attribution_kind: attribution.kind,
    consent_recorded_at: attribution.displayMode === 'named'
      ? new Date(attribution.consentRecordedAt) : null,
    quote_source: input.source,
    verification_class: 'pending',
    approved: false,
  });

  return toContract(row);
}

/** Every quote on a record, unapproved included — the Studio must show what it withholds. */
export async function listQuotes(caseStudyId: string): Promise<readonly CaseStudyQuote[]> {
  const rows = await QuoteModel.findAll({
    where: { case_study_id: caseStudyId },
    order: [['created_at', 'ASC']],
  });
  return rows.map(toContract);
}

/**
 * The quotes a surface may actually render.
 *
 * AN EMPTY ARRAY IS A CORRECT AND COMMON ANSWER. If nothing here is approved,
 * consented and verified, the quote block does not render. Nothing in this
 * module manufactures a fallback, and no caller may substitute prose for a
 * missing quotation.
 */
export async function listPublishableQuotes(
  caseStudyId: string,
): Promise<readonly CaseStudyQuote[]> {
  const all = await listQuotes(caseStudyId);
  return all.filter(quoteIsPublishable);
}

/**
 * Approve a quotation, or withdraw approval.
 *
 * Approving requires a verification class other than `pending`, so "we wrote it
 * down" never becomes "we stand behind it" by a single click. The reviewer is
 * recorded on the row.
 */
export async function setQuoteApproval(input: {
  readonly caseStudyId: string;
  readonly quoteId: string;
  readonly approved: boolean;
  readonly verificationClass?: CaseStudyVerificationClass;
  readonly actor: string;
}): Promise<CaseStudyQuote> {
  const row = await QuoteModel.findOne({
    where: { id: input.quoteId, case_study_id: input.caseStudyId },
  });
  if (!row) {
    throw new CaseStudyAdminError('CaseStudyNotFound', 'That quote does not exist on this record.', {
      quoteId: input.quoteId,
    });
  }

  const nextClass = input.verificationClass ?? row.verification_class as CaseStudyVerificationClass;

  if (input.approved) {
    if (nextClass === 'pending') {
      throw new CaseStudyAdminError(
        'ValidationError',
        'A quote cannot be approved while its verification class is still pending. Record how it '
          + 'was verified first.',
        { field: 'verificationClass' },
      );
    }
    if (row.attribution_mode === 'named' && !row.consent_recorded_at) {
      // Unreachable through this service and blocked by the CHECK constraint;
      // kept because a row predating either could exist, and the failure mode
      // is publishing a name without consent.
      throw new CaseStudyAdminError(
        'ValidationError',
        'This quote names a person with no recorded consent and cannot be approved.',
        { quoteId: input.quoteId },
      );
    }
  }

  row.approved = input.approved;
  row.verification_class = nextClass;
  row.reviewed_by = input.actor;
  row.reviewed_at = new Date();
  await row.save();
  return toContract(row);
}

/**
 * WHERE a quote would strengthen the story. NEVER the words.
 *
 * This is the entire permitted AI contribution to quotes, and it returns
 * positions and reasons — strings this module wrote, about structure. It reads
 * no model and composes no sentence a speaker could be said to have uttered.
 * Returning a suggested quotation here, even clearly labelled, would put a
 * plausible sentence in front of a reviewer next to a field expecting one, and
 * that is how the original incident happened.
 */
export function suggestQuoteSlots(input: {
  readonly hasApprovedQuote: boolean;
  readonly hasNamedOrganization: boolean;
  readonly hasVerifiedOutcomeMetric: boolean;
}): readonly { readonly slot: string; readonly why: string }[] {
  if (input.hasApprovedQuote) return [];
  const out: { slot: string; why: string }[] = [];

  if (input.hasVerifiedOutcomeMetric) {
    out.push({
      slot: 'after the measurement section',
      why: 'A verified outcome figure is stated here. A named person confirming what that number '
        + 'meant to them would carry it further than the number does alone. You would need to ask '
        + 'them, and record their consent.',
    });
  }
  if (input.hasNamedOrganization) {
    out.push({
      slot: 'after the situation section',
      why: 'The organisation is named with consent, so a quotation from someone inside it is '
        + 'attributable. Nothing here writes one.',
    });
  }
  return out;
}
