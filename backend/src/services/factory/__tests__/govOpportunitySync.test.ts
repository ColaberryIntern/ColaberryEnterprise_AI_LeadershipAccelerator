/**
 * Gov daily tracking (narrow v1). The pure diff is tested directly; the runner is tested with the DB (sequelize),
 * the model, and the feed MOCKED (so it runs in CI, no database). Asserts: ships dark when the flag is off, is
 * idempotent per day, detects a changed close date / a drop from the feed, and refreshes the stored baseline.
 */
const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => query(...a) } }));
const findAll = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findAll: (...a: any[]) => findAll(...a) } }));
const fetchBestFitOpportunities = jest.fn();
jest.mock('../opportunities/oppPulseClient', () => ({ fetchBestFitOpportunities: (...a: any[]) => fetchBestFitOpportunities(...a) }));

import { FLAGS } from '../../../config/featureFlags';
import { diffGovOpportunity, syncPursuedGovOpportunities } from '../govOpportunitySync';

const GWS = 'gws:04ac1711-c3f6-418a-9d9b-c5e6211295ec';
const UUID = '04ac1711-c3f6-418a-9d9b-c5e6211295ec';

describe('diffGovOpportunity (pure)', () => {
  it('first sight -> first_seen', () => expect(diffGovOpportunity(null, { closeDate: '2026-10-22', present: true }).kind).toBe('first_seen'));
  it('a changed close date -> deadline_changed (detail names both dates)', () => {
    const c = diffGovOpportunity({ closeDate: '2026-10-22', present: true }, { closeDate: '2026-11-05', present: true });
    expect(c.kind).toBe('deadline_changed');
    expect(c.detail).toContain('2026-10-22');
    expect(c.detail).toContain('2026-11-05');
  });
  it('gone from the feed -> dropped_from_feed', () => expect(diffGovOpportunity({ closeDate: '2026-10-22', present: true }, { closeDate: null, present: false }).kind).toBe('dropped_from_feed'));
  it('reappeared -> returned_to_feed', () => expect(diffGovOpportunity({ closeDate: null, present: false }, { closeDate: '2026-10-22', present: true }).kind).toBe('returned_to_feed'));
  it('unchanged -> none', () => expect(diffGovOpportunity({ closeDate: '2026-10-22', present: true }, { closeDate: '2026-10-22', present: true }).kind).toBe('none'));
});

describe('syncPursuedGovOpportunities (runner, mocked DB/feed)', () => {
  const setupQuery = (opts: { claimed?: boolean; state?: any }) => {
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('UPDATE system_settings') && String(sql).includes('gov_sync_run_log')) {
        return opts.claimed === false ? [] : [{ key: 'gov_sync_run_log' }];
      }
      if (String(sql).includes('SELECT value FROM system_settings')) return [{ value: opts.state ?? {} }];
      return [];
    });
  };
  const writtenState = () => {
    const call = query.mock.calls.find((c) => String(c[0]).includes('ON CONFLICT (key) DO UPDATE SET value'));
    return call ? JSON.parse(call[1].replacements.v) : null;
  };
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { (FLAGS as any).govDailySync = false; });

  it('ships dark: flag off -> skipped, touches nothing', async () => {
    (FLAGS as any).govDailySync = false;
    const r = await syncPursuedGovOpportunities();
    expect(r.skipped).toBe('disabled');
    expect(query).not.toHaveBeenCalled();
    expect(findAll).not.toHaveBeenCalled();
  });

  it('idempotent: flag on but the slot was already claimed today -> skipped', async () => {
    (FLAGS as any).govDailySync = true;
    setupQuery({ claimed: false });
    const r = await syncPursuedGovOpportunities();
    expect(r.skipped).toBe('already_ran_today');
    expect(findAll).not.toHaveBeenCalled();
  });

  it('flags a changed close date and refreshes the stored baseline', async () => {
    (FLAGS as any).govDailySync = true;
    setupQuery({ claimed: true, state: { [GWS]: { closeDate: '2026-10-22', present: true, syncedAt: 'x', change: null } } });
    findAll.mockResolvedValue([{ canonical_opportunity_id: GWS, bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2 }]);
    fetchBestFitOpportunities.mockResolvedValue({ opportunities: [{ uuid: UUID, closeDate: '2026-11-05' }] });
    const r = await syncPursuedGovOpportunities();
    expect(r).toMatchObject({ checked: 1, changed: 1 });
    expect(r.changes[0].change.kind).toBe('deadline_changed');
    const st = writtenState();
    expect(st[GWS].closeDate).toBe('2026-11-05');           // baseline refreshed
    expect(st[GWS].change.kind).toBe('deadline_changed');   // change recorded for the workspace
  });

  it('flags a dropped-from-feed opportunity', async () => {
    (FLAGS as any).govDailySync = true;
    setupQuery({ claimed: true, state: { [GWS]: { closeDate: '2026-10-22', present: true, syncedAt: 'x', change: null } } });
    findAll.mockResolvedValue([{ canonical_opportunity_id: GWS, bidding_entity: 'colaberry', decision: 'approved_bid_pursuit', version: 3 }]);
    fetchBestFitOpportunities.mockResolvedValue({ opportunities: [] }); // no longer in the feed
    const r = await syncPursuedGovOpportunities();
    expect(r.changes[0].change.kind).toBe('dropped_from_feed');
    expect(writtenState()[GWS].present).toBe(false);
  });

  it('ignores canonical (op:gov:) records — v1 feed only syncs decoupled gws threads', async () => {
    (FLAGS as any).govDailySync = true;
    setupQuery({ claimed: true, state: {} });
    findAll.mockResolvedValue([{ canonical_opportunity_id: 'op:gov:0000000000000000000000000000aaaa', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 1 }]);
    fetchBestFitOpportunities.mockResolvedValue({ opportunities: [] });
    const r = await syncPursuedGovOpportunities();
    expect(r.checked).toBe(0);
  });
});
