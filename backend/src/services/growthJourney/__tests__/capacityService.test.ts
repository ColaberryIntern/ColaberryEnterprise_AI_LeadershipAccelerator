import * as fs from 'fs';
import * as path from 'path';
import { Op } from 'sequelize';

const m = { policyFindOne: jest.fn(), handoffCount: jest.fn() };

/**
 * The handoff rows behind `count`, so the status and day filters are EVALUATED
 * rather than only asserted: a mutation that counts `queued` rows changes the
 * number this returns. `handoffCount` is a spy over it (and can be overridden
 * for the failure case).
 */
type HandoffRow = { brand_id: string; owner_queue: string; status: string; created_at: Date };
const handoffs: HandoffRow[] = [];
type CountWhere = { brand_id: string; owner_queue: string; status: { [Op.in]: string[] }; created_at: { [Op.gte]: Date; [Op.lt]: Date } };
const countRows = async ({ where }: { where: CountWhere }) =>
  handoffs.filter(
    (h) =>
      h.brand_id === where.brand_id &&
      h.owner_queue === where.owner_queue &&
      where.status[Op.in].includes(h.status) &&
      h.created_at >= where.created_at[Op.gte] &&
      h.created_at < where.created_at[Op.lt],
  ).length;

jest.mock('../../../models', () => ({
  GrowthJourneyPolicy: { findOne: (...a: unknown[]) => m.policyFindOne(...a) },
  GrowthJourneyHandoff: { count: (...a: unknown[]) => m.handoffCount(...a) },
}));

import { HANDOFF_QUEUE_BY_KIND, resolveQueueCapacity, resolveSalesCapacityFor, utcDayOf } from '../capacityService';
import { JOURNEY_PROGRAMS } from '../../../seeds/growthJourney/journeyProgramDefinitions';
import { phase2SourceFiles } from './phase2Sources';

/**
 * T403 — queue capacity, the source `sales_capacity` never had.
 *
 * The policy row and the handoff count are mocked at the model boundary and
 * their `where` clauses asserted literally: what counts as used (assigned +
 * accepted, today UTC, this brand × queue) IS the claim, and a mock cannot
 * evaluate a filter.
 */

const ASOF = new Date('2026-09-16T15:30:00Z');
const args = (over: Record<string, unknown> = {}) => ({ brandId: 'b-ent', ownerQueue: 'sales' as const, asOf: ASOF, ...over });
const policy = (daily_capacity: number | null) => ({ id: 'pol-1', daily_capacity, sla_hours: 24 });

const row = (status: string, over: Partial<HandoffRow> = {}): HandoffRow => ({ brand_id: 'b-ent', owner_queue: 'sales', status, created_at: ASOF, ...over });

beforeEach(() => {
  handoffs.length = 0;
  m.policyFindOne.mockReset().mockResolvedValue(policy(null));
  m.handoffCount.mockReset().mockImplementation(countRows);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the three answers', () => {
  it("capacity 3 with 2 used → available, the numbers in the reason — and a queued row, yesterday's row, another brand's and another queue's do not count", async () => {
    m.policyFindOne.mockResolvedValue(policy(3));
    handoffs.push(
      row('assigned'),
      row('accepted'),
      row('queued'),
      row('assigned', { created_at: new Date('2026-09-15T23:59:59Z') }),
      row('assigned', { brand_id: 'b-flot' }),
      row('assigned', { owner_queue: 'support' }),
      row('dispositioned'),
      row('expired'),
    );
    expect(await resolveQueueCapacity(args())).toEqual({ capacity: 3, used: 2, status: 'available', reason: 'capacity_available:2/3' });
  });

  it('capacity 3 with 3 used → full; and over-full is full too, never negative room', async () => {
    m.policyFindOne.mockResolvedValue(policy(3));
    handoffs.push(row('assigned'), row('assigned'), row('accepted'));
    expect(await resolveQueueCapacity(args())).toEqual({ capacity: 3, used: 3, status: 'full', reason: 'capacity_full:3/3' });
    handoffs.push(row('accepted'), row('accepted'));
    expect((await resolveQueueCapacity(args())).status).toBe('full');
  });

  it('NULL capacity → unknown, capacity_not_set_by_operator — the seeded state, with the count still reported', async () => {
    m.policyFindOne.mockResolvedValue(policy(null));
    handoffs.push(row('assigned'), row('assigned'), row('accepted'), row('accepted'));
    expect(await resolveQueueCapacity(args())).toEqual({ capacity: null, used: 4, status: 'unknown', reason: 'capacity_not_set_by_operator' });
  });

  it('no policy row at all → unknown, capacity_policy_absent (a preview stack, or a queue nobody seeded)', async () => {
    m.policyFindOne.mockResolvedValue(null);
    expect(await resolveQueueCapacity(args())).toEqual({ capacity: null, used: 0, status: 'unknown', reason: 'capacity_policy_absent' });
  });

  it('capacity 0 is a number an operator set: full, not unknown', async () => {
    m.policyFindOne.mockResolvedValue(policy(0));
    expect((await resolveQueueCapacity(args())).status).toBe('full');
  });

  it('a failed lookup → unknown with the error class, logged with ids only, never thrown', async () => {
    m.handoffCount.mockRejectedValue(Object.assign(new Error('timeout owner@example.com'), { name: 'SequelizeConnectionError' }));
    const c = await resolveQueueCapacity(args());
    expect(c.status).toBe('unknown');
    expect(c.reason).toMatch(/^lookup_failed:/);
    const lines = (console.warn as jest.Mock).mock.calls.map((x) => String(x[0])).join('|');
    expect(lines).toContain('growth_journey.queue_capacity_lookup_failed');
    expect(lines).toContain('"owner_queue":"sales"');
    expect(lines).not.toContain('owner@example.com');
  });
});

