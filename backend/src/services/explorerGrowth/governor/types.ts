import type {
  ExplorerActionType,
  ExplorerAffinity,
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

/** What EPIC 5 must supply before an action can carry content. */
export interface ContentAssetQuery {
  asset_type: string;
  affinity_tags?: string[];
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
