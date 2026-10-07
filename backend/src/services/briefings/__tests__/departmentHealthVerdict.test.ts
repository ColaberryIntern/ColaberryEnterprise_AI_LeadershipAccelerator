/**
 * Tests for the executive briefing's department health verdict.
 *
 * The bug these exist to prevent: 'healthy' being the else-branch of "no
 * anomalies were recorded", which emailed the DRI a green tick for a
 * supervisor that had never had a single subordinate. Every test below should
 * fail if the three-state verdict is collapsed back to a boolean.
 *
 * Pure module, no database: departmentHealthVerdict imports only a type from
 * superAgentHealth, which is erased at compile time.
 */

import {
  judgeDepartmentHealth,
  projectDepartmentReports,
  readReportedAgentCount,
  DEPARTMENT_REPORT_STALE_AFTER_MS,
  type DepartmentReportLike,
} from '../departmentHealthVerdict';

// Fixed clock so staleness is deterministic rather than wall-clock dependent.
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const FRESH = new Date(NOW - 60 * 1000);

/** A row as superAgentBase writes it for a working department of 7 agents. */
function row(over: Partial<DepartmentReportLike> = {}): DepartmentReportLike {
  return {
    department: 'Campaign Operations',
    summary: 'Campaign Operations: health HEALTHY — 6/7 healthy, 0 errored, 1 paused. 0 anomalies detected.',
    metrics: { total: 7, healthy: 6, errored: 0, paused: 1, health: 'healthy', collection_ok: true },
    anomalies: null,
    created_at: FRESH,
    ...over,
  };
}

