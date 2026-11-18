// Run: node --test .claude/skills/build-case-study/scripts/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { presenceProfile, selectReferences, compareToReferences, formatReport } = require('./completenessCore');

const full = (extra = {}) => ({
  identity: { slug: 's', title: 't', summary: 'x', heroImageUrl: 'https://e/c.jpg' },
  taxonomy: { industry: 'Education', departments: ['Ops'] },
  artifacts: [{ publicUrl: 'https://e/c.jpg', visibility: 'public' }, { publicUrl: 'https://e/a.png?v=1', visibility: 'public' }, { publicUrl: 'https://e/b.png', visibility: 'public' }],
  walkthroughVideo: { url: 'https://e/v.mp4', captionsUrl: 'https://e/v.vtt' },
  surfaceVariants: { enterprise: { a: 1 } },
  measurement: { metrics: [{ plain: { counts: 'a', from: 'b', cannotShow: 'c' }, measurement: { limitations: ['l'] } }] },
  decisions: [{ evidenceId: 'e1' }, { evidenceId: 'e2' }, { evidenceId: 'e3' }],
  ...extra,
});

test('a draft with no media, variants or departments is reported as gaps, field by field', () => {
  const draft = full({ artifacts: [], walkthroughVideo: undefined, surfaceVariants: undefined, taxonomy: { industry: 'Education' }, identity: { summary: 'x' } });
  const r = compareToReferences(draft, [full(), full(), full(), full(), full()]);
  const gaps = r.gaps.map((g) => g.path);
  for (const p of ['artifacts', 'walkthroughVideo', 'walkthroughVideo.captionsUrl', 'surfaceVariants', 'taxonomy.departments', 'identity.heroImageUrl', 'derived.openImages', 'derived.coverIsAnArtifact', 'derived.videoWithCaptions']) {
    assert.ok(gaps.includes(p), `expected a gap at ${p}`);
  }
});

test('a complete draft has no gaps; slug and title are never compared', () => {
  const r = compareToReferences(full(), [full(), full(), full(), full(), full()]);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.thin.length, 0);
  assert.ok(!r.rows.some((x) => x.path === 'identity.slug' || x.path === 'identity.title'));
});

test('a list shorter than every reference is THIN; one inside the range is ok', () => {
  const two = full({ decisions: [{ evidenceId: 'e1' }] });
  const r = compareToReferences(two, [full(), full(), full(), full(), full()]);
  assert.ok(r.thin.some((t) => t.path === 'decisions'));
  assert.ok(r.thin.some((t) => t.path === 'derived.decisionsPinnedToEvidence'));
});

test('a field only a minority of references carry is not a convention and is not demanded', () => {
  const refs = [full({ heroMetrics: [1] }), full(), full(), full(), full()];
  const r = compareToReferences(full(), refs);
  assert.ok(!r.rows.some((x) => x.path === 'heroMetrics'));
});

test('an accepted gap is reported with its reason and does not count as a gap', () => {
  const draft = full({ surfaceVariants: undefined });
  const r = compareToReferences(draft, [full(), full(), full(), full(), full()], { accepted: { surfaceVariants: 'published to hire and enterprise only' } });
  assert.equal(r.gaps.length, 0);
  assert.equal(r.accepted[0].reason, 'published to hire and enterprise only');
  assert.match(formatReport(r, ['a']), /ACCEPTED surfaceVariants/);
});

test('a private artifact or a non-image does not count as an open image', () => {
  const p = presenceProfile({ artifacts: [{ publicUrl: 'https://e/a.png', visibility: 'private' }, { publicUrl: 'https://e/doc.pdf' }] });
  assert.equal(p['derived.openImages'].count, 0);
});

test('references: the record itself is excluded and the most complete come first', () => {
  const rows = [
    { caseStudyId: 'self', content: full(), surfaces: ['a'], publishedAt: '2026-11-01' },
    { caseStudyId: 'thin', content: { identity: { summary: 'x' } }, surfaces: ['a', 'b', 'c'], publishedAt: '2026-11-10' },
    { caseStudyId: 'rich', content: full(), surfaces: ['a'], publishedAt: '2026-10-01' },
  ];
  const refs = selectReferences(rows, 'self', 5);
  assert.deepEqual(refs.map((r) => r.caseStudyId), ['rich', 'thin']);
});

test('a diagram node named after a Mermaid keyword is found; labels that say the word are not', () => {
  const { mermaidReservedIds } = require('./completenessCore');
  const bad = [
    'flowchart LR',
    '  call["AI phone interview"]',
    '  bank -->|"only the unanswered"| call',
    '  call --> confirm',
  ].join('\n');
  assert.deepEqual(mermaidReservedIds(bad), ['call']);
  const ok = [
    'flowchart LR',
    '  phone["Make the call"]',
    '  bank -->|"call them"| phone',
  ].join('\n');
  assert.deepEqual(mermaidReservedIds(ok), []);
  assert.deepEqual(mermaidReservedIds(''), []);
});
