import { arbitrate } from '../arbiter';
import { hardStopReason, mayProceed } from '../candidates/hardStop';
import type { ArbitrableCandidate, Candidate, HardStopFlags, SuppressedCandidate } from '../types';

/**
 * COMPILE-TIME assertions for T302's type-only widening. Not a jest test — the
 * filename ends `.typecheck.ts` so the runner ignores it; it is graded by
 * running `tsc` over it, exactly like `content/assetVocabulary.typecheck.ts`.
 *
 * What it exists to catch: a widening that degrades to `any`. Making
 * `arbitrate` generic is only safe if the constraint still rejects a candidate
 * that cannot be arbitrated — otherwise the one arbitration point silently
 * accepts anything and the compiler stops helping. Each `@ts-expect-error`
 * below FAILS THE BUILD if the error it expects stops happening.
 */

/* ── the constraint still bites ──────────────────────────────────────────── */

// @ts-expect-error - missing priority_tier: not arbitrable.
void arbitrate([{ action_type: 'X', campaign_key: null, intra_tier_score: 1 }]);

// @ts-expect-error - missing intra_tier_score: not arbitrable.
void arbitrate([{ action_type: 'X', campaign_key: null, priority_tier: 3 }]);

// @ts-expect-error - action_type must be a string, not a number.
void arbitrate([{ action_type: 7, campaign_key: null, priority_tier: 3, intra_tier_score: 1 }]);

// @ts-expect-error - campaign_key is string | null, never undefined.
void arbitrate([{ action_type: 'X', campaign_key: undefined, priority_tier: 3, intra_tier_score: 1 }]);

// @ts-expect-error - a bare object is not arbitrable.
void arbitrate([{}]);

/* ── and still admits what it should ─────────────────────────────────────── */

interface JourneyCandidate extends ArbitrableCandidate {
  action_type: 'SEND_EMAIL' | 'WAIT' | 'CREATE_HUMAN_TASK';
  program_slug: string;
}

const journey: JourneyCandidate = {
  action_type: 'WAIT',
  campaign_key: null,
  priority_tier: 9,
  intra_tier_score: 30,
  program_slug: 'business-growth',
};

// The winner keeps the CALLER's type, so a strategy does not lose its own fields.
const result = arbitrate([journey, null]);
const winnerSlug: string | undefined = result.winner?.program_slug;
void winnerSlug;

// And the suppression's action_type is narrowed to the caller's union, not widened to string.
const dropped: SuppressedCandidate<JourneyCandidate>[] = result.suppressed;
const narrowed: 'SEND_EMAIL' | 'WAIT' | 'CREATE_HUMAN_TASK' | undefined = dropped[0]?.action_type;
void narrowed;

// @ts-expect-error - the narrowing is real: a foreign action_type is rejected.
const wrongUnion: 'SOMETHING_ELSE' | undefined = dropped[0]?.action_type;
void wrongUnion;

/* ── Explorer's own shape still flows through unchanged ──────────────────── */

declare const explorerCandidates: Array<Candidate | null>;
const explorerResult = arbitrate(explorerCandidates);
const explorerWinner: Candidate | null = explorerResult.winner;
void explorerWinner;
// The default type parameter keeps the pre-T302 usage compiling: a bare
// SuppressedCandidate[] still means SuppressedCandidate<Candidate>[].
const explorerSuppressed: SuppressedCandidate[] = explorerResult.suppressed;
void explorerSuppressed;

/* ── HardStopBearer accepts the six flags and nothing less ───────────────── */

const flags: HardStopFlags = {
  converted: false,
  unsubscribed: false,
  dnc: false,
  consentRevoked: false,
  killSwitch: false,
  campaignInactive: false,
};
void hardStopReason({ hardStop: flags });
void mayProceed({ hardStop: flags });
// Absent evidence is not evidence of eligibility: the bearer's field is
// optional precisely so a missing block can be reported as a stop.
void hardStopReason({});

// @ts-expect-error - a partial flag set is not a HardStopFlags.
void hardStopReason({ hardStop: { converted: false } });

// @ts-expect-error - the flags are booleans, not strings.
void mayProceed({ hardStop: { ...flags, dnc: 'yes' } });

export {};
