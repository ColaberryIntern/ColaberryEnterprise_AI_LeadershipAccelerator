/**
 * caseStudySnapshotBuilder — unit tests.
 *
 * NO DATABASE, NO NETWORK, NO WALL CLOCK. The builder is pure apart from one
 * clock read and one log line, and both are seams these tests hold open: `now`
 * is injected, and `console.log` is captured. The suite therefore runs under
 * `jest.ci.config.ts` with `DATABASE_URL` unset, which is the only way it stays
 * a real gate (a suite that needs Postgres ends up on the ignore list and then
 * never runs again).
 *
 * The acceptance criteria of T007 map one-to-one onto the `describe` blocks
 * below; AC4 and AC5 concern version rows and live in
 * `caseStudySnapshotStore.test.ts`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { hashCanonical } from '../../../utils/canonicalHash';
import {
  buildCaseStudySnapshot, CaseStudySnapshotError, isCaseStudySnapshotError, MAX_SNAPSHOT_REPOS,
} from '../caseStudySnapshotBuilder';
import { opaqueRepoRef } from '../caseStudyRepoReader';
import type { CaseStudySnapshotInput } from '../caseStudySnapshotInput';
import type { CaseStudyMetricEntry, CaseStudySituationSection } from '../../../types/caseStudy';
import { fixedClock, makePlatform, makeRepo, makeRepoFacts, SHA_A, SHA_B } from './snapshotFixtures';

let logLines: string[] = [];
let logSpy: jest.SpyInstance;

beforeEach(() => {
  logLines = [];
  logSpy = jest.spyOn(console, 'log').mockImplementation((line?: unknown) => {
    logLines.push(String(line));
  });
});
afterEach(() => logSpy.mockRestore());

const build = (over: Partial<CaseStudySnapshotInput> = {}) => buildCaseStudySnapshot({
  caseStudyId: 'cs-1',
  platform: makePlatform(),
  repos: [makeRepo()],
  now: fixedClock(),
  ...over,
});

/* ── AC1 — one hasher, the extracted one ─────────────────────────────────── */

