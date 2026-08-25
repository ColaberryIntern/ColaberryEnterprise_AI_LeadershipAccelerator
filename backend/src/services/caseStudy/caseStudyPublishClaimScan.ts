/**
 * caseStudyPublishClaimScan — the publish gate's PROSE rules: no AI-generated
 * quote (spec §15 condition 9) and no unverified production / ROI / outcome
 * claim (condition 10).
 *
 * READ `caseStudyPublishGate.ts` FIRST for the doctrine. This file exists as a
 * sibling of `caseStudyPublishRules.ts` for the line ceiling; it imports that
 * file's types and collector and is imported by the gate, so the three run one
 * way and never form a cycle.
 *
 * ── WHY THESE TWO RULES EXIST AT ALL ─────────────────────────────────────────
 * `caseStudyProvenance.ts` screens AI drafts BY FIELD CLASS, and its header says
 * so in terms: the screen matches the destination path and scans the candidate's
 * own keys, but "an AI draft at a PERMITTED path — `identity.standfirst`, say —
 * can still contain the sentence 'cut costs 40%', and nothing here will catch
 * it". That residue is deliberate there, because catching it would require a
 * content classifier and would destroy that module's purity guarantee. Closing
 * it is this file's whole job, and the two rules below are written so that the
 * closing is deterministic rather than clever:
 *
 *   · the SURFACE is a fixed, enumerated list of narrative paths, never a walk
 *     of the object — a walk would silently start scanning whatever field a
 *     future section adds, and a rule that changes scope without anyone deciding
 *     is how a gate acquires false positives;
 *   · the VOCABULARY is closed — quotation marks, percentages, currency figures,
 *     a short ROI word list, a short production-claim word list. Nothing here
 *     interprets natural language or asks a model anything;
 *   · the TEST is a lookup, not a judgement — a figure in prose must appear in a
 *     visible, third-party-verified metric on the same Case Study, and a
 *     production claim must have a verified, shipped `identity.productionStatus`
 *     behind it. Otherwise it is refused, by name.
 *
 * WHAT IT DOES NOT CATCH, STATED PLAINLY. A false sentence that uses none of the
 * scanned vocabulary — "the system transformed their operation" — passes, and no
 * deterministic rule could reach it. Human snapshot approval is what stands in
 * that gap; this file exists to make sure a human approving prose is not also
 * being asked to notice an unbacked number.
 *
 * PURE. No clock, no randomness, no I/O, no database, no logging.
 */
import { classifyAiForbiddenPath, provenanceAncestors } from './caseStudyProvenance';
import { arr, has, text, visible } from './caseStudyPublishRules';
import type { Blockers, CaseStudyPublishSnapshot, MetricAt } from './caseStudyPublishRules';
import type { CaseStudySnapshotContent } from '../../types/caseStudy';
import type { CaseStudyProvenance, CaseStudyProvenanceTier } from '../../types/caseStudyProvenance';

/* ────────────────────────────────────────────────── the narrative surface ── */

export interface TextAt {
  readonly path: string;
  /** How the field is named in a sentence: `the standfirst`, `a roadmap entry`. */
  readonly label: string;
  readonly value: string;
}

/**
 * Every free-text field a reader takes as prose. Metric `valueDisplay` is
 * deliberately ABSENT: it is the verified figure itself, and rules 3, 7 and 7b
 * in `caseStudyPublishRules.ts` already govern it. Scanning it here would report
 * every verified metric as an unbacked claim about itself.
 */
