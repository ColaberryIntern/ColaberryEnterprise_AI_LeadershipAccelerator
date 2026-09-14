import { Brand, Campaign } from '../../models';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { WorkflowError } from './contentWorkflowService';

/**
 * composerDraftService — turn a topic into a first draft of the canonical message.
 *
 * WHY. On the first real run the operator hit the canonical-message box and asked, reasonably,
 * whether they were supposed to write it themselves. Making a marketer stare at an empty
 * textarea is the slowest part of a tool that is otherwise about speed.
 *
 * WHAT THIS DELIBERATELY WILL NOT DO: invent a fact. Marketing copy is where fabricated
 * specifics do real damage - a date nobody scheduled, a price nobody agreed, a "limited to 20
 * seats" nobody decided - and the repo's own rule is that every claim must trace to something
 * verifiable. So the prompt forbids inventing specifics and requires a visible `[placeholder]`
 * instead, and `findInventedSpecifics` re-reads the result and reports anything that slipped
 * through. The operator gets a draft with holes they can see rather than confident-sounding
 * copy with holes they cannot.
 *
 * It is a DRAFT. It lands in the same editable box the operator would have typed into, is
 * marked as generated, and goes through the identical validation, approval and publishing path
 * as anything hand-written. Nothing here shortens the approval chain.
 */

const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 30_000;

export interface DraftRequest {
  /** What the post is about, in the operator's own words. */
  topic: string;
  brandId: string;
  campaignId?: string | null;
  contentType?: string;
  /** A paid placement needs a disclosure; the copy should leave room for it. */
  isPaid?: boolean;
  hasOffer?: boolean;
  /** Where the tracked link will point, so the copy can lead to it rather than repeat it. */
  destinationUrl?: string | null;
}

export interface DraftResult {
  message: string;
  /** Bracketed holes the operator must fill before this is publishable. */
  placeholders: string[];
  /** Specifics the model produced that nothing in the request supports. Reported, not removed. */
  unverifiedClaims: string[];
  model: string;
}

/** `[like this]` - the visible hole the prompt asks for instead of an invented fact. */
function findPlaceholders(text: string): string[] {
  return Array.from(new Set((text.match(/\[[^\]\n]{2,60}\]/g) ?? []).map((s) => s.trim())));
}

/**
 * Numbers, dates and prices the request never supplied.
 *
 * Not a filter and not a blocker: it is a second reader. The model is told not to invent, and
 * this checks whether it did, because "the prompt says not to" is not a control. Anything it
 * finds is shown to the operator beside the draft, so the judgement stays with the person whose
 * name goes on the post.
 */
export function findInventedSpecifics(text: string, source: string): string[] {
  const claims: string[] = [];
  const haystack = source.toLowerCase();

  // A bracketed placeholder is the sanctioned form, so blank those out before looking.
  const body = text.replace(/\[[^\]\n]*\]/g, ' ');

  const patterns: Array<{ re: RegExp; label: (m: string) => string }> = [
    { re: /\$\s?\d[\d,]*(?:\.\d{2})?/g, label: (m) => `price ${m}` },
    { re: /\b\d{1,2}:\d{2}\s?(?:am|pm)?\b/gi, label: (m) => `time ${m}` },
    { re: /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi, label: (m) => `date ${m}` },
    { re: /\b\d{1,3}\s?(?:seats|spots|places)\b/gi, label: (m) => `capacity ${m}` },
    { re: /\b\d{1,3}\s?%/g, label: (m) => `figure ${m}` },
  ];

  for (const { re, label } of patterns) {
    for (const match of body.match(re) ?? []) {
      if (!isSupported(match, haystack)) claims.push(label(match.trim()));
    }
  }
  return Array.from(new Set(claims));
}


/**
 * Is this specific supported by the brief?
 *
 * Compared on the DIGITS, not the rendered string: a brief carrying `?price=49` does support
 * copy that says "$49", and flagging it anyway would train the operator to ignore the warning -
 * which is worse than having none. The digit run is matched on a word boundary so "20 seats" is
 * not silently cleared by a brief that happens to mention 2026.
 */
