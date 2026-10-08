/**
 * govBidAssessment — the "should we pursue this?" ENGINE (2026-10 upgrade of govBidDecision).
 *
 * A PURE, deterministic, auditable two-stage model, built from the GovCon standards (Shipley
 * bid/no-bid gates + PWin, Lohfeld's 7-question model, APMP weighted scorecard, the federal
 * compliance-matrix "shall = knockout" rule). Same inputs -> same verdict -> fully reproducible,
 * which is what makes it "lock proof". No LLM, no IO, never throws. An AI narrative may EXPLAIN the
 * output elsewhere, but it never sets or flips the number produced here.
 *
 *   Stage A - Knockout / eligibility gate (binary): screen the mandatory eligibility requirements
 *             (SAM, set-aside, certifications like SOC 2 Type II, past-performance references,
 *             bonding, clearances). Each is PASS / CONDITIONAL / HARD_FAIL. A HARD_FAIL is an
 *             automatic NO-BID (score 0) — rejected without scoring. An open CONDITIONAL gap caps
 *             the verdict at BID-WITH-CONDITIONS.
 *   Stage B - Weighted PWin scorecard (0-100) over 7 factors -> PWin %, Probability of Award,
 *             Expected Value, Bid ROI, and a BID / BID-WITH-CONDITIONS / NO-BID band.
 *
 * Honesty rails: the engine knows a requirement EXISTS, not that we satisfy it, so it never
 * fabricates a HARD_FAIL — an unmet knockout is a CONDITIONAL gap to verify/obtain until an operator
 * says otherwise. Judgment factors the workspace has no data for (relationship, competition,
 * price-to-win, teaming, strategic value) are left UNRATED, not guessed; PWin is computed over what
 * is known and carries a confidence. ADVISORY ONLY — it changes no server gate.
 */
import type { EstablishedRequirement, ServiceMatch } from '../../services/factoryApi';

export type KnockoutStatus = 'pass' | 'conditional' | 'hard_fail';
export type KnockoutCategory = 'sam' | 'set_aside' | 'certification' | 'past_performance' | 'bonding' | 'clearance';

export interface KnockoutItem {
  id: string;
  category: KnockoutCategory;
  categoryLabel: string;
  text: string;
  status: KnockoutStatus;
  /** Plain statement of exactly what set this status — never a verdict. */
  basis: string;
  longLead: boolean;
}

export type PWinFactorKey =
  | 'relationship' | 'fit' | 'competition' | 'past_performance' | 'price_to_win' | 'teaming' | 'strategic';

export interface PWinFactorDef { key: PWinFactorKey; label: string; weight: number; derivable: boolean; }

/** Shipley/APMP/Lohfeld-derived factor weights (sum = 1.0). Kept as data so a weight-set change is a
 *  visible, versioned edit rather than scattered magic numbers. */
export const PWIN_FACTORS: PWinFactorDef[] = [
  { key: 'relationship', label: 'Customer relationship & intimacy', weight: 0.20, derivable: false },
  { key: 'fit', label: 'Requirement understanding & capability fit', weight: 0.18, derivable: true },
  { key: 'competition', label: 'Competitive position', weight: 0.17, derivable: false },
  { key: 'past_performance', label: 'Past-performance relevance', weight: 0.15, derivable: true },
  { key: 'price_to_win', label: 'Price-to-win feasibility', weight: 0.12, derivable: false },
  { key: 'teaming', label: 'Teaming & resources / bandwidth', weight: 0.10, derivable: false },
  { key: 'strategic', label: 'Strategic value & win-theme strength', weight: 0.08, derivable: false },
];
export const PWIN_WEIGHTSET_VERSION = 'shipley-apmp-smb.v1';

export interface PWinFactorScore {
  key: PWinFactorKey; label: string; weight: number;
  score: number | null; // 0-5, or null when unrated
  source: 'derived' | 'operator' | 'unrated';
  detail: string;
}

export type BidBand = 'bid' | 'bid_with_conditions' | 'no_bid';

