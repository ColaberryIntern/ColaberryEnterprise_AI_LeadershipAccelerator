/**
 * The fixture path is a DEV-ONLY convenience and production fails closed. Proves: fixtures resolve only outside
 * production and only when no live base is configured; in production without live config the resolver returns
 * `unavailable` (never a fixture), so production can never bind an approval to fixture data even via a direct
 * service call; and the labeled degraded / snapshot-unrecorded fixtures resolve to the non-approvable states.
 */
import { resolveGovOpportunityDetail, isLiveOpDetailConfigured } from '../opDetailClient';
import { CLEAN_CANONICAL, UNAVAILABLE_CANONICAL, DEGRADED_CANONICAL, UNRECORDED_CANONICAL } from '../govOpportunityFixtures';

let prevBase: string | undefined; let prevKey: string | undefined; let prevV2Key: string | undefined; let prevEnv: string | undefined;
beforeEach(() => {
  prevBase = process.env.OPPORTUNITY_PULSE_V2_BASE; prevKey = process.env.OPPORTUNITY_PULSE_API_KEY; prevV2Key = process.env.OPPORTUNITY_PULSE_V2_API_KEY; prevEnv = process.env.NODE_ENV;
  delete process.env.OPPORTUNITY_PULSE_V2_BASE; // not live-configured
  delete process.env.OPPORTUNITY_PULSE_V2_API_KEY;
  delete process.env.OPPORTUNITY_PULSE_API_KEY;
});
afterEach(() => {
  const restore = (k: string, v: string | undefined) => { if (v === undefined) delete (process.env as any)[k]; else (process.env as any)[k] = v; };
  restore('OPPORTUNITY_PULSE_V2_BASE', prevBase); restore('OPPORTUNITY_PULSE_API_KEY', prevKey); restore('OPPORTUNITY_PULSE_V2_API_KEY', prevV2Key); restore('NODE_ENV', prevEnv);
});

it('outside production, an unconfigured live base falls back to fixtures', async () => {
  (process.env as any).NODE_ENV = 'test';
  expect(isLiveOpDetailConfigured()).toBe(false);
  const r = await resolveGovOpportunityDetail(CLEAN_CANONICAL);
  expect(r.state).toBe('available');
  expect(r.isFixture).toBe(true);
  expect(r.sourceSnapshotVersion).toBe(3);
});

it('an unknown canonical id resolves unavailable (fail closed)', async () => {
  (process.env as any).NODE_ENV = 'test';
  expect((await resolveGovOpportunityDetail(UNAVAILABLE_CANONICAL)).state).toBe('unavailable');
});

it('the degraded fixture resolves degraded; the unrecorded fixture resolves snapshot_unrecorded', async () => {
  (process.env as any).NODE_ENV = 'test';
  expect((await resolveGovOpportunityDetail(DEGRADED_CANONICAL)).state).toBe('degraded');
  const un = await resolveGovOpportunityDetail(UNRECORDED_CANONICAL);
  expect(un.state).toBe('snapshot_unrecorded');
  expect(un.snapshotRecorded).toBe(false);
});

it('PRODUCTION without live config resolves unavailable — NEVER a fixture (UI-bypass safe)', async () => {
  (process.env as any).NODE_ENV = 'production';
  const r = await resolveGovOpportunityDetail(CLEAN_CANONICAL);
  expect(r.state).toBe('unavailable');
  expect(r.isFixture).toBe(false);
  expect(r.detail).toBeNull();
});