describe('AC1 — the builder uses the extracted canonical hasher', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'caseStudySnapshotBuilder.ts'), 'utf8',
  );

  it('imports hashCanonical from utils/canonicalHash', () => {
    expect(source).toMatch(/import \{ hashCanonical \} from '\.\.\/\.\.\/utils\/canonicalHash'/);
  });

  it('does NOT construct a hash of its own — no second implementation to drift', () => {
    expect(source).not.toMatch(/createHash/);
    expect(source).not.toMatch(/from 'crypto'/);
  });

  it('produces exactly hashCanonical({ content, sourceCommitMap }) and nothing else', () => {
    const draft = build();
    expect(draft.contentHash)
      .toBe(hashCanonical({ content: draft.content, sourceCommitMap: draft.sourceCommitMap }));
  });

  it('emits a 64-character hex digest, matching the VARCHAR(64) column', () => {
    expect(build().contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ── AC2 — key order cannot change the hash ──────────────────────────────── */

describe('AC2 — key order in the input cannot change the hash', () => {
  const situationA: CaseStudySituationSection = {
    narrative: ['Line one.', 'Line two.'],
    constraints: ['No PII leaves the plant.'],
    goals: ['Cut changeover time.'],
    verification: { class: 'verified', method: 'client', verifiedAt: '2026-03-01T00:00:00.000Z' },
  };
  // Same content, every key order reversed, at two levels of nesting.
  const situationB = {
    verification: { verifiedAt: '2026-03-01T00:00:00.000Z', method: 'client', class: 'verified' },
    goals: ['Cut changeover time.'],
    constraints: ['No PII leaves the plant.'],
    narrative: ['Line one.', 'Line two.'],
  } as CaseStudySituationSection;

  it('hashes a shuffled-key situation section identically', () => {
    expect(build({ platform: makePlatform({ situation: situationA }) }).contentHash)
      .toBe(build({ platform: makePlatform({ situation: situationB }) }).contentHash);
  });

  it('hashes shuffled-key metric entries identically', () => {
    const a: CaseStudyMetricEntry = {
      key: 'changeover', label: 'Changeover time', valueDisplay: '22 min',
      metricType: 'delivery', verification: { class: 'verified', method: 'client' },
      isHeadline: true, publishable: true,
    };
    const b = {
      publishable: true, isHeadline: true,
      verification: { method: 'client', class: 'verified' },
      metricType: 'delivery', valueDisplay: '22 min', label: 'Changeover time', key: 'changeover',
    } as CaseStudyMetricEntry;
    expect(build({ platform: makePlatform({ metrics: [a] }) }).contentHash)
      .toBe(build({ platform: makePlatform({ metrics: [b] }) }).contentHash);
  });

  it('is NOT sensitive to the order repositories arrive in', () => {
    const one = makeRepo({ facts: makeRepoFacts({ metadata: { owner: 'acme', name: 'alpha' } }) });
    const two = makeRepo({
      facts: makeRepoFacts({ metadata: { owner: 'acme', name: 'beta', latestCommitSha: SHA_B } }),
      role: 'backend',
    });
    expect(build({ repos: [one, two] }).contentHash).toBe(build({ repos: [two, one] }).contentHash);
  });

  it('IS sensitive to content, so the invariance above is not vacuous', () => {
    expect(build({ platform: makePlatform({ situation: situationA }) }).contentHash)
      .not.toBe(build().contentHash);
  });
});

/* ── AC3 — nothing volatile enters the hash ──────────────────────────────── */

describe('AC3 — nothing volatile enters the hash', () => {
  // Built inside the tests, not in the describe body: a build at collection time
  // would log before `beforeEach` installs the console spy.
  const atClock = (iso: string) => buildCaseStudySnapshot({
    caseStudyId: 'cs-1', platform: makePlatform(), repos: [makeRepo()], now: fixedClock(iso),
  });
  const EARLY = '2020-01-01T00:00:00.000Z';
  const LATE = '2031-06-05T09:30:00.000Z';

  it('produces the same hash under two different clocks', () => {
    expect(atClock(EARLY).contentHash).toBe(atClock(LATE).contentHash);
  });

  it('and the clocks really did differ — otherwise the test above proves nothing', () => {
    expect(atClock(EARLY).generatedAt).toBe(EARLY);
    expect(atClock(LATE).generatedAt).toBe(LATE);
    expect(atClock(EARLY).generatedAt).not.toBe(atClock(LATE).generatedAt);
  });

  it('and the clock reached provenance, which is deliberately outside the hash', () => {
    const projectBuild = (iso: string) => buildCaseStudySnapshot({
      caseStudyId: 'cs-1', platform: makePlatform({ projectId: 'proj-1' }),
      repos: [makeRepo()], now: fixedClock(iso),
    });
    const a = projectBuild('2020-01-01T00:00:00.000Z');
    const b = projectBuild('2031-06-05T09:30:00.000Z');
    expect(a.provenance.identity.recordedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(b.provenance.identity.recordedAt).toBe('2031-06-05T09:30:00.000Z');
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('never writes lastSyncedAt into the content — the field that moves every sync', () => {
    const draft = build();
    expect(draft.content.repositories?.[0]).toBeDefined();
    expect(draft.content.repositories?.[0]).not.toHaveProperty('lastSyncedAt');
    expect(JSON.stringify(draft.content)).not.toContain('lastSyncedAt');
  });

  it('ignores repo facts that are not projected into content (pushedAt, file counts)', () => {
    const quiet = makeRepo({ facts: makeRepoFacts({ metadata: { pushedAt: '2026-08-20T09:00:00.000Z' }, fileCount: 120 }) });
    const busy = makeRepo({
      facts: makeRepoFacts({
        metadata: { pushedAt: '2026-08-21T23:59:00.000Z', updatedAt: '2026-08-21T23:59:00.000Z' },
        fileCount: 9999, filesRead: ['README.md', 'docs/architecture.md'],
      }),
    });
    expect(build({ repos: [quiet] }).contentHash).toBe(build({ repos: [busy] }).contentHash);
  });

  it('ignores the correlation id', () => {
    expect(build({ correlationId: 'corr-a' }).contentHash)
      .toBe(build({ correlationId: 'corr-b' }).contentHash);
  });

  it('is stable across repeated builds of the same inputs — the idempotency claim itself', () => {
    const hashes = new Set([build().contentHash, build().contentHash, build().contentHash]);
    expect(hashes.size).toBe(1);
  });
});

/* ── boundaries: empty, minimal, and everything-absent ───────────────────── */

describe('minimal and empty snapshots', () => {
  it('builds from identity and taxonomy alone, with no repos at all', () => {
    const draft = buildCaseStudySnapshot({
      caseStudyId: 'cs-1', platform: makePlatform(), now: fixedClock(),
    });
    expect(draft.content.identity.slug).toBe('bottling-line-copilot');
    expect(draft.content.heroMetrics).toEqual([]);
    expect(draft.sourceCommitMap).toEqual({});
    expect(draft.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(draft.generatedBy).toBe('platform_sync');
  });

  it('omits every optional section rather than rendering it empty (spec §23)', () => {
    const draft = buildCaseStudySnapshot({
      caseStudyId: 'cs-1', platform: makePlatform(), now: fixedClock(),
    });
    for (const key of [
      'situation', 'buildTimeline', 'architecture', 'measurement',
      'roadmap', 'contributors', 'artifacts', 'repositories',
    ] as const) {
      expect(draft.content[key]).toBeUndefined();
    }
  });

  it('an absent section and an explicitly-undefined section are the same snapshot', () => {
    const bare = buildCaseStudySnapshot({ caseStudyId: 'cs-1', platform: makePlatform(), now: fixedClock() });
    const explicit = buildCaseStudySnapshot({
      caseStudyId: 'cs-1',
      platform: makePlatform({ situation: undefined, roadmap: [], contributors: [] }),
      repos: [], now: fixedClock(),
    });
    expect(explicit.contentHash).toBe(bare.contentHash);
  });

  it('marks a repo-sourced build as repo_sync and a platform-only build as platform_sync', () => {
    expect(build().generatedBy).toBe('repo_sync');
    expect(buildCaseStudySnapshot({ caseStudyId: 'cs-1', platform: makePlatform(), now: fixedClock() }).generatedBy)
      .toBe('platform_sync');
  });
});

/* ── validation and failure paths ────────────────────────────────────────── */

describe('validation', () => {
  it('rejects a missing title with a ValidationError, before assembling anything', () => {
    expect(() => build({ platform: makePlatform({ title: '   ' }) }))
      .toThrow(CaseStudySnapshotError);
    try {
      build({ platform: makePlatform({ title: '   ' }) });
    } catch (err) {
      expect(isCaseStudySnapshotError(err)).toBe(true);
      expect((err as CaseStudySnapshotError).error_class).toBe('ValidationError');
      expect((err as CaseStudySnapshotError).http_status).toBe(400);
    }
  });

  it('rejects more repositories than spec §37 permits', () => {
    const many = Array.from({ length: MAX_SNAPSHOT_REPOS + 1 }, (_, i) => makeRepo({
      facts: makeRepoFacts({ metadata: { name: `repo${i}` } }),
    }));
    expect(() => build({ repos: many })).toThrow(CaseStudySnapshotError);
  });

  it('logs the failure with an error_class and no stack trace', () => {
    try { build({ platform: makePlatform({ slug: '' }) }); } catch { /* expected */ }
    const failure = logLines.map((l) => JSON.parse(l)).find((l) => l.outcome === 'failure');
    expect(failure.context.error_class).toBe('ValidationError');
    expect(failure.level).toBe('error');
  });
});

/* ── logging: private repository identity must not reach stdout ──────────── */

describe('logging', () => {
  it('names a PUBLIC repository, whose identity is already public', () => {
    build();
    const line = JSON.parse(logLines[0]);
    expect(line.context.repo_refs).toEqual(['colaberry/accelerator']);
  });

  it('never names a PRIVATE repository — only the opaque, stable handle', () => {
    build({
      repos: [makeRepo({
        facts: makeRepoFacts({ metadata: { owner: 'acme', name: 'secret-plant', visibility: 'private' } }),
      })],
    });
    const joined = logLines.join('\n');
    expect(joined).not.toContain('secret-plant');
    expect(joined).toContain(opaqueRepoRef('acme', 'secret-plant'));
  });

  it('fails closed on unknown visibility — a failed metadata read is not "probably public"', () => {
    build({
      repos: [makeRepo({
        facts: makeRepoFacts({ metadata: { owner: 'acme', name: 'unclear', visibility: 'unknown' } }),
      })],
    });
    expect(logLines.join('\n')).not.toContain('acme/unclear');
  });

  it('emits the structured envelope the observability framework requires', () => {
    build();
    const line = JSON.parse(logLines[0]);
    expect(line.service).toBe('case-study-snapshot');
    expect(line.event).toBe('snapshot_build');
    expect(line.outcome).toBe('success');
    expect(typeof line.correlation_id).toBe('string');
    expect(line.correlation_id.length).toBeGreaterThan(0);
    expect(line.context.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ── identity: what a changed SHA does to the hash (the store's AC5 input) ── */

describe('repository facts and snapshot identity', () => {
  it('a changed head SHA changes the hash and the source commit map', () => {
    const before = build();
    const after = build({
      repos: [makeRepo({ facts: makeRepoFacts({ metadata: { latestCommitSha: SHA_B } }) })],
    });
    expect(before.sourceCommitMap).toEqual({ 'colaberry/accelerator': SHA_A });
    expect(after.sourceCommitMap).toEqual({ 'colaberry/accelerator': SHA_B });
    expect(after.contentHash).not.toBe(before.contentHash);
  });

  it('omits a repository with no head sha from the commit map without failing', () => {
    const draft = build({
      repos: [makeRepo({ facts: makeRepoFacts({ metadata: { latestCommitSha: null }, accessStatus: 'unavailable' }) })],
    });
    expect(draft.sourceCommitMap).toEqual({});
    expect(draft.content.repositories?.[0].lastSeenSha).toBeUndefined();
    expect(draft.content.repositories?.[0].accessStatus).toBe('unavailable');
  });

  it('derives architecture and taxonomy facets from the analyzed repositories', () => {
    const draft = build();
    expect(draft.content.architecture?.stack).toEqual(['TypeScript', 'express', 'react']);
    expect(draft.content.architecture?.dataStores).toEqual(['postgres']);
    expect(draft.content.taxonomy.stack).toEqual(['TypeScript', 'express', 'react']);
  });

  it('lets platform facts outrank a repository manifest (spec §9 precedence)', () => {
    const withManifest = makeRepo({
      manifest: { classification: { industry: 'manufacturing', capabilities: ['forecasting'] } },
    });
    const fromRepo = build({ repos: [withManifest] });
    const fromPlatform = build({
      platform: makePlatform({ industry: 'beverage' }), repos: [withManifest],
    });
    expect(fromRepo.content.taxonomy.industry).toBe('manufacturing');
    expect(fromPlatform.content.taxonomy.industry).toBe('beverage');
  });

  it('treats a manifest outcome as an unpublishable, pending candidate metric', () => {
    const draft = build({
      repos: [makeRepo({
        manifest: { outcomes: [{ key: 'uptime', label: 'Uptime', valueDisplay: '99.9%', verificationClass: 'pending' }] },
      })],
    });
    const metric = draft.content.measurement?.metrics.find((m) => m.key === 'uptime');
    expect(metric?.publishable).toBe(false);
    expect(metric?.verification.class).toBe('pending');
    expect(draft.content.heroMetrics).toEqual([]);
  });
});
