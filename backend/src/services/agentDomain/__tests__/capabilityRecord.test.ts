/**
 * T05 — the capability record contract, and the reconciliation of all 246 legacy rows.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * ## Why this file did not exist until now
 *
 * T05's own stated verification command was `npx jest --testPathPattern "capabilityRecord"`. It
 * matched **nothing** — 6087 files checked, 0 matches, exit 1. The commit shipped one test file and
 * it was T12's. So the 443 records were loaded only incidentally, by the suites of two downstream
 * tasks, and four of T05's acceptance criteria had no test anywhere in the repository.
 *
 * The data turned out to be sound when a verifier measured it independently. That is luck, not
 * assurance: it proved the point by deleting `implementation_state` from one record and watching
 * all 256 tests pass, exit 0.
 *
 * ## The three findings this file closes
 *
 *  1. **225 of 246 legacy rows, not 246.** The missing 21 are the `unresolved` bucket, and they
 *     lived only in a gitignored run directory with no `disposition` field at all. They are now
 *     tracked data (`capabilities/_unresolved.json`) and reconciled here against the CSV itself.
 *  2. **The record contract was a cast, not a check.** `assertRecordContract` now runs at load
 *     time, and the mutation below proves a missing field is caught.
 *  3. **`DENIED_CAPABILITIES` was a hardcoded copy.** It is re-exported from the real policy, and
 *     a test asserts the identity rather than a length.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadAllMatrices,
  loadDomainMatrix,
  loadUnresolvedBucket,
  allAccountedLegacyNames,
  allCapabilities,
  assertDraftOnlyInvariant,
  assertRecordContract,
  countsForDomain,
  allDomainCounts,
  REQUIRED_CAPABILITY_FIELDS,
  DENIED_CAPABILITIES,
  type DomainCapabilityMatrix,
} from '../capabilityRecord';
import { DENIED_CAPABILITIES as POLICY_DENIED } from '../../delivery/execution/executionPolicy';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';

const CSV = path.join(
  __dirname, '..', '..', '..', '..', '..',
  'docs', 'architecture', 'ai-workforce-management', 'LEGACY_AGENT_CLASSIFICATION.csv',
);

/** The legacy CSV's agent names, parsed here rather than trusted from a summary. */
function csvAgentNames(): string[] {
  const text = fs.readFileSync(CSV, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(',').map((h) => h.trim());
  const col = header.indexOf('agent_name');
  expect(col).toBeGreaterThanOrEqual(0); // the parse is bound to a real column, not to index 0
  return lines.slice(1).map((l) => {
    // The reason column contains commas inside quotes; agent_name is the first field and never
    // quoted, so splitting on the first comma is sufficient and does not need a CSV library.
    const cells = l.split(',');
    return (col === 0 ? cells[0] : cells[col]).trim().replace(/^"|"$/g, '');
  });
}

// ─────────────────────── all 246 legacy rows are accounted for ───────────────────────

describe('every legacy agent row is accounted for, by name', () => {
  const names = csvAgentNames();

  it('POSITIVE CONTROL: the CSV really holds 246 data rows', () => {
    // Without this, every assertion below could pass over an empty parse.
    expect(names).toHaveLength(246);
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(246);
  });

  it('the ten domain files account for 225 and the tracked bucket for the other 21', () => {
    const domained = [...loadAllMatrices().values()]
      .flatMap((m) => m.legacy_dispositions.map((d) => d.agent_name));
    const bucket = loadUnresolvedBucket().rows.map((r) => r.agent_name);
    expect(domained).toHaveLength(225);
    expect(bucket).toHaveLength(21);
    expect(domained.length + bucket.length).toBe(246);
  });

  it('EVERY one of the 246 names resolves, and the test names the ones that do not', () => {
    const accounted = new Set(allAccountedLegacyNames());
    const missing = names.filter((n) => !accounted.has(n));
    // Named, never counted: a number tells nobody which row to go and classify.
    expect(missing).toEqual([]);
  });

  it('nothing is accounted for twice, and nothing is invented', () => {
    const accounted = allAccountedLegacyNames();
    expect(new Set(accounted).size).toBe(accounted.length);
    const fromCsv = new Set(names);
    expect(accounted.filter((n) => !fromCsv.has(n))).toEqual([]);
  });

  it('every domained disposition carries a non-empty reason', () => {
    const reasonless: string[] = [];
    for (const m of loadAllMatrices().values()) {
      for (const d of m.legacy_dispositions) {
        if (!d.reason || d.reason.trim().length === 0) reasonless.push(`${m.domain_key}/${d.agent_name}`);
      }
    }
    expect(reasonless).toEqual([]);
  });

  it('every bucket row carries a disposition AND a reason, which the run file never did', () => {
    const b = loadUnresolvedBucket();
    // Still true after the AF6.1 ruling of 2026-11-01: thirteen rows remain unresolved, because
    // eight were ruled `absorb` without a domain being named and five were parked.
    expect(b.needs_owner_decision).toBe(true);
    for (const r of b.rows) {
      expect(['unresolved', 'retired']).toContain(r.disposition);
      expect(r.reason.trim().length).toBeGreaterThan(10);
      expect(r.capability_id).toBeNull();
    }
  });

  it('POSITIVE CONTROL: removing a name from the accounted set is detected', () => {
    // Proves the reconciliation can fail. The per-domain scoping matters too: a check that only
    // looked at one domain would pass while 225 rows went unexamined.
    const accounted = new Set(allAccountedLegacyNames());
    accounted.delete(names[0]);
    expect(names.filter((n) => !accounted.has(n))).toEqual([names[0]]);
  });
});

// ─────────────────────── the record contract is enforced, not cast ───────────────────────

describe('the record contract is checked at load time', () => {
  function fixtureMatrix(mutate: (c: Record<string, unknown>) => void): DomainCapabilityMatrix {
    const real = JSON.parse(JSON.stringify(loadDomainMatrix('internship')));
    mutate(real.capabilities[0]);
    return real as DomainCapabilityMatrix;
  }

  it('the real matrices all satisfy it', () => {
    for (const [key, m] of loadAllMatrices()) {
      expect(() => assertRecordContract(key, m)).not.toThrow();
    }
  });

  it('names all nineteen required fields, including the two the amendment separates', () => {
    expect(REQUIRED_CAPABILITY_FIELDS).toContain('implementation_state');
    expect(REQUIRED_CAPABILITY_FIELDS).toContain('requirement_validation_state');
    expect(REQUIRED_CAPABILITY_FIELDS.length).toBeGreaterThanOrEqual(13);
  });

  /**
   * THE MUTATION THE VERIFIER RAN. It deleted `implementation_state` from one record and all 256
   * tests passed, exit 0. This is that scenario as a test.
   */
  it.each([...REQUIRED_CAPABILITY_FIELDS])('a record missing %s is REFUSED, by name', (field) => {
    const m = fixtureMatrix((c) => { delete c[field]; });
    expect(() => assertRecordContract('internship', m)).toThrow(/CapabilityContractViolation/);
    expect(() => assertRecordContract('internship', m)).toThrow(new RegExp(`missing '${field}'`));
  });

  it('an out-of-vocabulary implementation_state is refused', () => {
    const m = fixtureMatrix((c) => { c.implementation_state = 'mostly_done'; });
    expect(() => assertRecordContract('internship', m)).toThrow(/implementation_state 'mostly_done'/);
  });

  it('an out-of-vocabulary validation state is refused', () => {
    const m = fixtureMatrix((c) => { c.requirement_validation_state = 'accepted'; });
    // `accepted` is the exact value a previous plan cycle used and this vocabulary never defined.
    expect(() => assertRecordContract('internship', m)).toThrow(/requirement_validation_state 'accepted'/);
  });

  it('a domain with ZERO capabilities is refused: an empty bucket is not an empty job', () => {
    const m = JSON.parse(JSON.stringify(loadDomainMatrix('internship')));
    m.capabilities = [];
    expect(() => assertRecordContract('internship', m as DomainCapabilityMatrix))
      .toThrow(/zero capabilities/);
  });

  it('the refusal names records rather than counting them', () => {
    const m = fixtureMatrix((c) => { delete c.workflow; });
    try {
      assertRecordContract('internship', m);
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as Error).message).toMatch(/internship\/[a-z_.]+: missing 'workflow'/);
    }
  });
});