export function collectNarrative(content: CaseStudySnapshotContent): readonly TextAt[] {
  const out: TextAt[] = [];
  const push = (path: string, label: string, value: unknown): void => {
    if (has(value)) out.push({ path, label, value: text(value) });
  };
  push('identity.standfirst', 'the standfirst', content.identity?.standfirst);
  push('identity.summary', 'the summary', content.identity?.summary);
  arr(content.situation?.narrative).forEach((s, i) => push(`situation.narrative[${i}]`, 'the situation narrative', s));
  arr(content.situation?.constraints).forEach((s, i) => push(`situation.constraints[${i}]`, 'a stated constraint', s));
  arr(content.situation?.goals).forEach((s, i) => push(`situation.goals[${i}]`, 'a stated goal', s));
  arr(content.buildTimeline).forEach((e, i) => {
    push(`buildTimeline[${i}].label`, 'a build timeline entry', e?.label);
    push(`buildTimeline[${i}].detail`, 'a build timeline entry', e?.detail);
  });
  arr(content.architecture?.narrative).forEach((s, i) => push(`architecture.narrative[${i}]`, 'the architecture narrative', s));
  arr(content.measurement?.narrative).forEach((s, i) => push(`measurement.narrative[${i}]`, 'the measurement narrative', s));
  arr(content.roadmap).forEach((r, i) => {
    push(`roadmap[${i}].label`, 'a roadmap entry', r?.label);
    push(`roadmap[${i}].detail`, 'a roadmap entry', r?.detail);
  });
  arr(content.artifacts).forEach((a, i) => {
    push(`artifacts[${i}].title`, 'an artifact title', a?.title);
    push(`artifacts[${i}].description`, 'an artifact description', a?.description);
  });
  return out;
}

/** Field-level provenance, or the nearest section above it, or `unknown`. */
export function effectiveTier(
  provenance: CaseStudyProvenance | undefined, path: string,
): CaseStudyProvenanceTier | 'unknown' {
  if (!provenance || typeof provenance !== 'object') return 'unknown';
  for (const ancestor of provenanceAncestors(path)) {
    const entry = provenance[ancestor];
    if (entry && typeof entry === 'object' && typeof entry.tier === 'string') return entry.tier;
  }
  return 'unknown';
}

/* ───────────────────────────────────────────── the closed claim vocabulary ── */

/**
 * A quoted run of three or more words, in straight, curly or guillemet marks.
 * Written with `\u` escapes so the source stays ASCII and no editor can
 * normalise a curly quote into a straight one behind the rule's back. One
 * quoted word (`"main"`, `"draft"`) is a term of art, not a testimonial, which
 * is why the pattern demands two internal spaces.
 */
