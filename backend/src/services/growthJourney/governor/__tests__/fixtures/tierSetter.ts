import type { JourneyCandidate } from '../../types';

/**
 * The negative control for the one-arbitration-point scan (T303).
 *
 * The scan's job is to prove no file under `services/growthJourney/` ranks
 * candidates itself — that arbitration happens once, in the Governor's own
 * `arbitrate`. The obvious way to write that scan is to look for the words
 * `priority_tier`, and the obvious way is wrong: every generator must SET a
 * tier on the candidates it proposes, so a scan for the identifier would
 * either flag honest code or be narrowed until it saw nothing at all.
 *
 * So the scan looks for a COMPARATOR over tiers, and this file is what proves
 * the distinction is real: it sets `priority_tier` on three candidates and
 * never compares two of them. If the scan ever flags this file, the scan is
 * too broad and the test says so.
 *
 * Cycle 2 of the plan audit caught the first version of this control citing
 * T310's generators — seven tasks away — which would have left the scan
 * unproven at its own grading time. Hence a fixture that exists now.
 */

export const TIER_SETTING_CANDIDATES: JourneyCandidate[] = [
  {
    action_type: 'SEND_EMAIL',
    campaign_key: 'gj_business_capability_education',
    priority_tier: 7,
    intra_tier_score: 40,
    channel: 'email',
    required_assets: [],
    rationale: ['sets a tier, compares nothing'],
  },
  {
    action_type: 'SHOW_IN_APP_NUDGE',
    campaign_key: null,
    priority_tier: 9,
    intra_tier_score: 30,
    channel: 'in_app',
    required_assets: [],
    rationale: ['also sets a tier'],
  },
  {
    action_type: 'CREATE_HUMAN_TASK',
    campaign_key: null,
    priority_tier: 3,
    intra_tier_score: 80,
    channel: 'none',
    required_assets: [],
    rationale: ['a task needs no channel'],
  },
];

/** Sets a tier from a score band. Still no comparison of two candidates. */
export function tierFor(score: number): number {
  if (score >= 80) return 3;
  if (score >= 50) return 7;
  return 9;
}
