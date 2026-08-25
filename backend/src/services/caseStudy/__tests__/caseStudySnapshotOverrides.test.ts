/**
 * caseStudySnapshotOverrides — unit tests. T007 AC6.
 *
 * "Human overrides survive a rebuild and are not overwritten by regenerated
 * values" is the guarantee that makes the whole review workflow trustworthy: a
 * reviewer who corrects a figure and then watches the next repo sync silently
 * undo it stops reviewing. So the AC6 block below drives the override machinery
 * THROUGH the real builder — the rebuild is the thing under test, not the
 * setter — and the path-parser block underneath it tests the untrusted-input
 * surface directly.
 *
 * NO DATABASE, NO NETWORK, NO WALL CLOCK.
 */
import {
  applyOverrides, parseProvenancePath,
} from '../caseStudySnapshotOverrides';
import { buildCaseStudySnapshot } from '../caseStudySnapshotBuilder';
import type {
  CaseStudySnapshotInput, CaseStudySnapshotOverride,
} from '../caseStudySnapshotInput';
import type { CaseStudyMetricEntry, CaseStudySnapshotContent } from '../../../types/caseStudy';
import { fixedClock, makePlatform, makeRepo, makeRepoFacts, SHA_B } from './snapshotFixtures';

let logSpy: jest.SpyInstance;
beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => logSpy.mockRestore());

const build = (over: Partial<CaseStudySnapshotInput> = {}) => buildCaseStudySnapshot({
  caseStudyId: 'cs-1',
  platform: makePlatform(),
  repos: [makeRepo()],
  now: fixedClock(),
  ...over,
});

/* ── AC6 — human overrides survive a rebuild ─────────────────────────────── */

