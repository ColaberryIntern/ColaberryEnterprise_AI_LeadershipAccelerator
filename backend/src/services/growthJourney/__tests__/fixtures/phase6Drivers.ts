import type { JourneyCandidate } from '../../governor/types';
import { brandRow } from './phase3Fixtures';
import type { HandoffFixture } from './phase4Fixtures';
import { handoffsOf, lineFor, type TableLine } from './phase4Harness';
import { activeCampaign, arrangeWorld5, AS_OF_4, HOUR, m5, receiptsOf, transportCalls } from './phase5Harness';
import { approve, enrol, plan, reconcile, sendStep } from './phase5Drivers';
import { classifyArrivalOf, declareLearnerAsset, LEARNER_ASSETS, memberCtxFor, type Scenario } from './phase6Scenarios';

/**
 * T601 — the chain helpers of `acceptance.phase6.test.ts`, moved here verbatim
 * so the suite is the cells alone. This file imports production modules
 * (through `phase5Drivers`), so a suite imports it AFTER its jest.mock stanza.
 */

export type Row = Record<string, unknown> & { id: string };
export const table: TableLine[] = [];
export const leadOf = (f: HandoffFixture): number => f.lead!.id;
export const candidatesOf = (row: Row): JourneyCandidate[] => (row.candidates as JourneyCandidate[]) ?? [];
export const later = (hours: number): Date => new Date(AS_OF_4.getTime() + hours * HOUR);
/** The registry rows the suite's `sequelize.query` spy answers Explorer's content read with. */
export const learnerAssets = () => LEARNER_ASSETS;

/** The world for some scenarios, the reviewer a member of the first one's tenant; learner brands with approved content, as after the content-rules run. */
export function world(scenarios: Scenario[], opts: Parameters<typeof arrangeWorld5>[1] = {}): void {
  LEARNER_ASSETS.splice(0, LEARNER_ASSETS.length);
  arrangeWorld5(scenarios.map((s) => s.fixture), { contentReady: new Set(['cpn', 'colaberry-training']), ...opts });
  m5.contextFromAdminRequest.mockResolvedValue(memberCtxFor(scenarios[0].fixture.brand));
  const learnerBrand = scenarios.map((s) => s.fixture.brand).find((b): b is 'cpn' | 'colaberry-training' => b === 'cpn' || b === 'colaberry-training');
  if (learnerBrand) declareLearnerAsset(learnerBrand);
}

/** The arrival through Phase 2's real ladder; the classification the decision then reads; the brief's expectation asserted. */
export async function arrive(s: Scenario) {
  const arrived = await classifyArrivalOf(s);
  s.fixture.classification = arrived.signals;
  expect(arrived.signals.brand_relationship).toBe(s.classify!.brand);
  expect(arrived.signals.primary_path).toBe(s.classify!.path);
  if (s.classify!.review !== undefined) expect(arrived.signals.requires_human_review).toBe(s.classify!.review);
  if (s.classify!.referral) expect(arrived.referral_target_brand_id).toBe(brandRow(s.classify!.referral).id);
  return arrived;
}

/** Plan → approve → enrol → send → reconcile on a live row: ONE transport call, the receipt completed. */
export async function throughTransport(row: Row, f: HandoffFixture, campaignKey: string): Promise<string> {
  activeCampaign(f.brand, campaignKey);
  expect(await plan(row)).toMatchObject({ status: 'planned', mode: 'review' });
  const receiptId = pendingReceiptOf(f);
  expect(await approve(receiptId)).toMatchObject({ outcome: 'approved' });
  expect(await enrol(receiptId)).toMatchObject({ status: 'enrolled', receiptId });
  const before = transportCalls();
  const sent = await sendStep();
  expect(sent.blocked).toEqual([]);
  expect(transportCalls()).toBe(before + 1);
  await reconcile();
  expect(receiptsOf(leadOf(f)).find((r) => r.id === receiptId)!.status).toBe('completed');
  return receiptId;
}

/** This subject's one pending receipt under ITS brand - a person can hold one per brand (H). */
export function pendingReceiptOf(f: HandoffFixture): string {
  const mine = receiptsOf(leadOf(f)).filter((r) => r.brand_id === brandRow(f.brand).id && r.status === 'pending_review');
  expect(mine).toHaveLength(1);
  return String(mine[0].id);
}

export const note = (f: HandoffFixture, execution: string) => table.push(lineFor(f.key, handoffsOf(f)[0] as Row | undefined, execution));
