/**
 * operationalLeverage — pure leverage reasoning over already-classified
 * domain buckets.
 *
 * Operational Leverage Sprint, 2026-05-15.
 *
 * "Leverage" here is the observation that effort doesn't pay off uniformly
 * across the operational system. Strengthening a foundational area that
 * many other areas depend on changes more of the system than polishing a
 * mature one with no downstream. This file *describes* that — it does not
 * recommend, instruct, or rank tasks.
 *
 * Hard rules — asserted by the unit tests:
 *   - No imperatives ("you should", "fix", "do", "must", "need to").
 *   - Conditional framing only ("would", "could", "may").
 *   - No certainty words ("guaranteed", "optimal", "perfect", "definitely").
 *   - Every builder returns null when there is nothing meaningful to say,
 *     so surfaces can render nothing rather than fall back to filler.
 *
 * The score formula is intentionally simple and editorial:
 *
 *   leverageScore = downstreamCount * maturityHeadroom
 *
 * A foundational domain that supports four others (headroom 5 × 4 = 20)
 * outscores a stabilized anchor that supports the same four (0 × 4 = 0).
 * The system is calling out where effort has room to ripple — not telling
 * the operator what to do.
 */
import {
  lifecycleMaturityIndex,
  MAX_MATURITY_INDEX,
  type DomainBucket,
  type DomainProfile,
} from './bpDomainClassifier';

export type LeverageReason =
  | 'broadest_surface'        // many downstream regardless of maturity
  | 'constrained_downstream'  // downstream depend on it AND it has room to grow
  | 'mature_anchor';          // many downstream and already mature — context, not call to action

export interface LeverageScore {
  bucket: DomainBucket;
  score: number;
  reason: LeverageReason;
}

export interface LimitingFactor {
  /** The mature-but-constrained domain. */
  bucket: DomainBucket;
  /** The upstream area limiting it (parsed from the bucket's existing pressureNote). */
  upstreamLabel: string | null;
}

export interface SystemLeverage {
  /** The domain with the highest current operational leverage, or null when no clear winner. */
  highest: LeverageScore | null;
  /** Mature-but-constrained domains, derived from existing pressureNote signals. */
  limitingFactors: LimitingFactor[];
  /** Optional one-line phrase about overall maturity distribution. Null when uninformative. */
  systemEvolution: string | null;
}

export interface LeverageSummary {
  highestLeverageLabel: string;
  reason: LeverageReason;
  evolutionPhrase: string | null;
  at: string;
}

/**
 * Minimum score to call something "high leverage" — keeps the headline
 * silent when nothing meaningfully stands out (e.g. all domains stabilized
 * or all supports zero downstream).
 */
const MIN_LEVERAGE_SCORE = 3;

const LEVERAGE_SUMMARY_STALE_HOURS = 72;

// ---------------------------------------------------------------------------
export function computeSystemLeverage(buckets: DomainBucket[]): SystemLeverage {
  if (buckets.length === 0) {
    return { highest: null, limitingFactors: [], systemEvolution: null };
  }

  // Score each bucket: downstreamCount * maturityHeadroom.
  const scored: LeverageScore[] = buckets.map(b => {
    const headroom = MAX_MATURITY_INDEX - lifecycleMaturityIndex(b.lifecycleState);
    const score = b.downstreamCount * headroom;
    const reason: LeverageReason =
      headroom === 0 && b.downstreamCount >= 2 ? 'mature_anchor' :
      b.downstreamCount >= 3 && headroom <= 2 ? 'broadest_surface' :
      'constrained_downstream';
    return { bucket: b, score, reason };
  });

  // Pick the highest. Tie-break by orderIndex (earlier in the flow wins).
  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.bucket.orderIndex - b.bucket.orderIndex;
  });
  const top = sorted[0];
  const highest = top && top.score >= MIN_LEVERAGE_SCORE ? top : null;

  // Limiting factors — domains the classifier already flagged with a pressure note
  // because an upstream is weaker than they are.
  const limitingFactors: LimitingFactor[] = buckets
    .filter(b => !!b.pressureNote && lifecycleMaturityIndex(b.lifecycleState) >= 2)
    .map(b => ({ bucket: b, upstreamLabel: extractUpstreamLabel(b.pressureNote) }));

  return { highest, limitingFactors, systemEvolution: systemEvolutionPhrase(buckets) };
}

/** Best-effort upstream-label parse from the existing pressureNote sentence. */
function extractUpstreamLabel(pressureNote: string | null): string | null {
  if (!pressureNote) return null;
  // pressureNote shape: "Constrained by early-stage {Label} upstream — …"
  const m = pressureNote.match(/Constrained by early-stage ([^—]+?) upstream/);
  return m ? m[1].trim() : null;
}