export interface BidAssessment {
  band: BidBand;
  bandLabel: string;
  headline: string;
  pwin: number | null;          // capped PWin %, 0-100
  pwinRaw: number | null;       // pre-cap PWin %
  pwinConfidence: number;       // 0-1 fraction of factor weight that is known
  preliminary: boolean;         // true while judgment factors are unrated
  score: number;                // overall 0-100 (0 on a hard fail, else == capped PWin or 0 if unknown)
  knockouts: KnockoutItem[];
  hardFailCount: number;
  conditionalCount: number;
  factors: PWinFactorScore[];
  probabilityOfAward: number | null; // 0-1 (pGo * PWin)
  expectedValue: number | null;      // USD (value * pGo * PWin)
  bidRoi: number | null;             // EV / bid cost
  daysLeft: number | null;
  feasibleWindow: boolean;           // enough runway to produce a compliant proposal
}

export interface BidAssessmentInput {
  established: EstablishedRequirement[];
  serviceMatches: ServiceMatch[];
  capability: 'strong' | 'moderate' | 'none';
  priorPursuitCount: number;
  daysLeft: number | null;
  estimatedValue: number | null;
  openSubmissionCount: number;
  establishedCount: number;
  pursuitType?: 'new' | 'recompete';
  /** operator ratings 0-5 for any factor (override/fill); unrated factors stay null. */
  operatorFactors?: Partial<Record<PWinFactorKey, number>>;
  /** operator can force a knockout's status (e.g. mark SOC 2 HARD_FAIL: "can't obtain in time"). */
  operatorKnockoutOverrides?: Record<string, KnockoutStatus>;
  bidCostEstimate?: number | null;
  /** probability the solicitation is real & funded; 1.0 once the RFP is released. */
  pGo?: number;
}

interface KnockoutPattern { category: KnockoutCategory; label: string; re: RegExp; longLead: boolean; }
/** The mandatory-eligibility taxonomy. First match wins per requirement (no double counting). */
const KNOCKOUT_PATTERNS: KnockoutPattern[] = [
  { category: 'sam', label: 'SAM.gov registration', longLead: false,
    re: /\b(sam\.gov|system for award management|registered in sam|uei|cage\s?code|duns)\b/i },
  { category: 'set_aside', label: 'Set-aside eligibility', longLead: false,
    re: /\b(set[- ]?aside|8\(a\)|hubzone|wosb|edwosb|sdvosb|vosb|service[- ]?disabled|woman[- ]?owned|small business concern)\b/i },
  { category: 'certification', label: 'Mandatory certification', longLead: true,
    re: /\b(soc\s?2|soc\s?ii|cmmc|iso\s?\d{3,}|fedramp|nist\s?800|accredit(?:ed|ation)|certified|certification)\b/i },
  { category: 'past_performance', label: 'Past-performance references', longLead: false,
    re: /\b(past performance|references?|cpars|similar (?:scope|project|contract|size))\b/i },
  { category: 'bonding', label: 'Bonding / insurance', longLead: false,
    re: /\b(bond(?:ing|ed)?|surety|insurance|liability coverage|bid bond|performance bond)\b/i },
  { category: 'clearance', label: 'Security clearance', longLead: true,
    re: /\b(clearance|secret|ts\/sci|facility clearance|personnel security|public trust)\b/i },
];

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase();

