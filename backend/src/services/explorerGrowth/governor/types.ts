import type {
  ExplorerActionType,
  ExplorerAffinity,
  ExplorerAssetPurpose,
  ExplorerOverlay,
  ExplorerPrimaryState,
  ExplorerSignalReadout,
} from '../../../types/explorerGrowth';

/**
 * Explorer Growth OS — Governor vocabulary. Plan §9.2, EPIC 4 T001.
 *
 * A generator is `(context) => Candidate | null`. PURE — no I/O — so the whole
 * eleven-tier matrix is testable without a database, and so a generator
 * structurally cannot send anything.
 */

/** §9.1. Lower wins. Tier 0 is not an action: it terminates the decision. */
export type PriorityTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * What EPIC 5 must supply before an action can carry content.
 *
 * `asset_type` was `string` until EPIC 5. That is why the Governor could ask for
 * `'weekly_digest'` while the registry could only ever hold `'LESSON'` — two
 * disjoint vocabularies meeting at an UNTYPED seam, so no test on either side
 * could fail and the `VARCHAR(32)` column could not object either. Narrowing it
 * to `ExplorerAssetPurpose` turns a request nobody can answer into a compile
 * error rather than an empty result that reads as a content gap.
 */
export interface ContentAssetQuery {
  asset_type: ExplorerAssetPurpose;
  /**
   * Empty means NO PREFERENCE — never "match nothing". Read the second way, the
   * resolver returns zero assets for every learner and the gap report blames the
   * content rather than the query. All 153 profiles carry an empty affinity list
   * today, so that misreading would be total and would look plausible.
   */
  affinity_tags?: string[];
  /**
   * The learner's STATE, which is not a stage tag. Different alphabets: only
   * `PRIMARY_STATE_TO_STAGE` may translate between them. Comparing this directly
   * against an asset's `journey_stage_tags` is the same disjoint-vocabulary bug
   * this interface's `asset_type` just stopped being.
   */
  state?: ExplorerPrimaryState;
}

export interface Candidate {
  action_type: ExplorerActionType;
  campaign_key: string | null;
  priority_tier: PriorityTier;
  /** 0-100, breaks ties inside a tier. */
  intra_tier_score: number;
  channel: 'email' | 'sms' | 'voice' | 'in_app' | 'none';
  required_assets: ContentAssetQuery[];
  /** Why this candidate exists. Survives onto the decision row. */
  rationale: string[];
}

/**
 * Everything a generator may see.
 *
 * Note what is ABSENT: no mailer, no queue, no campaign engine, no model
 * client. A generator cannot act, only propose — enforced by the whitelist
 * guard in `__tests__/noSendPaths.test.ts`.
 */
export interface GovernorContext {
  enrollment_id: string;
  primary_state: ExplorerPrimaryState;
  overlays: ExplorerOverlay[];
  scores: { e: number; i: number; f: number };
  affinities: ExplorerAffinity[];
  readout: ExplorerSignalReadout;
  /** Days since the learner entered the current primary state. §9.4 sort key. */
  days_in_current_state: number;
  /** Resolved fresh at decision time — never the profile's stored copy. */
  contactability: {
    email?: { eligible: boolean; reason?: string };
    sms?: { eligible: boolean; reason?: string };
    voice?: { eligible: boolean; reason?: string };
    in_app?: { eligible: boolean; reason?: string };
  };
  /** Hard-stop inputs (§9.1 tier 0). */
  hardStop: {
    converted: boolean;
    unsubscribed: boolean;
    dnc: boolean;
    consentRevoked: boolean;
    killSwitch: boolean;
    campaignInactive: boolean;
  };
  asOf: Date;
}

export type Generator = (ctx: GovernorContext) => Candidate | null;

/** A candidate that was dropped, and why — the "why NOT" record. */
export interface SuppressedCandidate {
  action_type: ExplorerActionType;
  campaign_key: string | null;
  reason: string;
}

/** What the contact policy needs. Resolved FRESH at decision time. */
export interface ContactPolicyInput {
  channelEligible: boolean;
  channelReason?: string;
  consent: { verdict: 'allow' | 'block'; reason: string; hasRecord: boolean };
  recentContactCount: number;
  hoursSinceLastContact: number | null;
}