/** One ambient sentence about overall system maturity. Null when uninformative. */
function systemEvolutionPhrase(buckets: DomainBucket[]): string | null {
  if (buckets.length < 3) return null;
  const avg = buckets.reduce((s, b) => s + lifecycleMaturityIndex(b.lifecycleState), 0) / buckets.length;
  if (avg < 1.2) return 'Your operational structure is still being scaffolded — most areas have room to mature.';
  if (avg < 2.2) return 'Your operational structure is in early coordination — the through-lines are forming but maturity is uneven.';
  if (avg < 3.2) return 'Your operational structure is broadly coordinated — most areas are wired and producing reliably.';
  if (avg < 4.0) return 'Your operational structure is operating at scale — ongoing work is widening, not building.';
  return 'Your operational structure is mature and stable — ongoing work is refinement.';
}

// ---------------------------------------------------------------------------
/** Editorial headline — "Highest operational leverage currently sits in …". Null when no clear winner. */
export function leverageHeadline(sys: SystemLeverage): string | null {
  const top = sys.highest;
  if (!top) return null;
  const bucket = top.bucket;
  const downstreamLabels = bucket.relationships
    .filter(r => r.verb === 'feeds' || r.verb === 'supports')
    .map(r => r.targetLabel);
  const joined = joinLabels(downstreamLabels);

  if (top.reason === 'mature_anchor') {
    return joined
      ? `${bucket.label} currently anchors the broadest operational surface, supporting ${joined}.`
      : `${bucket.label} currently anchors the broadest operational surface.`;
  }
  if (top.reason === 'broadest_surface') {
    return joined
      ? `${bucket.label} currently supports the broadest operational surface — strengthening it would ripple through ${joined}.`
      : `${bucket.label} currently supports the broadest operational surface.`;
  }
  // constrained_downstream
  const n = bucket.downstreamCount;
  const tail = joined ? ` (${joined})` : '';
  return `Highest operational leverage currently sits in ${bucket.label} — strengthening it would unblock ${n} downstream area${n === 1 ? '' : 's'}${tail}.`;
}

/**
 * Forward-looking note per bucket — complements the existing backward-
 * looking pressureNote. The classifier says "you are constrained by X
 * upstream"; this says "strengthening this would stabilize Y downstream".
 * Two halves of the same coin, intentionally mirrored.
 */
export function forwardLookingNote(bucket: DomainBucket): string | null {
  if (bucket.downstreamCount === 0) return null;
  const maturity = lifecycleMaturityIndex(bucket.lifecycleState);
  if (maturity >= MAX_MATURITY_INDEX) return null;       // nothing forward to say
  const n = bucket.downstreamCount;
  if (maturity <= 1) {
    return `Strengthening this would stabilize the ${n} downstream area${n === 1 ? '' : 's'} that depend${n === 1 ? 's' : ''} on it.`;
  }
  if (maturity <= 3) {
    return `Continued maturation here would reinforce ${n} downstream area${n === 1 ? '' : 's'}.`;
  }
  return `Further refinement here may further stabilize ${n} downstream area${n === 1 ? '' : 's'}.`;
}

/**
 * Downstream-support line for the OperatorFocusCard — uses the static
 * profile only, no live data needed. Null when the focus domain has no
 * downstream relationships.
 */
export function downstreamSupportLine(profile: DomainProfile): string | null {
  const n = profile.downstreamCount;
  if (n === 0) return null;
  if (n >= 4) return 'This area supports the broadest operational surface.';
  if (n === 1) return 'This area supports 1 downstream area.';
  return `This area supports ${n} downstream areas.`;
}

/**
 * Ambient Home line — reads from cached lastLeverageSummary written by
 * BPDomainSurface on leave. Stale summaries (>72h) are suppressed so the
 * line never lies about the current system state.
 */
export function homeLeverageLine(summary: LeverageSummary | undefined, now: number = Date.now()): string | null {
  if (!summary) return null;
  const ageMs = now - new Date(summary.at).getTime();
  if (!isFinite(ageMs) || ageMs < 0) return null;
  if (ageMs > LEVERAGE_SUMMARY_STALE_HOURS * 60 * 60 * 1000) return null;
  return `Highest operational leverage in your system currently sits in ${summary.highestLeverageLabel}.`;
}

/** Build the summary BPDomainSurface persists to workspace memory on leave. Null when nothing to remember. */
export function buildLeverageSummary(sys: SystemLeverage, now: number = Date.now()): LeverageSummary | null {
  if (!sys.highest) return null;
  return {
    highestLeverageLabel: sys.highest.bucket.label,
    reason: sys.highest.reason,
    evolutionPhrase: sys.systemEvolution,
    at: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------------------
function joinLabels(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
