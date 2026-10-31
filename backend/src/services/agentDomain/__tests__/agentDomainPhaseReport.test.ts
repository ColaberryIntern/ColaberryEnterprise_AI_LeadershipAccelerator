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
import { allCapabilities, loadUnresolvedBucket } from '../capabilityRecord';

describe('the report covers every domain, with figures read from the data', () => {
  const r = buildPhaseReport();

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

  it('reports 1,477 stories and 130 releases, which is the corrected composition', () => {
    // 503 + the ten Command Centers, one per domain = 513. Then Phase 2 projected the 964
    // `release_behaviour[]` entries into per-rung stories = 1,477, and gave each project the ten
    // rungs on top of its three kept originals = 130 releases.
    //
    // The implementation total is pinned alongside both so a story count that moves for the wrong
    // reason cannot hide behind the right one: 443 is the number of CAPABILITIES, and it must not
    // move when per-rung stories are added, because a rung story is not a new capability.
    expect(r.totals.stories).toBe(1477);
    expect(r.totals.releases).toBe(130);
    expect(r.rows.reduce((n, x) => n + x.implementation_stories, 0)).toBe(443);
  });

  it('reports seven reachable managers and three blocked', () => {
    // CORRECTED 2026-10-15 from six/four. Taiwo Oludimimu DOES have an admin_users row
    // (taiwo@colaberry.com, role admin, a legacy full admin). The original 'no login'
    // finding was a false negative from an EMAIL MISMATCH: his org_members row carries his
    // personal address, his login is the work one. So admissions is reachable and the split
    // is SEVEN reachable / THREE blocked (platform, product_experience, sales).
    expect(r.totals.managers_reachable).toBe(7);
    expect(r.totals.managers_blocked).toBe(3);
  });

  it('distinguishes 9 accountable humans from the 6 now measured as REACHABLE', () => {
    // Two different figures that are easy to conflate, and I conflated them: T03's headline "five
    // distinct humans" counts the humans behind the SIX REACHABLE domains, where Ali holds two.
    // Across all ten domains there are NINE distinct accountable humans. Both are asserted here so
    // neither can be quoted as the other.
    expect(r.totals.distinct_accountable_humans).toBe(9);
    const reachableHumans = new Set(
      r.rows.filter((x) => x.manager_can_reach_surface).map((x) => x.accountable_human),
    );
    // Moved 5 -> 6 on 2026-10-15: admissions became reachable. The NINE total is unchanged --
    // Taiwo was always one of the nine accountable humans, just recorded as blocked.
    expect(reachableHumans.size).toBe(6);
  });

  it('every blocked domain carries a named reason, never a default', () => {
    for (const row of r.rows.filter((x) => !x.manager_can_reach_surface)) {
      expect(typeof row.blocker).toBe('string');
      expect(row.blocker as string).toMatch(/^manager_[a-z_]+:/);
    }
    // And a reachable domain carries no blocker, so the field is not decorative.
    for (const row of r.rows.filter((x) => x.manager_can_reach_surface)) {
      expect(row.blocker).toBeNull();
    }
  });
});

describe('unknown is never rendered as zero', () => {
  const r = buildPhaseReport();

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
  const r = buildPhaseReport();
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
    expect(r.disclosures.join(' ')).toMatch(/Five of them are live production rows/);
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
    expect(renderPhaseReportMarkdown(buildPhaseReport()))
      .toBe(renderPhaseReportMarkdown(buildPhaseReport()));
  });
});
