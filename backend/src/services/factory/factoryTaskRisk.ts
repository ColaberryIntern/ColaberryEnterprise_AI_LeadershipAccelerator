/**
 * factoryTaskRisk — how risky a task is, derived from what the task itself records.
 *
 * WHY THIS IS ITS OWN MODULE. This lived in `factoryDeliveryBridge` until 2026-11-06, which was
 * the right home while the bridge was its only consumer. Then `factoryValidate` needed the same
 * thresholds, so that a high-risk task naming no approver is reported while the decomposition is
 * still being gated rather than only when it reaches the delivery layer. It reports as a WARNING
 * today, for reasons measured and written down in factoryValidate - so "reported earlier", not
 * yet "refused earlier".
 *
 * The validator could not simply import the bridge. The bridge is the factory->delivery adapter:
 * it depends on `delivery/deliveryStoryContract` and `delivery/releaseGate`, and pointing the
 * upstream gate at the downstream adapter is the import cycle CLAUDE.md names ("A imports B
 * imports A signals a missing third module C that both depend on"). This is C.
 *
 * The alternative - copying four threshold comparisons into the validator - is the mistake this
 * session already paid for once. The `blk-` prefix was an inline literal on the producing side,
 * the consuming side would have carried its own copy, and the two drifting apart is invisible
 * because the symptom looks like a data problem rather than a code problem. Thresholds that
 * decide whether a human must sign off are worse to duplicate, not better.
 *
 * Pure: no I/O, no dependency on either layer's services, so both can depend on it freely.
 */
import type { FactoryTask } from './contracts/factoryContract';
import { deliveryRiskIndex, type DeliveryRiskLevel } from '../../modules/delivery/deliveryRiskLevels';

/**
 * Story risk, from what the task itself records.
 *
 * The table rather than a judgment call, so two runs over the same decomposition agree:
 *   regulated or confidential data, or decide_full authority  -> R4
 *   decide_bounded authority                                  -> R3
 *   recommend authority, or internal data                     -> R2
 *   anything else                                             -> R1
 * R0 is never assigned: a task that exists in a contract decomposition is not risk-free, and
 * R5 is never assigned, because nothing in a task record justifies the top of the scale.
 */
export function riskLevelFor(task: FactoryTask): DeliveryRiskLevel {
  const sensitivity = task.data_sensitivity;
  const authority = task.decision_authority;
  if (sensitivity === 'regulated' || sensitivity === 'confidential' || authority === 'decide_full') return 'R4';
  if (authority === 'decide_bounded') return 'R3';
  if (authority === 'recommend' || sensitivity === 'internal') return 'R2';
  return 'R1';
}

/**
 * The level at or above which a human must be named to approve the work, WHOEVER performs it.
 *
 * R3 UP, which is the SAME threshold `deliveryStoryContract` applies when it raises
 * `high_risk_story_without_approval`. That is the point: the upstream gate and the downstream
 * contract must agree, or a decomposition passes validation and is then rejected as a story,
 * which is exactly the state Herriman was in on 6 Nov.
 */
export const APPROVAL_REQUIRED_FROM: DeliveryRiskLevel = 'R3';

/**
 * True when this task's own risk record means a human has to be named to approve it.
 *
 * WHY THIS IS NOT IMPORTED FROM `deliveryStoryContract`, which expresses the same threshold one
 * line of code away: that module is downstream of this one, and its version reads
 * `DELIVERY_RISK_ORDER.indexOf(story.riskLevel) >= DELIVERY_RISK_ORDER.indexOf('R3')`, where
 * `indexOf` returns -1 for an unknown or null level - so it fails OPEN, treating a level it
 * cannot classify as not high risk. The exported `deliveryRiskIndex` used here fails CLOSED,
 * returning the top of the ladder for anything unrecognized.
 *
 * On every value `riskLevelFor` can produce the two agree exactly, because it only ever returns
 * R1 through R4 and both functions rank known levels identically. The divergence is therefore
 * unreachable from this call path, and unifying the two fail-safe directions is a separate change
 * with its own blast radius (it would start requiring approval on stories whose risk level is
 * unreadable) rather than a side effect of closing this gap. Recorded, not done.
 */
export function requiresNamedApprover(task: FactoryTask): boolean {
  return deliveryRiskIndex(riskLevelFor(task)) >= deliveryRiskIndex(APPROVAL_REQUIRED_FROM);
}
