/**
 * T21 — the per-domain report, and the distinction between `unknown` and zero.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * The amendment's instruction is "use `unknown` where discovery is incomplete; do not manufacture
 * counts". These tests hold the report to both halves: every figure must come from the data, and
 * `unknown` must never be rendered as a zero.
 */

import {
  UNKNOWN,
  buildPhaseReport,
  renderPhaseReportMarkdown,
} from '../agentDomainPhaseReport';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';
import {
  allCapabilities,
  legacyRunTotal,
  liveLegacyRows,
  loadUnresolvedBucket,
  retirementCandidates,
} from '../capabilityRecord';
import type { ManagerReachVerdict } from '../../access/agentManagerReach';

/**
 * Reachability is an INPUT to the report now, so the tests supply it.
 *
 * It used to come from two hardcoded registry fields, and this suite asserted the report echoed
 * them — which it always did, including while those fields were wrong in production for three
 * managers. Passing it in means the report is tested for what it is responsible for (reading its
 * inputs faithfully) and not for an access answer it has no business holding.
 *
 * Deliberately a MIX rather than all-reachable: a report that only ever renders `yes` cannot show
 * that the `NO` column works.
 */
const verdict = (domainKey: string, canReach: boolean): ManagerReachVerdict => ({
  domainKey,
  canReach,
  via: canReach ? 'bridge' : null,
  blocker: canReach ? null : 'org_member_email_mismatch',
  detail: canReach ? 'reaches it via their bridge login.' : 'their login and their org row differ.',
  recordedCanReach: canReach,
  disagreesWithRecord: false,
});

const BLOCKED_IN_FIXTURE = ['admissions', 'sales'];

const REACH = new Map<string, ManagerReachVerdict>(
  AGENT_DOMAIN_KEYS.map((k) => [k, verdict(k, !BLOCKED_IN_FIXTURE.includes(k))]),
);

describe('the report covers every domain, with figures read from the data', () => {
  const r = buildPhaseReport(REACH);

  it('one row per domain, in registry order', () => {
    expect(r.rows.map((x) => x.domain_key)).toEqual([...AGENT_DOMAIN_KEYS]);
  });

  it('the capability total AGREES with the capability data, rather than being typed', () => {
    // The check that makes "read from the data" true rather than aspirational.
    expect(r.totals.capabilities).toBe(allCapabilities().length);
    expect(r.totals.capabilities).toBe(443);
  });

  it('the legacy figures reconcile to 246 across the two buckets', () => {
    expect(r.totals.legacy_rows_with_disposition).toBe(225);
    expect(r.totals.legacy_rows_unresolved).toBe(loadUnresolvedBucket().legacy_row_count);
    expect(r.totals.legacy_rows_unresolved).toBe(21);
    expect(r.totals.legacy_rows_total).toBe(246);
  });

  it('reports 553 stories and 130 releases, which is the corrected composition', () => {
    // 503 + the ten Command Centers, one per domain = 513. Then Phase 2 projected the 964
    // `release_behaviour[]` entries into per-rung stories = 1,477, and gave each project the ten
    // rungs on top of its three kept originals = 130 releases.
    //
    // 1,477 -> 553 on 2026-11-13: the 964 per-rung stories, none of which had ever been completed
    // by anybody, gave way to the 40-story four-step capability ladder -- ten domains, one
    // capability in flight each, four stories apiece. The release count does NOT move: the ten
    // rungs still exist as rungs, they are simply no longer each a row of somebody's work.
    //
    // The implementation total is pinned alongside both so a story count that moves for the wrong
    // reason cannot hide behind the right one: 443 is the number of CAPABILITIES, and it must not
    // move when the ladder shape changes, because a ladder step is not a new capability.
    expect(r.totals.stories).toBe(553);
    expect(r.totals.releases).toBe(130);
    expect(r.rows.reduce((n, x) => n + x.implementation_stories, 0)).toBe(443);
  });

  /**
   * These two used to assert production's split directly — "seven reachable, three blocked", with
   * a comment correcting it from six/four a month earlier. That is the shape of an assertion that
   * has to be edited every time the world moves, and between edits it is simply false: the three
   * it called blocked could all reach their agents.
   *
   * The report's job is to read its input faithfully and total it correctly. So that is what is
   * asserted, against the fixture, and the access answer itself is driven in
   * `agentManagerReach.test.ts` where it belongs.
   */
  it('totals reachability from its input rather than from a figure baked in here', () => {
    expect(r.totals.managers_reachable).toBe(AGENT_DOMAIN_KEYS.length - BLOCKED_IN_FIXTURE.length);
    expect(r.totals.managers_blocked).toBe(BLOCKED_IN_FIXTURE.length);
    // The two must account for every domain. A split that does not add up is how a blocked
    // manager goes uncounted rather than reported.
    expect(r.totals.managers_reachable + r.totals.managers_blocked).toBe(r.rows.length);
  });

  it('marks exactly the domains the input says are blocked', () => {
    const blocked = r.rows.filter((x) => !x.manager_can_reach_surface).map((x) => x.domain_key);
    expect(blocked.sort()).toEqual([...BLOCKED_IN_FIXTURE].sort());
  });

  it('counts distinct accountable humans separately from reachable domains', () => {
    // Two figures that are easy to conflate: the humans behind all ten domains, and the domains
    // whose manager can reach them. Ali holds two domains, so these never match. The human count
    // is a property of the catalog and stays a fixed expectation; the reachable count is not.
    expect(r.totals.distinct_accountable_humans).toBe(9);
    const reachableHumans = new Set(
      r.rows.filter((x) => x.manager_can_reach_surface).map((x) => x.accountable_human),
    );
    expect(reachableHumans.size).toBeLessThanOrEqual(r.totals.distinct_accountable_humans);
    expect(reachableHumans.size).toBeGreaterThan(0);
  });

  it('every blocked domain carries a named reason, never a default', () => {
    for (const row of r.rows.filter((x) => !x.manager_can_reach_surface)) {
      expect(typeof row.blocker).toBe('string');
      // A blocker CODE now, not a prose sentence. The old format was a paragraph naming a cause
      // and a remedy, and a paragraph nobody can diff is a paragraph nobody re-checks: three of
      // them described a missing login that was not missing. A code is checkable.
      expect(row.blocker as string).toMatch(/^[a-z][a-z_]+$/);
    }
    // And a reachable domain carries no blocker, so the field is not decorative.
    for (const row of r.rows.filter((x) => x.manager_can_reach_surface)) {
      expect(row.blocker).toBeNull();
    }
  });
});