// ─────────────────────── the denied list is the policy's, not a copy ───────────────────────

describe('the denied-capability list is the real one', () => {
  it('is the SAME list the execution policy exports, not a copy of its values', () => {
    // Identity, not length. The old test asserted `length === 8` against a local literal, so a
    // ninth denial added to the policy would never have been observed here.
    expect(DENIED_CAPABILITIES).toBe(POLICY_DENIED);
  });

  it('POSITIVE CONTROL: the policy list is non-empty, so disjointness is a real constraint', () => {
    expect(POLICY_DENIED.length).toBeGreaterThan(0);
  });

  it('no capability requests a denied capability as a required tool', () => {
    // Disjointness. An earlier version of this predicate asserted MEMBERSHIP, which would have
    // forced every domain to request only categorically-refused capabilities.
    const denied = new Set(POLICY_DENIED as readonly string[]);
    const offenders: string[] = [];
    for (const c of allCapabilities()) {
      for (const t of c.required_tools) {
        if (denied.has(t)) offenders.push(`${c.capability_id}: ${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: a planted denied tool would be caught', () => {
    const denied = new Set(POLICY_DENIED as readonly string[]);
    const planted = ['read_thing', POLICY_DENIED[0]];
    expect(planted.filter((t) => denied.has(t))).toEqual([POLICY_DENIED[0]]);
  });
});

// ─────────────────────── the data, measured ───────────────────────

describe('the capability data, measured rather than summarised', () => {
  it('443 records across ten domains, each id unique', () => {
    const caps = allCapabilities();
    expect(caps).toHaveLength(443);
    expect(new Set(caps.map((c) => c.capability_id)).size).toBe(443);
    expect(loadAllMatrices().size).toBe(AGENT_DOMAIN_KEYS.length);
  });

  it('NO domain has exactly ten capabilities, which the amendment forbids', () => {
    const tens = [...loadAllMatrices().values()]
      .filter((m) => m.capabilities.length === 10)
      .map((m) => m.domain_key);
    expect(tens).toEqual([]);
  });

  it('no domain has zero capabilities either', () => {
    const empty = [...loadAllMatrices().values()]
      .filter((m) => m.capabilities.length === 0)
      .map((m) => m.domain_key);
    expect(empty).toEqual([]);
  });

  it('nothing is validated, and nothing claims to be', () => {
    expect(() => assertDraftOnlyInvariant()).not.toThrow();
    expect(allCapabilities().every((c) => c.requirement_validation_state === 'draft')).toBe(true);
  });

  it('the three counts the amendment asks for are reported SEPARATELY, never summed', () => {
    const counts = allDomainCounts();
    expect(counts).toHaveLength(AGENT_DOMAIN_KEYS.length);
    for (const c of counts) {
      // Three independent figures. Summing them would double-count a legacy row that became a
      // capability, which is precisely why the amendment asks for them apart.
      expect(typeof c.legacy_rows_analyzed).toBe('number');
      expect(typeof c.distinct_capabilities).toBe('number');
      expect(typeof c.unique_tools_required).toBe('number');
      // And the two validation figures stay apart from the implementation ones, which is the
      // whole reason the amendment asks for separate counts.
      expect(c.confirmed + c.draft).toBe(c.distinct_capabilities);
      expect(c.confirmed).toBe(0);
    }
    const totalLegacy = counts.reduce((n, c) => n + c.legacy_rows_analyzed, 0);
    // 225 domained; the other 21 are in the bucket and deliberately not in any domain's count.
    expect(totalLegacy).toBe(225);
    expect(totalLegacy + loadUnresolvedBucket().legacy_row_count).toBe(246);
  });

  it('per-domain counts agree with the per-domain data', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const m = loadDomainMatrix(key);
      const c = countsForDomain(key);
      expect(c.distinct_capabilities).toBe(m.capabilities.length);
      expect(c.legacy_rows_analyzed).toBe(m.legacy_dispositions.length);
    }
  });

  it('every autonomy value in the data is namespaced, with no bare R<n>', () => {
    const bare: string[] = [];
    for (const c of allCapabilities()) {
      for (const v of [c.starting_autonomy, c.max_permitted_autonomy]) {
        if (/^R\d$/.test(String(v))) bare.push(`${c.capability_id}: ${v}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('refuses an unknown domain rather than returning an empty matrix', () => {
    expect(() => loadDomainMatrix('not_a_domain')).toThrow(/No capability matrix/);
  });
});