describe('judgeDepartmentHealth — happy path', () => {
  it('calls a department with subordinates, no anomalies and a healthy stamp healthy', () => {
    expect(judgeDepartmentHealth(row(), NOW)).toBe('healthy');
  });

  it('honours a degraded stamp written by the supervisor even with no anomalies array', () => {
    const r = row({ metrics: { total: 3, health: 'degraded' }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('judges a pre-fix row (metrics without a health key) on its anomalies alone', () => {
    // Every one of the 74,769 historical rows looks like this: metrics present,
    // no `health`. total > 0 and no anomalies is the one case that is genuinely
    // healthy, and it must still read healthy or the briefing cries wolf.
    const r = row({ metrics: { total: 7, healthy: 6, errored: 0, paused: 1 } });
    expect(judgeDepartmentHealth(r, NOW)).toBe('healthy');
  });
});

describe('judgeDepartmentHealth — the defect: unknown must not read as healthy', () => {
  it('returns unknown when the supervisor had zero subordinates', () => {
    // ContentEngineSuperAgent: 9,366 reports, metrics.total = 0 on every one,
    // agent_group content_engine has no rows at all. This is the headline case.
    const r = row({ metrics: { total: 0, healthy: 0, errored: 0, paused: 0 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('unknown');
  });

  it('returns unknown when metrics is missing entirely', () => {
    expect(judgeDepartmentHealth(row({ metrics: undefined }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ metrics: null }), NOW)).toBe('unknown');
  });

  it('returns unknown for a malformed metrics object rather than throwing', () => {
    const malformed: unknown[] = [
      'not an object',
      42,
      [],
      ['total', 7],
      {},
      { total: null },
      { total: 'seven' },
      { total: NaN },
      { total: -1 },
      { healthy: 6 },
      true,
    ];
    for (const metrics of malformed) {
      expect(() => judgeDepartmentHealth(row({ metrics }), NOW)).not.toThrow();
      expect(judgeDepartmentHealth(row({ metrics }), NOW)).toBe('unknown');
    }
  });

  it('returns unknown for a health value it cannot interpret', () => {
    // A writer and reader that disagree about the contract is not evidence of
    // health, so an unrecognised stamp is unknown and never falls through.
    for (const health of ['ok', 'HEALTHY-ish', '', 7, true, {}, []]) {
      expect(judgeDepartmentHealth(row({ metrics: { total: 5, health } }), NOW)).toBe('unknown');
    }
  });

  it('still reads a recognised health stamp whatever its casing or padding', () => {
    expect(judgeDepartmentHealth(row({ metrics: { total: 5, health: '  HEALTHY ' } }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ metrics: { total: 5, health: 'Degraded' } }), NOW)).toBe('degraded');
    expect(judgeDepartmentHealth(row({ metrics: { total: 5, health: 'unknown' } }), NOW)).toBe('unknown');
  });
});

describe('judgeDepartmentHealth — anomalies', () => {
  it('returns degraded for a non-empty anomalies array', () => {
    const r = row({ anomalies: ['LeadScoringAgent is in error state (12 errors)'] });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('returns degraded for an anomalies payload written as an object, not an array', () => {
    // The old inline check read `.length` on an object, got undefined, and
    // called it healthy. The model types this column as Record | null, so the
    // object shape is legal and must count.
    const r = row({ anomalies: { first: 'agent X has 9 errors' } as unknown });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('never lets a healthy stamp cancel a recorded anomaly', () => {
    const r = row({
      metrics: { total: 7, health: 'healthy' },
      anomalies: ['SendAgent avg duration 41.2s exceeds 30s threshold'],
    });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('treats an empty anomalies payload as no finding', () => {
    expect(judgeDepartmentHealth(row({ anomalies: [] }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ anomalies: {} as unknown }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ anomalies: '  ' }), NOW)).toBe('healthy');
  });
});

describe('judgeDepartmentHealth — conflicting signals take the worst', () => {
  it('does not believe a healthy claim from a supervisor with no subordinates', () => {
    const r = row({ metrics: { total: 0, health: 'healthy' } });
    expect(judgeDepartmentHealth(r, NOW)).toBe('unknown');
  });

  it('does not downgrade a degraded claim to unknown just because total is 0', () => {
    // Losing an alarm would be worse than the bug being fixed.
    const r = row({ metrics: { total: 0, health: 'degraded' } });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('reports degraded when the row is both blind and alarming', () => {
    const r = row({ metrics: undefined, anomalies: ['agent_group read failed'] });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('keeps an alarm from a stale report instead of fading it to unknown', () => {
    // Staleness is evaluated after the anomaly check, so this is the case that
    // proves the combinator takes the worst signal rather than the last one. A
    // department that went quiet while erroring is still erroring.
    const r = row({
      created_at: new Date(NOW - DEPARTMENT_REPORT_STALE_AFTER_MS - 1),
      anomalies: ['CollectionsAgent is in error state (11 errors)'],
    });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });
});

describe('judgeDepartmentHealth — boundaries', () => {
  it('treats total 1 as a real department and total 0 as none', () => {
    // Finance and Partnerships have exactly one subordinate each, so the
    // one-agent department must not be lumped in with the empty one.
    expect(judgeDepartmentHealth(row({ metrics: { total: 1 } }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ metrics: { total: 0 } }), NOW)).toBe('unknown');
  });

  it('accepts a numeric string total, including "0"', () => {
    expect(judgeDepartmentHealth(row({ metrics: { total: '7' } }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ metrics: { total: '0' } }), NOW)).toBe('unknown');
  });

  it('holds its verdict right up to the staleness threshold and flips exactly after it', () => {
    const at = (ageMs: number) =>
      judgeDepartmentHealth(row({ created_at: new Date(NOW - ageMs) }), NOW);

    expect(at(DEPARTMENT_REPORT_STALE_AFTER_MS - 1)).toBe('healthy');
    expect(at(DEPARTMENT_REPORT_STALE_AFTER_MS)).toBe('healthy');
    expect(at(DEPARTMENT_REPORT_STALE_AFTER_MS + 1)).toBe('unknown');
  });

  it('reports unknown for a report dated in the future beyond clock skew', () => {
    expect(judgeDepartmentHealth(row({ created_at: new Date(NOW + 60 * 1000) }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ created_at: new Date(NOW + 60 * 60 * 1000) }), NOW)).toBe('unknown');
  });

  it('accepts a timestamp as a Date, an ISO string or epoch ms, and ignores an unreadable one', () => {
    const stale = NOW - DEPARTMENT_REPORT_STALE_AFTER_MS - 1000;
    expect(judgeDepartmentHealth(row({ created_at: new Date(stale) }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ created_at: new Date(stale).toISOString() }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ created_at: stale }), NOW)).toBe('unknown');
    // No usable timestamp must not manufacture an alarm on its own.
    expect(judgeDepartmentHealth(row({ created_at: undefined }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ created_at: 'not a date' }), NOW)).toBe('healthy');
  });
});

describe('projectDepartmentReports — dedup', () => {
  it('keeps the first row per department and drops the rest', () => {
    // The caller queries created_at DESC, so first = most recent. Here the
    // newest report is the alarming one; the older healthy row must not win.
    const rows = [
      row({ department: 'Finance', summary: 'newest', anomalies: ['CollectionsAgent has 11 errors'] }),
      row({ department: 'Finance', summary: 'older', anomalies: null }),
    ];
    expect(projectDepartmentReports(rows, NOW)).toEqual([
      { department: 'Finance', summary: 'newest', health: 'degraded' },
    ]);
  });

  it('judges each department on its own row', () => {
    const rows = [
      row({ department: 'Content Engine', summary: 'a', metrics: { total: 0 } }),
      row({ department: 'Admissions', summary: 'b', metrics: { total: 17, health: 'healthy' } }),
      row({ department: 'Partnerships', summary: 'c', anomalies: ['PartnerSyncAgent has not run in over 1 hour'] }),
      row({ department: 'Admissions', summary: 'ignored — older duplicate' }),
    ];
    expect(projectDepartmentReports(rows, NOW)).toEqual([
      { department: 'Content Engine', summary: 'a', health: 'unknown' },
      { department: 'Admissions', summary: 'b', health: 'healthy' },
      { department: 'Partnerships', summary: 'c', health: 'degraded' },
    ]);
  });

  it('collapses two spellings of the same department but keeps the row\'s own spelling', () => {
    const rows = [
      row({ department: ' Finance ', summary: 'newest' }),
      row({ department: 'finance', summary: 'older' }),
    ];
    const out = projectDepartmentReports(rows, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].department).toBe(' Finance ');
  });

  it('returns an empty projection for no rows rather than throwing', () => {
    expect(projectDepartmentReports([], NOW)).toEqual([]);
  });
});

describe('projectDepartmentReports — replay and purity', () => {
  it('is idempotent: the same rows and the same clock give the same verdicts every time', () => {
    const rows = [
      row({ department: 'Finance', summary: 'f', metrics: { total: 0 } }),
      row({ department: 'Admissions', summary: 'a', anomalies: ['x has 7 errors'] }),
    ];
    const expected = [
      { department: 'Finance', summary: 'f', health: 'unknown' },
      { department: 'Admissions', summary: 'a', health: 'degraded' },
    ];

    // CONTENT is asserted on every call, not just equality between calls. The
    // previous version of this test asserted only `expect(second).toEqual(first)`,
    // which two empty arrays satisfy: hoisting the dedup Set to module scope
    // made the second call return [] and this test still passed, so it survived
    // the exact bug class it is named for.
    const first = projectDepartmentReports(rows, NOW);
    expect(first).toEqual(expected);

    const second = projectDepartmentReports(rows, NOW);
    expect(second).toEqual(expected);
    expect(second).toEqual(first);

    const third = projectDepartmentReports(rows, NOW);
    expect(third).toHaveLength(2);
    expect(third).toEqual(expected);
  });

  it('does not mutate the rows it is given', () => {
    const rows = [row({ department: 'Finance', metrics: { total: 0 } })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    projectDepartmentReports(rows, NOW);
    expect(JSON.parse(JSON.stringify(rows))).toEqual(snapshot);
    expect(rows).toHaveLength(1);
  });

  it('judges the same row identically however many times it is asked', () => {
    const r = row({ metrics: { total: 0 } });
    const verdicts = Array.from({ length: 5 }, () => judgeDepartmentHealth(r, NOW));
    expect(new Set(verdicts).size).toBe(1);
    expect(verdicts[0]).toBe('unknown');
  });
});

describe('judgeDepartmentHealth — the Finance/Partnership half: the buckets are read, not just total', () => {
  // Reading `total` alone fixed the ContentEngine half of the defect (total 0)
  // and left the other half green: a department whose agents all stopped
  // carries total > 0, wrote no anomalies before the writer was fixed, and
  // therefore read 'healthy'. healthy/errored/paused are on all 74,769
  // historical rows, so using them re-judges history with no migration.

  it('refuses to certify the department of one whose one agent is switched off', () => {
    // FinanceSuperAgent and PartnershipSuperAgent, every 30 minutes from
    // 2026-08-24 onwards. This is the exact shape the module names as the
    // defect it exists to fix.
    const r = row({ metrics: { total: 1, healthy: 0, errored: 0, paused: 1 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('refuses to certify a wholly switched-off department of seven', () => {
    const r = row({ metrics: { total: 7, healthy: 0, errored: 0, paused: 7 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('refuses to certify a department in which every agent errored', () => {
    const r = row({ metrics: { total: 7, healthy: 0, errored: 7 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('reports degraded on a single errored agent even when no anomalies were recorded', () => {
    const r = row({ metrics: { total: 7, healthy: 6, errored: 1, paused: 0 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('still calls six working agents and one paused one healthy', () => {
    // The guard against over-correction: a paused agent is not a finding on its
    // own, or every department with a retired agent would cry wolf.
    const r = row({ metrics: { total: 7, healthy: 6, errored: 0, paused: 1 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('healthy');
  });

  it('returns unknown when a bucket is larger than the department itself', () => {
    // An impossible number is a model bug, and a model bug is not evidence.
    expect(judgeDepartmentHealth(row({ metrics: { total: 3, healthy: 4, errored: 0, paused: 0 } }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ metrics: { total: 3, healthy: 3, errored: 0, paused: 9 } }), NOW)).toBe('unknown');
  });

  it('returns unknown when the buckets do not account for every agent', () => {
    // The three buckets double-count a disabled-and-errored agent, so they can
    // sum above total but never below it. Below means an agent is in a status
    // this system does not model.
    expect(judgeDepartmentHealth(row({ metrics: { total: 7, healthy: 2, errored: 0, paused: 0 } }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ metrics: { total: 7, healthy: 6, errored: 0, paused: 0 } }), NOW)).toBe('unknown');
    // Summing ABOVE total is legal - a disabled errored agent is both errored
    // and paused - so it is not a contract violation. The verdict for that
    // shape comes from the errored agents, not from the arithmetic.
    expect(judgeDepartmentHealth(row({ metrics: { total: 7, healthy: 5, errored: 2, paused: 2 } }), NOW)).toBe('degraded');
  });

  it('returns unknown for a bucket that is not a headcount', () => {
    for (const healthy of ['many', true, 1.5, -1, {}, []]) {
      expect(judgeDepartmentHealth(row({ metrics: { total: 7, healthy, errored: 0, paused: 0 } }), NOW)).toBe('unknown');
    }
  });

  it('is unaffected by buckets that are absent, as on a pre-metrics row', () => {
    expect(judgeDepartmentHealth(row({ metrics: { total: 7 } }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ metrics: { total: 7, healthy: null, errored: null, paused: null } }), NOW)).toBe('healthy');
  });
});

describe('judgeDepartmentHealth — a headcount must be a non-negative integer', () => {
  it('returns unknown for a fractional total', () => {
    // Negative was already rejected and fractional was not: 0.4 agents read as
    // "some agents, no anomalies, healthy".
    expect(judgeDepartmentHealth(row({ metrics: { total: 0.4 } }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ metrics: { total: 6.5 } }), NOW)).toBe('unknown');
    expect(judgeDepartmentHealth(row({ metrics: { total: '7.5' } }), NOW)).toBe('unknown');
  });

  it('returns unknown for a total that is not a finite, safe count', () => {
    for (const total of [Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 2, -1, -0.5, true, [], {}]) {
      expect(judgeDepartmentHealth(row({ metrics: { total } }), NOW)).toBe('unknown');
    }
  });

  it('still accepts a whole count, as a number or a numeric string', () => {
    expect(judgeDepartmentHealth(row({ metrics: { total: 7 } }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ metrics: { total: ' 7 ' } }), NOW)).toBe('healthy');
    expect(judgeDepartmentHealth(row({ metrics: { total: Number.MAX_SAFE_INTEGER } }), NOW)).toBe('healthy');
  });
});

describe('judgeDepartmentHealth — collection_ok, the flag that says "I was blind"', () => {
  it('does not believe a healthy stamp from a supervisor whose read failed', () => {
    // The one field that records "I could not look" was written by
    // superAgentBase and read by nobody.
    const r = row({
      metrics: { total: 5, health: 'healthy', collection_ok: false, error_class: 'TimeoutError' },
      anomalies: null,
    });
    expect(judgeDepartmentHealth(r, NOW)).toBe('unknown');
  });

  it('keeps an alarm raised during a failed read instead of fading it to unknown', () => {
    const r = row({
      metrics: { total: 0, healthy: 0, errored: 0, paused: 0, health: 'unknown', collection_ok: false, error_class: 'UpstreamUnavailable' },
      anomalies: ['Agent status collection failed (UpstreamUnavailable): connection refused'],
    });
    expect(judgeDepartmentHealth(r, NOW)).toBe('degraded');
  });

  it('counts only an exact true as evidence of sight', () => {
    const metrics = (collection_ok: unknown) => ({
      total: 5, healthy: 5, errored: 0, paused: 0, health: 'healthy', collection_ok,
    });
    for (const flag of [false, null, 0, 1, 'true', 'yes', {}, []]) {
      expect(judgeDepartmentHealth(row({ metrics: metrics(flag) }), NOW)).toBe('unknown');
    }
    expect(judgeDepartmentHealth(row({ metrics: metrics(true) }), NOW)).toBe('healthy');
  });

  it('carries no signal when the flag is absent, as on every pre-fix row', () => {
    const r = row({ metrics: { total: 7, healthy: 7, errored: 0, paused: 0 }, anomalies: null });
    expect(judgeDepartmentHealth(r, NOW)).toBe('healthy');
  });
});

describe('fail closed: a malformed row must not take out the caller', () => {
  // Both entry points run inside a Promise.all that builds a whole executive
  // briefing, and inside the COO dashboard handler. A TypeError over one
  // malformed JSONB column replaced a wrong green tick with a 500 for
  // everything else on the surface.

  it('answers unknown for a row that is not a row', () => {
    for (const bad of [null, undefined, 'a row', 42, true, [], [{ department: 'X' }]]) {
      expect(() => judgeDepartmentHealth(bad as never, NOW)).not.toThrow();
      expect(judgeDepartmentHealth(bad as never, NOW)).toBe('unknown');
    }
  });

  it('projects no departments for a non-array instead of throwing', () => {
    for (const bad of [null, undefined, 'rows', 7, {}, true]) {
      expect(() => projectDepartmentReports(bad as never, NOW)).not.toThrow();
      expect(projectDepartmentReports(bad as never, NOW)).toEqual([]);
    }
  });

  it('projects an unreadable row as unknown rather than dropping it', () => {
    // Dropping it is silence, and silence reads as "nothing to report" - the
    // direction this whole module exists to close off.
    expect(projectDepartmentReports([null] as never, NOW)).toEqual([
      { department: '', summary: '', health: 'unknown' },
    ]);
    expect(projectDepartmentReports([{ department: 7, summary: null }] as never, NOW)).toEqual([
      { department: '', summary: '', health: 'unknown' },
    ]);
  });

  it('keeps judging the readable rows around an unreadable one', () => {
    const rows = [
      null,
      row({ department: 'Finance', summary: 'f', metrics: { total: 1, healthy: 0, errored: 0, paused: 1 } }),
      undefined,
      row({ department: 'Admissions', summary: 'a' }),
    ] as never;
    expect(projectDepartmentReports(rows, NOW)).toEqual([
      { department: '', summary: '', health: 'unknown' },
      { department: 'Finance', summary: 'f', health: 'degraded' },
      { department: 'Admissions', summary: 'a', health: 'healthy' },
    ]);
  });
});

describe('readReportedAgentCount', () => {
  it('reports the count the row actually carries', () => {
    expect(readReportedAgentCount({ total: 7 })).toBe(7);
    expect(readReportedAgentCount({ total: '7' })).toBe(7);
    expect(readReportedAgentCount({ total: 0 })).toBe(0);
  });

  it('reports null rather than 0 when the row carries no readable count', () => {
    // `(metrics as any)?.total || 0` printed a confident "0 agents" for every
    // one of these, which is how the COO dashboard said "healthy - 0 agents".
    for (const metrics of [null, undefined, 'junk', 42, [], {}, { total: null }, { total: 'seven' }, { total: -1 }, { total: 0.4 }]) {
      expect(readReportedAgentCount(metrics)).toBeNull();
    }
  });
});

describe('verdict union', () => {
  it('only ever returns one of the three documented states', () => {
    const inputs: DepartmentReportLike[] = [
      row(),
      row({ metrics: { total: 0 } }),
      row({ metrics: undefined }),
      row({ metrics: 'junk' }),
      row({ anomalies: ['a'] }),
      row({ metrics: { total: 5, health: 'nonsense' } }),
      row({ created_at: new Date(NOW - 10 * DEPARTMENT_REPORT_STALE_AFTER_MS) }),
      { department: '', summary: '' },
    ];
    for (const input of inputs) {
      expect(['healthy', 'degraded', 'unknown']).toContain(judgeDepartmentHealth(input, NOW));
    }
  });
});
