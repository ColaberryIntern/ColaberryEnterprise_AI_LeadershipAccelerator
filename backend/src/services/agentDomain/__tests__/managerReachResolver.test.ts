/**
 * `resolveManagerReach` — and specifically what it does when it cannot read the rosters.
 *
 * The reachability columns on `agent_domain_projects` are a DERIVED CACHE. Until 2026-11-13 an
 * unreadable roster threw straight out of `reconcileAnchorMetadata`, so a transient database error
 * while refreshing that cache took down the provision it was annotating. The integration tier
 * found it, three tests red on `main`; in production the same fault would have been intermittent
 * and much harder to see.
 *
 * The contract being pinned here is narrow and important: **a roster we could not read must never
 * become a silent all-clear.** That is the exact failure the hardcoded registry constant this
 * resolver replaced had been committing for a month, and degrading the wrong way would reinstate
 * it with a friendlier face.
 */

import type { Sequelize } from 'sequelize';
import { resolveManagerReach, reachFor, unknownReach } from '../managerReachResolver';

const failing = (message: string, name = 'DatabaseError'): Sequelize => ({
  query: jest.fn().mockRejectedValue(Object.assign(new Error(message), { name })),
} as unknown as Sequelize);

const returning = (rows: unknown[]): Sequelize => ({
  query: jest.fn().mockResolvedValue(rows),
} as unknown as Sequelize);

describe('resolveManagerReach degrades instead of aborting', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('resolves rather than throwing when a roster is unreadable', async () => {
    await expect(
      resolveManagerReach(failing('relation "org_members" does not exist')),
    ).resolves.toBeInstanceOf(Map);
  });

  it('returns an empty map, so every domain falls through to unknownReach', async () => {
    const map = await resolveManagerReach(failing('relation "community_members" does not exist'));
    expect(map.size).toBe(0);
  });

  it('NEVER reports a domain as reachable when the rosters could not be read', async () => {
    // The assertion this whole file exists for. `canReach` must be false and the blocker named.
    const map = await resolveManagerReach(failing('connection terminated unexpectedly'));
    for (const key of ['platform', 'marketing', 'admissions', 'website']) {
      const verdict = reachFor(map, key);
      expect(verdict.canReach).toBe(false);
      expect(verdict.via).toBeNull();
      expect(verdict.blocker).toBeTruthy();
      expect(verdict).toEqual(unknownReach(key));
    }
  });

  it('logs a structured, classified warning rather than swallowing the error', async () => {
    // A silent catch would be a production defect in its own right: the cache would go stale and
    // nothing would say why.
    await resolveManagerReach(failing('connection terminated unexpectedly', 'ConnectionError'));
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warn.mock.calls[0][0] as string);
    expect(logged.event).toBe('manager_reach_facts_unreadable');
    expect(logged.level).toBe('warn');
    expect(logged.outcome).toBe('partial');
    expect(logged.error_class).toBe('ConnectionError');
    expect(logged.context.detail).toContain('connection terminated');
    // Says what the degradation COSTS, so a reader of the log does not have to infer it.
    expect(logged.context.consequence).toContain('canReach=false');
  });

  it('POSITIVE CONTROL: a readable roster still produces a real verdict', async () => {
    // Proves the tests above measure the failure path rather than passing because the resolver
    // never returns anything. Without this, gutting the happy path would leave the file green.
    const map = await resolveManagerReach(returning([{
      domain_key: 'platform',
      recorded_can_reach: true,
      org_member_email: 'kes@colaberry.com',
      agents_reporting: 6,
      bridge_mgmt_role: 'admin',
      bridge_extra_sections: null,
      bridge_token_email: 'kes@colaberry.com',
      legacy_role: null,
      legacy_token_email: null,
    }]));
    expect(map.size).toBe(1);
    const verdict = reachFor(map, 'platform');
    expect(verdict.domainKey).toBe('platform');
    expect(verdict.canReach).toBe(true);
    expect(verdict.via).toBe('bridge');
    expect(verdict).not.toEqual(unknownReach('platform'));
  });

  it('a domain missing from a SUCCESSFUL read is still never silently reachable', async () => {
    // Different cause, same rule: the query worked, this domain simply has no anchor row.
    const map = await resolveManagerReach(returning([]));
    expect(reachFor(map, 'curriculum').canReach).toBe(false);
    expect(reachFor(map, 'curriculum').blocker).toBe('org_member_missing');
  });
});
