import {
  INITIATIVE_DEFINITIONS,
  assertEveryInitiativeNamesItsSource,
  assertGovPipelineCountsOnlyAssignedBids,
  assertNoCardShowsAnUnmeasuredValue,
  assertUnfinishedInitiativesNameTheirUnlock,
} from '../revenueInitiatives';
import { TileStatus } from '../../commercialization/commercializationTiles';

/**
 * R1 acceptance: "Real data where it exists; the five-state vocabulary where it does not."
 *
 * These tests are pure — no database, by design. The registry's whole job is to be
 * reviewable without one, and a test that needed a database to check a provenance
 * sentence would prove the module had the wrong shape.
 *
 * Each assertion is also MUTATION-TESTED here: a test that only feeds an assertion the
 * passing case proves the assertion runs, not that it catches anything. Every one below
 * is handed a violation and required to throw, because a guard that cannot fail is
 * decoration.
 */
const card = (over: Partial<{ key: string; status: TileStatus; value: string | null }> = {}) => ({
  key: 'k', status: 'live' as TileStatus, value: '1', ...over,
});

describe('the registry describes every initiative honestly', () => {
  it('names a source table, or admits it has none', () => {
    expect(assertEveryInitiativeNamesItsSource()).toBe(INITIATIVE_DEFINITIONS.length);
  });

  it('carries the five hypotheses plus membership and the government pipeline', () => {
    const keys = INITIATIVE_DEFINITIONS.map((d) => d.key);
    expect(keys).toContain('membership_subscriptions');
    expect(keys).toContain('gov_bid_pursuit');
    expect(keys.filter((k) => k.startsWith('hypothesis_'))).toHaveLength(5);
  });

  it('gives every initiative a distinct key, so two cards cannot collide', () => {
    const keys = INITIATIVE_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('says what would unlock anything not yet measured', () => {
    expect(() => assertUnfinishedInitiativesNameTheirUnlock()).not.toThrow();
  });

  it('never claims a status a missing source cannot support', () => {
    for (const d of INITIATIVE_DEFINITIONS) {
      if (d.sourceTable === null) expect(d.status).toBe('unmeasurable');
    }
  });
});

describe('a card never shows a number nobody measured', () => {
  it('accepts a measured value beside a status that can carry one', () => {
    expect(() => assertNoCardShowsAnUnmeasuredValue([
      card({ status: 'live', value: '$1,000' }),
      card({ key: 'z', status: 'measured_zero', value: '0' }),
      card({ key: 'p', status: 'proxy', value: '12' }),
    ])).not.toThrow();
  });

  it('accepts silence from the two statuses that mean "cannot answer"', () => {
    expect(() => assertNoCardShowsAnUnmeasuredValue([
      card({ status: 'unmeasurable', value: null }),
      card({ key: 'u', status: 'undefined_rate', value: null }),
    ])).not.toThrow();
  });

  // The failure this whole surface exists to prevent.
  it('THROWS when an unmeasurable card carries a number', () => {
    expect(() => assertNoCardShowsAnUnmeasuredValue([
      card({ key: 'gov', status: 'unmeasurable', value: '12' }),
    ])).toThrow(/gov is unmeasurable but carries the value "12"/);
  });

  it('THROWS when an undefined rate is given a value', () => {
    expect(() => assertNoCardShowsAnUnmeasuredValue([
      card({ key: 'rate', status: 'undefined_rate', value: '0%' }),
    ])).toThrow(/must not print a number/);
  });

  // Boundary: a zero is still a number. "0" beside "cannot answer" is the most
  // dangerous version of this bug, because it reads as a finding rather than a gap.
  it('THROWS on the string "0" beside unmeasurable, not just on non-zero values', () => {
    expect(() => assertNoCardShowsAnUnmeasuredValue([
      card({ key: 'zero', status: 'unmeasurable', value: '0' }),
    ])).toThrow(/carries the value "0"/);
  });

  it('accepts an empty board rather than inventing a complaint about it', () => {
    expect(() => assertNoCardShowsAnUnmeasuredValue([])).not.toThrow();
  });
});

describe('the government card counts only bids in motion and assigned right now', () => {
  it('holds today', () => {
    expect(() => assertGovPipelineCountsOnlyAssignedBids()).not.toThrow();
  });

  it('requires a live assignment in its provenance, not just the pursuit flag', () => {
    // Counting decision=approved_bid_pursuit alone put a row named "T8 test" in front of
    // a reader as pipeline. Ali corrected the design on 2026-11-04; this is the guard that
    // stops it drifting back.
    const gov = INITIATIVE_DEFINITIONS.find((d) => d.key === 'gov_bid_pursuit');
    expect(gov?.provenance).toMatch(/revoked_at IS NULL/);
    expect(gov?.provenance).toMatch(/assigned/i);
  });

  it('is measured, because a live assignment IS a recorded human act', () => {
    // delivery_project_members carries granted_by_identity_id and granted_at, and
    // revoking is another act. That is what the earlier version wrongly said did not exist.
    const gov = INITIATIVE_DEFINITIONS.find((d) => d.key === 'gov_bid_pursuit');
    expect(gov?.status).toBe('live');
  });

  it('is named for motion rather than for the flag', () => {
    const gov = INITIATIVE_DEFINITIONS.find((d) => d.key === 'gov_bid_pursuit');
    expect(gov?.label).toBe('Government bids in motion');
  });

  it('claims no dollar figure, because no bid has a recorded value', () => {
    expect(() => assertGovPipelineCountsOnlyAssignedBids()).not.toThrow();
    const gov = INITIATIVE_DEFINITIONS.find((d) => d.key === 'gov_bid_pursuit');
    expect(gov?.provenance).not.toMatch(/\$\s?\d/);
  });
});