/** Does any strong/moderate service match plausibly cover this requirement's terms? */
function hasCapability(text: string, matches: ServiceMatch[]): boolean {
  const t = norm(text);
  return matches.some((m) => {
    if (m.strength !== 'strong' && m.strength !== 'moderate') return false;
    const kws = Array.isArray(m.matchedKeywords) ? m.matchedKeywords : [];
    if (kws.some((k) => !!k && t.includes(norm(k)))) return true;
    const nameWords = norm(m.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    return nameWords.some((w) => t.includes(w));
  });
}

/** A proposal needs a workable window; under this many days a compliant response is at risk. */
const MIN_FEASIBLE_DAYS = 7;
/** Long-lead knockouts (certs, clearances) can't realistically be obtained inside this window. */
const LONG_LEAD_DAYS = 60;

/** Stage A — screen the established requirements for mandatory-eligibility knockouts. */
export function screenKnockouts(input: BidAssessmentInput): KnockoutItem[] {
  const est = Array.isArray(input.established) ? input.established : [];
  const ms = Array.isArray(input.serviceMatches) ? input.serviceMatches : [];
  const overrides = input.operatorKnockoutOverrides ?? {};
  const out: KnockoutItem[] = [];
  const seen = new Set<string>();
  for (const r of est) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    const hay = `${r.text ?? ''} ${r.category ?? ''}`;
    const p = KNOCKOUT_PATTERNS.find((k) => k.re.test(hay));
    if (!p) continue;
    seen.add(id);

    const evidenced = !!(r.evidenceRef && r.evidenceRef.docId);
    const capable = hasCapability(String(r.text ?? ''), ms);
    const tightForLongLead = p.longLead && input.daysLeft !== null && input.daysLeft < LONG_LEAD_DAYS;

    let status: KnockoutStatus;
    let basis: string;
    if (overrides[id]) {
      status = overrides[id];
      basis = 'set by operator';
    } else if (evidenced) {
      status = 'pass';
      basis = 'evidence of record attached';
    } else if (capable) {
      status = 'pass';
      basis = 'a matching Colaberry capability covers it (verify)';
    } else {
      // An unmet knockout is a gap to verify/obtain — never an auto hard-fail (we only know the
      // requirement exists, not that we lack it).
      status = 'conditional';
      basis = tightForLongLead
        ? `no evidence on file, and a long-lead item with only ${input.daysLeft} day(s) to the deadline — likely infeasible; confirm we hold it or no-bid`
        : 'no evidence on file and no matching capability — verify we hold it or can obtain it before bidding';
    }
    out.push({ id, category: p.category, categoryLabel: p.label, text: String(r.text ?? id), status, basis, longLead: p.longLead });
  }
  return out;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const clamp05 = (n: number) => Math.max(0, Math.min(5, n));

/** Derive the auto-scorable factors (0-5) from workspace signals. */
function deriveFactor(key: PWinFactorKey, input: BidAssessmentInput): { score: number; detail: string } | null {
  if (key === 'fit') {
    if (input.capability === 'strong') return { score: 5, detail: 'strong match to a Colaberry service' };
    if (input.capability === 'moderate') return { score: 3, detail: 'moderate match — confirm our fit' };
    return { score: 1, detail: 'no automatic capability match (matcher is literal; confirm by hand)' };
  }
  if (key === 'past_performance') {
    if (input.priorPursuitCount > 0) return { score: 3, detail: `${input.priorPursuitCount} prior pursuit(s) with this agency on record (relevance unverified)` };
    return { score: 2, detail: 'no prior pursuits recorded with this agency — no track record to cite yet' };
  }
  return null; // relationship, competition, price_to_win, teaming, strategic are judgment calls
}

/** Full assessment: Stage A knockouts + Stage B weighted PWin + derived economics + band. */
export function assessBid(input: BidAssessmentInput): BidAssessment {
  const pGo = typeof input.pGo === 'number' ? Math.max(0, Math.min(1, input.pGo)) : 1;
  const knockouts = screenKnockouts(input);
  const hardFailCount = knockouts.filter((k) => k.status === 'hard_fail').length;
  const conditionalCount = knockouts.filter((k) => k.status === 'conditional').length;

  // Stage B factors.
  const op = input.operatorFactors ?? {};
  const factors: PWinFactorScore[] = PWIN_FACTORS.map((f) => {
    const opVal = op[f.key];
    if (typeof opVal === 'number') {
      return { key: f.key, label: f.label, weight: f.weight, score: clamp05(opVal), source: 'operator', detail: 'rated by operator' };
    }
    const d = deriveFactor(f.key, input);
    if (d) return { key: f.key, label: f.label, weight: f.weight, score: clamp05(d.score), source: 'derived', detail: d.detail };
    return { key: f.key, label: f.label, weight: f.weight, score: null, source: 'unrated', detail: 'unrated — a judgment call the workspace has no data for' };
  });

  const known = factors.filter((f) => f.score !== null);
  const knownWeight = known.reduce((s, f) => s + f.weight, 0);
  const weightedSum = known.reduce((s, f) => s + ((f.score as number) / 5) * f.weight, 0);
  const pwinRaw = knownWeight > 0 ? clampScore((weightedSum / knownWeight) * 100) : null;

  // Shipley realism caps.
  const relationship = factors.find((f) => f.key === 'relationship');
  const relationshipStrong = (relationship?.score ?? 0) >= 4;
  const cap = input.pursuitType === 'recompete' ? 70 : relationshipStrong ? 100 : 40;
  const pwin = pwinRaw === null ? null : Math.min(pwinRaw, cap);

  const judgmentRated = factors.filter((f) => !PWIN_FACTORS.find((d) => d.key === f.key)!.derivable && f.score !== null).length;
  const preliminary = judgmentRated === 0;
  const pwinConfidence = Math.round(knownWeight * 100) / 100;

  // Band. A HARD_FAIL is an unconditional no-bid. An open CONDITIONAL gap always caps at
  // bid-with-conditions. A PRELIMINARY score (judgment factors unrated) is never allowed to force a
  // no-bid off an incomplete number — only a HARD_FAIL or a FULLY-rated low PWin no-bids.
  let band: BidBand;
  if (hardFailCount > 0) band = 'no_bid';
  else if (conditionalCount > 0) band = 'bid_with_conditions';
  else if (preliminary) band = 'bid_with_conditions'; // pursuable; rate the judgment factors to refine
  else if (pwin !== null && pwin >= 70) band = 'bid';
  else if (pwin !== null && pwin >= 50) band = 'bid_with_conditions';
  else band = 'no_bid';

  const noAward = hardFailCount > 0;
  const score = noAward ? 0 : (pwin ?? 0);
  const probabilityOfAward = (noAward || pwin === null) ? null : Math.round(pGo * pwin) / 100; // 0-1
  const expectedValue = (noAward || pwin === null || input.estimatedValue == null) ? null : Math.round(input.estimatedValue * pGo * (pwin / 100));
  const bidRoi = (expectedValue === null || !input.bidCostEstimate || input.bidCostEstimate <= 0) ? null : Math.round((expectedValue / input.bidCostEstimate) * 10) / 10;
  const feasibleWindow = input.daysLeft === null ? true : input.daysLeft >= MIN_FEASIBLE_DAYS;

  const bandLabel = band === 'bid' ? 'Bid' : band === 'bid_with_conditions' ? 'Bid with conditions' : 'No-bid';
  const headline =
    hardFailCount > 0 ? `No-bid — ${hardFailCount} hard eligibility fail(s) you can't meet in time.`
    : band === 'bid' ? 'Bid — winnable and clear of disqualifiers.'
    : band === 'bid_with_conditions'
      ? (conditionalCount > 0
          ? `Bid only after closing ${conditionalCount} eligibility gap(s) — e.g. the certifications and references below.`
          : 'Pursuable — rate the judgment factors to sharpen the win probability.')
    : 'No-bid — the win probability does not justify the effort.';

  return {
    band, bandLabel, headline,
    pwin, pwinRaw, pwinConfidence, preliminary, score,
    knockouts, hardFailCount, conditionalCount, factors,
    probabilityOfAward, expectedValue, bidRoi,
    daysLeft: input.daysLeft, feasibleWindow,
  };
}

/** The decision PATH, as a Mermaid flowchart highlighting where THIS pursuit currently sits. */
export function bidAssessmentMermaid(a: BidAssessment): string {
  const here = a.band === 'no_bid' && a.hardFailCount > 0 ? 'KO'
    : a.band === 'no_bid' ? 'SCORE'
    : a.band === 'bid' ? 'BID'
    : 'COND';
  // Mermaid flowchart; the current state gets a thick stroke via classDef.
  return [
    'flowchart TD',
    '  INTAKE([Opportunity intake]) --> KO{Knockout &amp; eligibility screen}',
    '  KO -->|hard fail| NOBID[[NO-BID]]',
    '  KO -->|pass / conditional| FIT[Capability &amp; requirement fit]',
    '  FIT --> PWIN[Competitive position &amp; PWin]',
    '  PWIN --> VALUE[Expected value &amp; effort]',
    '  VALUE --> SCORE{Score &amp; band}',
    '  SCORE -->|PWin &lt; 50| NOBID',
    '  SCORE -->|50-69 or open gap| COND[[BID WITH CONDITIONS]]',
    '  SCORE -->|PWin &gt;= 70, no gap| BID[[BID]]',
    '  COND --> REMEDIATE[Close the gap, then re-score] --> KO',
    '  BID --> CAPTURE([Capture &amp; proposal])',
    `  class ${here} current;`,
    '  classDef current stroke:#FB2832,stroke-width:4px,font-weight:bold;',
  ].join('\n');
}