describe('unknown is never rendered as zero', () => {
  const r = buildPhaseReport(REACH);

  it('readiness is `unknown` for every domain, because nothing is provisioned', () => {
    expect(r.rows.every((x) => x.production_readiness === UNKNOWN)).toBe(true);
    expect(r.rows.every((x) => x.live_project_id === UNKNOWN)).toBe(true);
  });

  it('unknown cells are COUNTED, and the count is not zero', () => {
    // Two unknown columns across ten domains. If this were zero the distinction would be
    // decorative rather than real.
    expect(r.totals.unknown_cells).toBe(20);
  });

  it('the things that ARE zero are reported as zero, not as unknown', () => {
    // The distinction cuts both ways: a measured absence is a zero.
    expect(r.totals.capabilities_confirmed).toBe(0);
    expect(r.totals.agents_built_this_phase).toBe(0);
    expect(r.totals.projects_provisioned).toBe(0);
    expect(r.totals.build_authorizations).toBe(0);
  });

  it('POSITIVE CONTROL: zero and unknown are different values in the rendered output', () => {
    const md = renderPhaseReportMarkdown(r);
    expect(md).toMatch(/\bunknown\b/);
    expect(md).toMatch(/\| 0 \|/);
    // And the readiness column is never a zero.
    for (const line of md.split('\n').filter((l) => l.startsWith('| ') && /\| unknown \|/.test(l))) {
      expect(line).toMatch(/\| unknown \| no_authorization \|/);
    }
  });
});

