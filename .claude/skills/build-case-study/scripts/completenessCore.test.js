// Run: node --test .claude/skills/build-case-study/scripts/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { presenceProfile, selectReferences, compareToReferences, formatReport, codeShownArtifacts, storyInBriefLint } = require('./completenessCore');

test('no code shown: a prompt file, a JSON ledger and a Claude Code screen are caught; a chart is not', () => {
  const pub = (title, publicUrl) => ({ title, publicUrl, visibility: 'public' });
  const found = codeShownArtifacts([
    pub('ONE_MOVE_PROMPT.md: the prompt Claude Code runs', 'https://e/shot-prompt.png'),
    pub('The ledger entry', 'https://e/decisions.json'),
    pub('The weekly loop in five steps', 'https://e/loop.png'),
    pub('Where they come from: ad source and device', 'https://e/source.png'),
    pub('The funnel, from ad visit to a perfect Quick check', 'https://e/funnel.png'),
    { title: 'Terminal session', publicUrl: 'https://e/t.png', visibility: 'private' },
  ]);
  assert.deepEqual(found, ['ONE_MOVE_PROMPT.md: the prompt Claude Code runs', 'The ledger entry']);
});

test('no code shown: a link into a repository file or folder is code; the repository front page is not', () => {
  const pub = (title, publicUrl) => ({ title, publicUrl, visibility: 'public' });
  const found = codeShownArtifacts([
    pub('The cloud infrastructure that was never applied', 'https://github.com/o/r/tree/master/infrastructure/aws'),
    pub('The readiness review', 'https://github.com/o/r/blob/master/docs/READINESS-REVIEW'),
    pub('The repository', 'https://github.com/o/r'),
    pub('The working demo', 'https://demo.example.com/app'),
  ]);
  assert.deepEqual(found, ['The cloud infrastructure that was never applied', 'The readiness review']);
});

test('the story in brief: a figure in What happened, no ticket words, no copy of the standfirst', () => {
  const good = [
    { label: 'Before', text: 'Applicants emailed two staff inboxes and the rules lived in one head.' },
    { label: 'What we built', text: 'One portal from application to cohort, with a person deciding.' },
    { label: 'What happened', text: '8 of 8 admission decisions were made by a reviewer.' },
  ];
  assert.deepEqual(storyInBriefLint(good, 'A portal that admits interns.'), []);
  const bad = [
    { label: 'Before', text: 'The welcome flow in enrollmentService.ts sent the wrong email (PR #4190).' },
    { label: 'What we built', text: 'A portal that admits interns with a reviewer in charge of every call.' },
    { label: 'What happened', text: 'It worked well and people liked it.' },
    { label: 'Why it matters', text: 'It worked well and people liked it.' },
  ];
  const problems = storyInBriefLint(bad, 'A portal that admits interns with a reviewer in charge of every call.');
  assert.ok(problems.some((p) => p.includes('"What happened" carries no figure')));
  assert.ok(problems.some((p) => p.includes('"Before" reads like a ticket')));
  assert.ok(problems.some((p) => p.includes('"What we built" repeats the standfirst')));
  assert.ok(problems.some((p) => p.includes('"Why it matters" repeats another beat')));
});

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