function isSupported(match: string, haystack: string): boolean {
  const raw = match.toLowerCase().trim();
  if (haystack.includes(raw)) return true;

  const digits = raw.match(/\d[\d,.:]*\d|\d/)?.[0]?.replace(/[,.]+$/, '');
  if (!digits) return false;

  // Scanned rather than built into a RegExp: the digit run can contain `.` and `:`, which are
  // regex metacharacters, and an escaping bug here fails open - it would clear an invented
  // figure as "supported", which is the one direction this check must never fail in.
  for (let i = haystack.indexOf(digits); i !== -1; i = haystack.indexOf(digits, i + 1)) {
    const before = haystack[i - 1];
    const after = haystack[i + digits.length];
    const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
    // Bounded on both sides, so a brief mentioning 2026 does not clear a claim of "20 seats".
    if (!isDigit(before) && before !== '.' && !isDigit(after)) return true;
  }
  return false;
}

const SYSTEM = `You write short social posts for a professional audience of working adults, on behalf of a company that teaches AI and data skills.

RULES, in order of importance:

1. NEVER invent a specific fact. No dates, times, prices, durations, seat counts, percentages, statistics, names, or testimonials unless they appear verbatim in the brief you are given. When the post needs one, write a bracketed placeholder the operator will fill in, for example [date] or [price]. A placeholder is always better than a plausible guess.
2. Write like a person, not a brochure. No "unlock", "supercharge", "game-changing", "dive into", "in today's fast-paced world". No em-dashes anywhere.
3. One idea. Two or three short paragraphs at most, under 120 words.
4. End with one clear next step. Do NOT paste a URL: a tracked link is attached separately, so refer to it as "the link below" or similar.
5. No hashtag walls. At most two, and only if they are genuinely the terms this audience searches.
6. Do not open with a rhetorical question.`;

export async function draftCanonicalMessage(input: DraftRequest): Promise<DraftResult> {
  const topic = input.topic.trim();
  if (topic.length < 3) {
    throw new WorkflowError('Give the draft a topic to work from, even a few words.', 400, 'ValidationError');
  }

  const brand = await Brand.findByPk(input.brandId);
  if (!brand) throw new WorkflowError('Brand not found', 404, 'NotFound');

  const campaign = input.campaignId ? await Campaign.findByPk(input.campaignId) : null;

  // The brief is ONLY facts we actually hold. Anything absent is absent on purpose: what is not
  // here is what the model must not assert.
  const brief = [
    `Brand: ${brand.name}`,
    campaign ? `Campaign: ${campaign.name}` : null,
    campaign?.objective ? `Objective: ${campaign.objective}` : null,
    input.contentType ? `Format: ${input.contentType}` : null,
    input.destinationUrl ? `The link sends people to: ${input.destinationUrl}` : null,
    input.hasOffer ? 'This post mentions an offer or price, which the operator will supply as a placeholder.' : null,
    input.isPaid ? 'This is a PAID placement; a disclosure line is added separately, so leave room for it and do not write one.' : null,
    '',
    `Topic: ${topic}`,
  ].filter(Boolean).join('\n');

  const client = getInstrumentedOpenAI(
    { workflow_id: 'composer_canonical_draft', prompt_version: 'composer-draft-v1' },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );

  let message: string;
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: brief }],
    });
    message = res.choices[0]?.message?.content?.trim() ?? '';
  } catch (err: any) {
    // The operator can always type the post themselves; this feature failing must never block
    // the composer, so it reports rather than throwing something opaque.
    throw new WorkflowError(
      'The draft could not be generated. Write the message yourself, or try again.',
      502,
      err?.name === 'APIConnectionTimeoutError' ? 'TimeoutError' : 'DraftUnavailable',
    );
  }

  if (message === '') {
    throw new WorkflowError('The draft came back empty. Try a more specific topic.', 502, 'DraftUnavailable');
  }

  // Em-dashes are banned repo-wide in outbound copy, and a model reaches for them constantly.
  message = message.replace(/\s*[—–]\s*/g, ', ');

  return {
    message,
    placeholders: findPlaceholders(message),
    unverifiedClaims: findInventedSpecifics(message, `${brief} ${brand.name}`),
    model: MODEL,
  };
}