describe('AC6 — human overrides survive a rebuild', () => {
  const override: CaseStudySnapshotOverride = {
    path: 'identity.title',
    value: 'What a plant learned from its own downtime',
    actor: 'ali@colaberry.com',
    recordedAt: '2026-08-01T12:00:00.000Z',
  };

  it('the override wins over the generated value', () => {
    const draft = build({ overrides: [override] });
    expect(draft.content.identity.title).toBe(override.value);
    expect(draft.appliedOverrides).toEqual(['identity.title']);
  });

  it('and survives a rebuild in which the generated value CHANGED', () => {
    const rebuilt = build({
      platform: makePlatform({ title: 'A completely different generated title' }),
      repos: [makeRepo({ facts: makeRepoFacts({ metadata: { latestCommitSha: SHA_B } }) })],
      overrides: [override],
    });
    expect(rebuilt.content.identity.title).toBe(override.value);
  });

  it('records the override at tier human_override with the actor who made it', () => {
    const entry = build({ overrides: [override] }).provenance['identity.title'];
    expect(entry.tier).toBe('human_override');
    expect(entry.origin).toEqual({ kind: 'human', actor: 'ali@colaberry.com', note: undefined });
    expect(entry.recordedAt).toBe('2026-08-01T12:00:00.000Z');
  });

  it('carries the human recordedAt, not the build clock, so a rebuild reproduces it', () => {
    const a = build({ overrides: [override], now: fixedClock('2020-01-01T00:00:00.000Z') });
    const b = build({ overrides: [override], now: fixedClock('2031-06-05T09:30:00.000Z') });
    expect(a.provenance['identity.title'].recordedAt)
      .toBe(b.provenance['identity.title'].recordedAt);
  });

  it('overrides a nested array element by index', () => {
    const metric: CaseStudyMetricEntry = {
      key: 'changeover', label: 'Changeover time', valueDisplay: '22 min',
      metricType: 'delivery', verification: { class: 'verified', method: 'client' },
      isHeadline: true, publishable: true,
    };
    const draft = build({
      platform: makePlatform({ metrics: [metric] }),
      overrides: [{ ...override, path: 'heroMetrics[0].valueDisplay', value: '21 min' }],
    });
    expect(draft.content.heroMetrics[0].valueDisplay).toBe('21 min');
  });

  it('CHANGES the hash — an override is real content, not decoration', () => {
    expect(build({ overrides: [override] }).contentHash).not.toBe(build().contentHash);
  });

  it('reports, rather than invents, an override whose parent section is absent', () => {
    const draft = build({ overrides: [{ ...override, path: 'situation.narrative', value: ['x'] }] });
    expect(draft.ignoredOverrides).toEqual(['situation.narrative']);
    expect(draft.appliedOverrides).toEqual([]);
    expect(draft.content.situation).toBeUndefined();
  });

  it('rejects a prototype-polluting path outright', () => {
    const draft = build({ overrides: [{ ...override, path: '__proto__.polluted', value: true }] });
    expect(draft.ignoredOverrides).toEqual(['__proto__.polluted']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('applies the LATER of two edits to the same path, whatever order they arrive in', () => {
    const older = { ...override, value: 'older', recordedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...override, value: 'newer', recordedAt: '2026-07-01T00:00:00.000Z' };
    expect(build({ overrides: [older, newer] }).content.identity.title).toBe('newer');
    expect(build({ overrides: [newer, older] }).content.identity.title).toBe('newer');
  });

  it('does not mutate the caller\'s platform facts when overriding', () => {
    const platform = makePlatform();
    build({ platform, overrides: [override] });
    expect(platform.title).toBe('Bottling line copilot');
  });

  it('is deterministic: the same overrides always produce the same hash', () => {
    const a = build({ overrides: [override] });
    const b = build({ overrides: [override] });
    expect(a.contentHash).toBe(b.contentHash);
  });
});

/* ── the path parser, which reads untrusted admin input ──────────────────── */

describe('parseProvenancePath', () => {
  it('parses a plain key', () => {
    expect(parseProvenancePath('identity')).toEqual([{ kind: 'key', key: 'identity' }]);
  });

  it('parses a dotted path with an array index', () => {
    expect(parseProvenancePath('heroMetrics[0].valueDisplay')).toEqual([
      { kind: 'key', key: 'heroMetrics' },
      { kind: 'index', index: 0 },
      { kind: 'key', key: 'valueDisplay' },
    ]);
  });

  it.each([
    ['', 'empty'],
    ['.', 'a bare dot'],
    ['identity.', 'a trailing dot'],
    ['identity..title', 'a double dot'],
    ['[0]', 'a leading index'],
    ['heroMetrics[a]', 'a non-numeric index'],
    ['heroMetrics[0', 'an unclosed bracket'],
    ['heroMetrics[0]title', 'a key glued to an index'],
    ['identity title', 'a space'],
    ['9lives', 'a leading digit'],
    ['__proto__', 'the prototype key'],
    ['a.constructor.b', 'the constructor key'],
    ['a.prototype', 'the prototype property'],
  ])('refuses %p — %s', (bad) => {
    expect(parseProvenancePath(bad)).toBeNull();
  });
});

describe('applyOverrides', () => {
  const content = {
    identity: {
      slug: 's', title: 't', organizationIdentityMode: 'hidden', organizationNamingConsent: false,
      builderIdentityMode: 'anonymous', builderNamingConsent: false,
    },
    heroMetrics: [],
    taxonomy: { capabilities: [], stack: [], deliverables: [] },
  } as unknown as CaseStudySnapshotContent;

  const base = { actor: 'a@b.com', recordedAt: '2026-08-01T00:00:00.000Z' };

  it('returns the input untouched when there are no overrides', () => {
    const result = applyOverrides(content, []);
    expect(result.content).toBe(content);
    expect(result.applied).toEqual([]);
    expect(result.ignored).toEqual([]);
  });

  it('never mutates the content it was given', () => {
    applyOverrides(content, [{ ...base, path: 'identity.title', value: 'changed' }]);
    expect(content.identity.title).toBe('t');
  });

  it('adds a whole section that was absent, because the root always exists', () => {
    const result = applyOverrides(content, [{ ...base, path: 'situation', value: { narrative: ['x'] } }]);
    expect(result.applied).toEqual(['situation']);
    expect(result.content.situation).toEqual({ narrative: ['x'] });
  });

  it('refuses to write past the end of an array rather than punching null holes', () => {
    const result = applyOverrides(content, [{ ...base, path: 'heroMetrics[3]', value: {} }]);
    expect(result.ignored).toEqual(['heroMetrics[3]']);
    expect(result.content.heroMetrics).toEqual([]);
  });

  it('keeps applied and ignored disjoint when a parent is created by an earlier edit', () => {
    const result = applyOverrides(content, [
      { ...base, path: 'situation.narrative', value: ['first attempt'], recordedAt: '2026-01-01T00:00:00.000Z' },
      { ...base, path: 'situation', value: { narrative: ['seed'] }, recordedAt: '2026-02-01T00:00:00.000Z' },
      { ...base, path: 'situation.narrative', value: ['second attempt'], recordedAt: '2026-03-01T00:00:00.000Z' },
    ]);
    expect(result.applied).toEqual(['situation', 'situation.narrative']);
    expect(result.ignored).toEqual([]);
    expect(result.content.situation?.narrative).toEqual(['second attempt']);
  });
});