describe('what counts as used — the filter is the claim', () => {
  it('reads the ACTIVE queue_capacity row for this brand × queue', async () => {
    await resolveQueueCapacity(args());
    expect(m.policyFindOne.mock.calls[0][0]).toEqual({ where: { brand_id: 'b-ent', policy_type: 'queue_capacity', owner_queue: 'sales', status: 'active' } });
  });

  it('counts assigned + accepted handoffs created today (UTC) in this brand × queue — never queued, never done', async () => {
    await resolveQueueCapacity(args());
    expect(m.handoffCount.mock.calls[0][0]).toEqual({
      where: {
        brand_id: 'b-ent',
        owner_queue: 'sales',
        status: { [Op.in]: ['assigned', 'accepted'] },
        created_at: { [Op.gte]: new Date('2026-09-16T00:00:00Z'), [Op.lt]: new Date('2026-09-17T00:00:00Z') },
      },
    });
  });

  it('the day is the UTC day of asOf, half-open, on both sides of midnight', () => {
    expect(utcDayOf(new Date('2026-09-16T23:59:59.999Z'))).toEqual({ start: new Date('2026-09-16T00:00:00Z'), end: new Date('2026-09-17T00:00:00Z') });
    expect(utcDayOf(new Date('2026-09-17T00:00:00.000Z'))).toEqual({ start: new Date('2026-09-17T00:00:00Z'), end: new Date('2026-09-18T00:00:00Z') });
  });
});

describe('which queue a programme hands to — by kind, never by slug', () => {
  it('learner → admissions, business → sales, consulting → solution_architect', () => {
    expect(HANDOFF_QUEUE_BY_KIND).toEqual({ learner: 'admissions', business: 'sales', consulting: 'solution_architect' });
  });

  it('the four seeded programmes map through their KIND: both learner programmes land in admissions whatever their slug', () => {
    const byBrand = Object.fromEntries(JOURNEY_PROGRAMS.map((p) => [p.brand_slug, HANDOFF_QUEUE_BY_KIND[p.kind]]));
    expect(byBrand).toEqual({ cpn: 'admissions', 'colaberry-training': 'admissions', 'colaberry-enterprise': 'sales', 'ai-flotation': 'solution_architect' });
    expect(JOURNEY_PROGRAMS).toHaveLength(4); // non-vacuity
  });

  it("resolveSalesCapacityFor answers the queue's capacity with the queue named in the reason", async () => {
    m.policyFindOne.mockResolvedValue(policy(2));
    handoffs.push(row('assigned', { brand_id: 'b-flot', owner_queue: 'solution_architect' }));
    expect(await resolveSalesCapacityFor({ brandId: 'b-flot', programKind: 'consulting', asOf: ASOF })).toEqual({
      value: 'available',
      reason: 'solution_architect:capacity_available:1/2',
      queue: 'solution_architect',
    });
    expect(m.policyFindOne.mock.calls[0][0].where.owner_queue).toBe('solution_architect');
  });
});

describe('what the file is, and is not', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'capacityService.ts'), 'utf8');

  it('is in the guarded tree', () => {
    expect(phase2SourceFiles().map((f) => path.basename(f))).toContain('capacityService.ts');
  });

  it('never writes: no create, update, destroy — a reader over the operator\'s row and the handoff count', () => {
    for (const bad of [/\.create\(/, /\.update\(/, /\.destroy\(/, /\.upsert\(/, /\.bulkCreate\(/]) expect(src).not.toMatch(bad);
    expect(src).toMatch(/GrowthJourneyHandoff\.count\(/);
    expect(src).toMatch(/GrowthJourneyPolicy\.findOne\(/);
  });

  it("does not touch Ali's own caps: the one capacity mechanism here is per brand × queue for handoffs", () => {
    // Comments stripped: the header NAMES the other mechanisms to say it leaves them alone.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/evaluateAliOutreachEligibility|aliPersonalOutreach|scheduled_emails|evaluateContact\(/);
    expect(code).not.toMatch(/from '\.\.\/explorerGrowth|from '\.\.\/\.\.\/aliPersonal|from '\.\.\/\.\.\/schedulerService/);
  });
});