describe('the report claims nothing it has not got', () => {
  const r = buildPhaseReport(REACH);
  const md = renderPhaseReportMarkdown(r);

  it('says outright that nothing is activated', () => {
    expect(r.disclosures.join(' ')).toMatch(/NOTHING IS ACTIVATED/);
    expect(r.disclosures.join(' ')).toMatch(/no autonomy level was changed/);
  });

  it('never describes the empty confirmed set as coverage', () => {
    // A mention of "complete coverage" is only an offence when it is CLAIMED. The disclosure says
    // "is not complete coverage", and the first version of this check failed on exactly that --
    // the fourth time in this run a detector has matched the prose that refuses the thing. So
    // every mention must be negated, and a bare claim is still caught by the control below.
    for (const m of md.matchAll(/complete coverage/gi)) {
      const before = md.slice(Math.max(0, (m.index as number) - 30), m.index as number);
      expect(before).toMatch(/\bnot\b|\bno\b/);
    }
    expect(md).not.toMatch(/100%|fully covered/i);
    expect(r.disclosures.join(' ')).toMatch(/is not complete coverage/);
  });

  it('POSITIVE CONTROL: a bare coverage claim would be caught', () => {
    const bare = 'the ten domains have complete coverage';
    const m = /complete coverage/i.exec(bare)!;
    expect(bare.slice(0, m.index)).not.toMatch(/\bnot\b|\bno\b/);
  });

  it('no TABLE ROW calls a domain ready, deployed or live', () => {
    // Scoped to the rows, because the disclosures legitimately say "Five of them are live
    // production rows" about legacy agent records -- a true statement about something else.
    const tableRows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l));
    expect(tableRows).toHaveLength(10); // the scope is real, not an empty filter
    for (const row of tableRows) {
      expect(row).not.toMatch(/\bready\b|\bdeployed\b|\blive\b|\bactive\b/i);
      // Every row's readiness and authorization columns say the honest thing instead.
      expect(row).toMatch(/\| unknown \| no_authorization \|/);
    }
  });

  it('frames intended builders as intentions, not assignments', () => {
    expect(r.disclosures.join(' ')).toMatch(/INTENDED BUILDERS ARE INTENTIONS/);
    expect(r.disclosures.join(' ')).toMatch(/selected subset, not the population/);
    expect(r.disclosures.join(' ')).toMatch(/no assignment or access grant is active/);
  });

  it('names the open owner decision rather than burying it', () => {
    expect(r.disclosures.join(' ')).toMatch(/21 legacy agent rows belong to no domain/);
  });

  /**
   * The live count is DERIVED, and this suite used to pin the wrong literal.
   *
   * It asserted `/Five of them are live production rows/` while `_unresolved.json` had recorded,
   * since 2026-10-28, that five is the count of rows whose PROPOSED KIND is unresolved and that
   * thirteen are live. So the test did not merely miss the defect: it held it in place and made
   * it look deliberate, which is the worst thing a test can do. Found by Tashima Diah on
   * 2026-11-13 by checking the brief against its own sources.
   *
   * These assertions compute the expectation from the same file the report reads, so correcting
   * the measurement again cannot leave the prose behind a third time.
   */
  it('reports the live legacy population from the measurement, not from a literal', () => {
    const bucket = loadUnresolvedBucket();
    const live = liveLegacyRows(bucket);
    const runs = legacyRunTotal(bucket);
    const text = r.disclosures.join(' ');

    expect(text).toMatch(new RegExp(`${live} of them are live production rows`));
    expect(text).toContain(runs.toLocaleString('en-US'));
    expect(text).toMatch(new RegExp(`${retirementCandidates(bucket)} proposed for retirement`));

    // POSITIVE CONTROL. Without this, the assertions above would still pass if the derivation
    // silently returned the old literal, because 5 is a number like any other.
    expect(live).toBe(13);
    expect(live).not.toBe(bucket.rows.filter((x) => x.proposed_kind === 'unresolved').length);
    expect(text).not.toMatch(/Five of them are live/);
  });

  /**
   * Built, not loaded, and that is the whole point.
   *
   * In the shipped `_unresolved.json` every enabled row has also run -- 13 and 13, with zero
   * enabled-but-never-run rows -- so "live means enabled" and "live means has_run" return the
   * SAME number against the real file. A test written against the file therefore proves nothing
   * about which rule is implemented: swapping `enabled` for `has_run` in the derivation left the
   * whole suite green when it was tried. The distinction only shows up on a row this data set
   * does not yet contain, so the input is constructed here.
   */
  describe('liveLegacyRows, on inputs the shipped file does not contain', () => {
    const row = (
      agent_name: string,
      measured: { enabled: boolean; run_count: number; has_run: boolean } | undefined,
    ) => ({
      agent_name,
      proposed_kind: 'behavior',
      source: 'registry',
      disposition: 'unresolved' as const,
      capability_id: null,
      reason: 'constructed for this test',
      ...(measured ? { measured: { on: '2026-10-28', ...measured } } : {}),
    });
    const bucketOf = (rows: ReturnType<typeof row>[]) => ({
      bucket: 'unresolved' as const,
      legacy_row_count: rows.length,
      needs_owner_decision: true,
      rows,
    });

    it('counts an enabled row that has never run', () => {
      // Calling it dormant would understate what a careless retirement touches.
      const b = bucketOf([row('NeverFired', { enabled: true, run_count: 0, has_run: false })]);
      expect(liveLegacyRows(b)).toBe(1);
    });

    it('does NOT count a disabled row that has run in the past', () => {
      const b = bucketOf([row('TurnedOff', { enabled: false, run_count: 9000, has_run: true })]);
      expect(liveLegacyRows(b)).toBe(0);
      // Its history still counts toward the run total: those runs really happened.
      expect(legacyRunTotal(b)).toBe(9000);
    });

    it('treats an unmeasured row as unknown rather than idle', () => {
      const b = bucketOf([row('NeverMeasured', undefined)]);
      expect(liveLegacyRows(b)).toBe(0);
      expect(legacyRunTotal(b)).toBe(0);
    });
  });

  it('renders no intern NAME, because this report is not the internship surface', () => {
    // The report is for the phase handoff, which is not gated on `requireSection('internship')`.
    for (const row of r.rows) {
      if (row.intended_builder) expect(md).not.toContain(row.intended_builder);
    }
  });

  it('POSITIVE CONTROL: the rows DO carry builder names, so the omission above is deliberate', () => {
    expect(r.rows.filter((x) => x.intended_builder !== null).length).toBeGreaterThan(0);
  });

  it('is PURE: two renders are identical', () => {
    expect(renderPhaseReportMarkdown(buildPhaseReport(REACH)))
      .toBe(renderPhaseReportMarkdown(buildPhaseReport(REACH)));
  });
});