export const QUOTATION = /["“«]([^"”»]*\S\s+\S[^"”»]*\s+\S[^"”»]*)["”»]/;

/** Figures a reader takes as an outcome. Global: every occurrence is checked. */
const PERCENTAGE = /\d+(?:\.\d+)?\s?%/g;
// Magnitude words are ordered LONGEST FIRST: regex alternation is first-match,
// so `m` ahead of `million` would clip "$1.2 million" to "$1.2 m" and then look
// for a verified metric carrying a figure nobody wrote.
const MONEY = /[$£€]\s?\d[\d,.]*\s?(?:billion|million|thousand|bn|k|m)?\b/gi;

/** ROI vocabulary. A sentence using any of these asserts a business return. */
const ROI_WORDS = /\b(?:roi|return on investment|cost savings?|cost[- ]saving|savings? of|payback|revenue (?:lift|increase|growth|impact))\b/i;

/**
 * Production claims. Deliberately narrow: "in production" and its close kin, not
 * every use of the word "live" — a "live session" is not a deployment, and a
 * gate that cried wolf on one would be switched off within a month.
 */
const PRODUCTION_WORDS = /\b(?:in production|into production|to production|production (?:deployment|rollout|release)|went live|gone live|goes live|go[- ]live)\b/i;

/** Case-folded, with whitespace and thousands separators removed, so `41 %`,
 *  `41%` and `41%.` all reduce to the same comparable token. */
const fold = (s: string): string => s.toLowerCase().replace(/[\s,]/g, '');

/** Every figure a VISIBLE, third-party-verified metric puts on the page.
 *  `method: 'self'` is excluded here for the same reason rule 7b refuses it. */
export function verifiedFigures(metrics: readonly MetricAt[]): readonly string[] {
  const out: string[] = [];
  for (const m of metrics) {
    if (!visible(m)) continue;
    const v = m.metric?.verification;
    if ((v?.class !== 'verified' && v?.class !== 'anonymized') || v?.method === 'self') continue;
    if (has(m.metric.valueDisplay)) out.push(fold(text(m.metric.valueDisplay)));
    if (typeof m.metric.numericValue === 'number' && Number.isFinite(m.metric.numericValue)) {
      out.push(fold(`${m.metric.numericValue}${text(m.metric.unit)}`));
      out.push(fold(`${m.metric.numericValue}`));
    }
  }
  return out;
}

/**
 * Is this prose figure backed by a verified metric?
 *
 * The comparison is EQUALITY on the folded string, deliberately not containment.
 *
 * Containment was the first implementation and it was a false-negative on the
 * most load-bearing rule in the gate: `'140%faster'.includes('40%')` is true, so
 * a verified "140% faster" laundered an entirely unrelated, unbacked "40%" in
 * prose. `'$1.25million'.includes('$1.2')` did the same for money. Any verified
 * figure would quietly vouch for every smaller figure that happened to be a
 * substring of it — which is the opposite of what a proof gate is for.
 *
 * Plain equality is NOT the fix either, and trying it proved why: a metric
 * legitimately displays "41% fewer stockouts", which folds to
 * "41%fewerstockouts" and would then fail to back a prose "41%". The metric's
 * display string carries words; the prose figure is bare.
 *
 * The real distinction is a NUMERIC boundary. A match counts only when the
 * character immediately before and after the token is not itself part of the
 * same number:
 *
 *   "41%fewerstockouts" backs "41%"   — followed by a letter        ✓
 *   "140%faster"        backs "40%"?  — preceded by "1"             ✗
 *   "$1.25million"      backs "$1.2"? — followed by "5"             ✗
 *
 * So a bigger verified figure can no longer vouch for an unrelated smaller one
 * that happens to be a substring of it, while a verified figure stated with its
 * unit and description still backs the bare figure in prose.
 */
const NUMERIC_CHAR = /[0-9.,]/;

const backed = (figures: readonly string[], token: string): boolean => {
  const needle = fold(token);
  if (!needle) return false;

  return figures.some((figure) => {
    let from = figure.indexOf(needle);
    while (from !== -1) {
      const before = from === 0 ? '' : figure[from - 1];
      const afterIndex = from + needle.length;
      const after = afterIndex >= figure.length ? '' : figure[afterIndex];
      // Reject only when an adjacent character extends the NUMBER itself.
      if (!NUMERIC_CHAR.test(before) && !NUMERIC_CHAR.test(after)) return true;
      from = figure.indexOf(needle, from + 1);
    }
    return false;
  });
};

/** Is there a visible, third-party-verified business-outcome metric at all? */
function hasVerifiedBusinessOutcome(metrics: readonly MetricAt[]): boolean {
  return metrics.some((m) => visible(m)
    && m.metric?.metricType === 'business_outcome'
    && (m.metric.verification?.class === 'verified' || m.metric.verification?.class === 'anonymized')
    && m.metric.verification?.method !== 'self');
}

/** A production claim in prose is allowed only against a verified shipped status. */
function productionStatusIsVerified(content: CaseStudySnapshotContent): boolean {
  const ps = content.identity?.productionStatus;
  if (!ps || ps.status !== 'shipped') return false;
  const v = ps.verification;
  return (v?.class === 'verified' || v?.class === 'anonymized')
    && v?.method !== 'self'
    && has(v?.evidenceId);
}

/* ─────────────────────────────────────────────────────────── the two rules ── */

/**
 * 9 — no AI-generated quote, and no quotation nobody can account for.
 *
 * `unknown` provenance is treated the same as `ai_draft` ON PURPOSE. Publishing
 * a quotation asserts that a named human said those words; a quotation whose
 * authorship no provenance entry records cannot support that assertion, and
 * "we could not establish who wrote it" is not a reason to ship it. This is the
 * gate failing closed on absent data, which is the same rule
 * `repoLogIdentity()` applies to `visibility: 'unknown'` one file over.
 */
export function ruleQuotes(snapshot: CaseStudyPublishSnapshot, b: Blockers): void {
  for (const field of collectNarrative(snapshot.content)) {
    const match = QUOTATION.exec(field.value);
    if (!match) continue;
    const tier = effectiveTier(snapshot.provenance, field.path);
    if (tier !== 'ai_draft' && tier !== 'unknown') continue;
    const quoted = match[1].trim().slice(0, 120);
    b.add('ai_generated_quote', field.path, tier === 'ai_draft'
      ? `${field.label} contains the quotation "${quoted}" and is AI-drafted; an AI draft may never create a quote`
      : `${field.label} contains the quotation "${quoted}" and no provenance entry accounts for who wrote it`,
      'remove the quotation, or replace it with a human-authored value whose provenance names the person or the evidence record it came from');
  }

  // The provenance map's own testimony. An `ai_draft` entry at a class-reserved
  // path means the merge screen was bypassed — a snapshot assembled by something
  // other than `resolveCaseStudyProvenance`, or one written before the screen
  // existed. Either way the value is not publishable.
  for (const [path, entry] of Object.entries(snapshot.provenance ?? {})) {
    if (entry?.tier !== 'ai_draft') continue;
    const cls = classifyAiForbiddenPath(path);
    if (!cls) continue;
    if (cls === 'quote') {
      b.add('ai_generated_quote', path,
        `provenance records an AI draft at "${path}", a quoted field an AI draft may never supply`,
        'replace the value with a human-authored or evidence-backed one, then re-approve the snapshot');
    } else {
      b.add('unverified_claim', path,
        `provenance records an AI draft at "${path}", whose field class (${cls}) an AI draft may never supply`,
        'replace the value with a human-authored or evidence-backed one, then re-approve the snapshot');
    }
  }
}

/** 10 — no unverified production, ROI or outcome claim. */
export function ruleUnverifiedClaims(
  content: CaseStudySnapshotContent, metrics: readonly MetricAt[], b: Blockers,
): void {
  const figures = verifiedFigures(metrics);
  const production = productionStatusIsVerified(content);
  const businessOutcome = hasVerifiedBusinessOutcome(metrics);

  for (const field of collectNarrative(content)) {
    for (const token of [...(field.value.match(PERCENTAGE) ?? []), ...(field.value.match(MONEY) ?? [])]) {
      if (backed(figures, token)) continue;
      b.add('unverified_claim', field.path,
        `${field.label} states the figure "${token.trim()}" but no verified metric on this Case Study carries it`,
        'add the figure as a verified metric with its evidence, or take it out of the prose; spec §22 forbids manufacturing a number to fill a page');
    }
    if (!businessOutcome && ROI_WORDS.test(field.value)) {
      b.add('unverified_claim', field.path,
        `${field.label} makes a return-on-investment claim ("${text(ROI_WORDS.exec(field.value)?.[0])}") with no verified business-outcome metric behind it`,
        'record the return as a verified business_outcome metric with its evidence, or drop the claim');
    }
    if (!production && PRODUCTION_WORDS.test(field.value)) {
      b.add('unverified_claim', field.path,
        `${field.label} claims production deployment ("${text(PRODUCTION_WORDS.exec(field.value)?.[0])}") but no verified, shipped production status supports it`,
        'record identity.productionStatus as "shipped" with a verified class and an evidence reference, or remove the production claim');
    }
  }

  // The structural form of the same claim: the hero band renders this status as
  // a fact, so an unverified one is a public claim even with no prose behind it.
  const ps = content.identity?.productionStatus;
  if (ps?.status === 'shipped'
    && (ps.verification?.class === 'pending' || ps.verification?.class === 'illustrative')) {
    b.add('unverified_claim', 'identity.productionStatus.verification.class',
      `production status is "shipped" but its verification is "${ps.verification?.class}"`,
      'verify the deployment before publishing it, or set the status to what is actually established');
  }
  if (ps?.status === 'shipped' && ps.verification?.method === 'self') {
    b.add('unverified_claim', 'identity.productionStatus.verification.method',
      'production status is "shipped" on a self-reported verification; a deployment claim is not established by the party claiming it',
      'verify the deployment against the repository, the platform or the client');
  }
}
