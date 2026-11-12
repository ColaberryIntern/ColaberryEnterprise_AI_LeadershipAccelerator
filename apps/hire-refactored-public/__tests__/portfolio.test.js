/**
 * The portfolio renderer. The two rules it exists to keep are asserted first: a project
 * card links only when its case study is published on Hire (and never shows a draft
 * case study's title), and years-of-experience prints only when it reconciles.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/assets/portfolio.js');

const NOW = new Date('2026-11-06T12:00:00Z');
const body = (over = {}) => ({
  ok: true,
  portfolio: {
    identity: { full_name: 'Ann Lee', headline: 'AI Systems Architect', cohort_name: 'July 2026', avatar_data_url: null, linkedin_url: 'https://www.linkedin.com/in/ann', location: 'Dallas, TX', github_url: 'https://github.com/annlee' },
    about: ['Ships agent workflows.'],
    stats: { years_experience: 26, files_committed: 412 },
    capabilities: [{ name: 'Agent Skills', count: 4, proven: true }],
    projects: [
      { title: 'Claims Triage', organization: 'Acme', industry: 'Insurance', case_study_slug: 'claims-triage' },
      { title: 'Intake Router', organization: 'Acme', industry: 'Insurance', case_study_slug: 'draft-only-slug' },
      { title: 'Ledger Bot', organization: null, industry: null, case_study_slug: null },
    ],
    verified_commits: [{ story_id: 's1', title: 'Flags late claims', commit_sha_short: 'abc1234', committed_at: null, criteria_passed: 3, criteria_total: 3, commit_url: 'https://github.com/annlee/x/commit/abc1234' }],
    experience: [{ company: 'Acme', title: 'Engineer', start: '2016-09-01', end: null }],
    records: [], repositories: [], private_repository_count: 0, generated_at: NOW.toISOString(),
  },
  hire: {
    signature: { slug: 'claims-triage', title: 'Claims triage that flags itself', summary: 'Late claims surface first.', industry: 'Insurance', outcomes: [{ value: '3', label: 'queues merged' }] },
    caseStudies: [{ slug: 'claims-triage', title: 'Claims triage that flags itself', summary: 'Late claims surface first.', industry: 'Insurance' }],
    availability: null, spotlight: false, indexable: true,
  },
  ...over,
});

const C = require('../src/assets/common.js');
const API = 'https://enterprise.colaberry.ai';
const cs = (slug, over = {}) => ({ slug, title: 'T ' + slug, summary: 'S ' + slug, industry: 'education', ...over });
const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((s) => cs(s));
const hireOf = (over = {}) => ({ signature: null, caseStudies: nine, availability: null, spotlight: false, indexable: true, ...over });

describe('carousel slides: every published case study, once, signature first (profile upgrade §1.2)', () => {
  test('signature first, then API order; each published case study exactly once', () => {
    const slides = P.carouselSlides(hireOf({ signature: { slug: 'e' }, caseStudies: nine.concat([cs('d')]) }), []);
    assert.deepEqual(slides.map((s) => s.cs.slug), ['e', 'a', 'b', 'c', 'd', 'f', 'g', 'h', 'i']);
    assert.equal(slides[0].kind, 'signature');
  });

  test('the candidate order (hire.caseStudyOrder) wins over the API order; unknown slugs are ignored', () => {
    const slides = P.carouselSlides(hireOf({ signature: { slug: 'a' }, caseStudyOrder: ['i', 'zz-not-published', 'c', 'a'] }), []);
    assert.deepEqual(slides.map((s) => s.cs.slug), ['a', 'i', 'c', 'b', 'd', 'e', 'f', 'g', 'h']);
  });

  test('the kicker tells a project-linked case study from an unlinked one', () => {
    const slides = P.carouselSlides(hireOf({ signature: { slug: 'a' } }), [{ title: 'P1', case_study_slug: 'b' }, { title: 'P3', case_study_slug: null }]);
    assert.deepEqual(slides.slice(0, 3).map((s) => s.kind), ['signature', 'project', 'published']);
  });

  test('UNPUBLISHED projects render nothing: slides come only from published case studies (Ali, 2026-11-11)', () => {
    const b = body();
    const html = P.renderPortfolio(b, 'ann-lee', [], NOW);
    assert.match(html, /Claims triage that flags itself/);
    for (const banned of [/Intake Router/, /Ledger Bot/, /draft-only-slug/, /in review/i, /proj pending/]) assert.doesNotMatch(html, banned);
  });

  test('a signature that is not published is not a slide; empty and malformed input are safe', () => {
    assert.equal(P.carouselSlides(hireOf({ signature: { slug: 'nope' } }), [])[0].kind, 'published');
    assert.deepEqual(P.carouselSlides({}, null), []);
    assert.deepEqual(P.carouselSlides({ caseStudies: [null, {}, { slug: '' }] }, []), []);
    assert.equal(P.carousel([], 'x', API), '');
  });
});

describe('carousel markup', () => {
  const full = cs('recovering-calls', {
    title: 'Recovering the Calls',
    heroMetric: { value: '97%', label: 'of lost events resolved' },
    look: { coverImageUrl: '/site-v2/thumb-cora-recovery.jpg?v=8d', walkthroughSeconds: 94, capability: 'operational-ai-voice-call-event-recovery', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 },
  });
  const slides = P.carouselSlides(hireOf({ signature: { slug: 'recovering-calls' }, caseStudies: [full].concat(nine) }), []);
  const html = P.carousel(slides, 'kes', API);

  test('is a labelled carousel with a live counter and 44px icon controls', () => {
    assert.match(html, /<section class="car" data-car aria-roledescription="carousel" aria-label="Published case studies">/);
    assert.match(html, /class="car-count" data-car-count aria-live="polite">01 \/ 10</);
    for (const l of ['Pause carousel', 'Previous case study', 'Next case study']) assert.match(html, new RegExp('class="btn btn-ghost btn-icon"[^>]*aria-label="' + l + '"'));
    assert.match(html, /data-car-kicker>★ Signature case study</);
  });

  test('slide 1 shows; the rest are hidden; every slide opens its case study in a new tab with the launch hook', () => {
    assert.equal((html.match(/class="car-slide on"/g) || []).length, 1);
    assert.equal((html.match(/class="car-slide"[^>]* hidden>/g) || []).length, 9);
    assert.match(html, /<a class="open-cue" href="\/case-studies\/recovering-calls\/" target="_blank" rel="noopener" data-launch data-from="carousel" data-case="recovering-calls" data-talent-slug="kes"/);
    const linked = new Set([...html.matchAll(/href="\/case-studies\/([^/"]+)\/"/g)].map((m) => m[1]));
    assert.equal(linked.size, 10, 'the page links exactly as many case studies as the badge counts');
  });

  test('a full record: its own cover (never cropped), walkthrough length, capability, figure and proof row', () => {
    assert.match(html, /<img class="cover" src="https:\/\/enterprise\.colaberry\.ai\/site-v2\/thumb-cora-recovery\.jpg\?v=8d"/);
    assert.match(html, /class="play"[^>]*>▶ 1:34</);
    assert.match(html, /class="cap-line">Voice call event recovery</);
    assert.match(html, /class="fig"><b>97%<\/b><span>of lost events resolved/);
    assert.match(html, /<span class="ok">✓ Verified<\/span><span>Workflow diagram<\/span><span>3 decisions<\/span><span>1 repo<\/span>/);
  });

  test('NO .fig without a heroMetric, and an unfinished record collapses to generated art with no empty chips', () => {
    const bare = cs('bare', { summary: null, heroMetric: null, look: { coverImageUrl: null, walkthroughSeconds: null, capability: null, verified: false, workflowDiagram: false, decisions: 0, repositories: 0 } });
    const one = P.carousel(P.carouselSlides(hireOf({ caseStudies: [bare] }), []), 'kes', API);
    assert.doesNotMatch(one, /<img/);
    assert.match(one, /<svg class="hire-art"/, 'generated art, never a blank box');
    for (const cls of ['play', 'cap-line', 'fig', 'proof']) assert.doesNotMatch(one, new RegExp('class="' + cls + '"'), cls + ' must not render empty');
  });

  test('a single case study has nothing to page through: no controls, progress line or thumbnails', () => {
    const one = P.carousel(P.carouselSlides(hireOf({ caseStudies: [full] }), []), 'kes', API);
    for (const x of ['data-car-play', 'data-car-prev', 'data-car-count', 'car-progress', 'data-car-thumbs']) assert.doesNotMatch(one, new RegExp(x));
  });

  test('thumbnails: one button per slide, the first current, labelled, and never a sideways scroll', () => {
    const strip = html.slice(html.indexOf('data-car-thumbs'));
    assert.equal((strip.match(/<button type="button" data-car-go=/g) || []).length, 10);
    assert.match(strip, /data-car-go="0" aria-current="true" aria-label="Case study 1: Recovering the Calls"/);
    assert.doesNotMatch(html, /overflow/);
  });

  test('thumbnail CSS wraps and never scrolls sideways (390px rule)', () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'assets', 'portfolio.css'), 'utf8');
    const rule = /\.thumbs\{([^}]*)\}/.exec(css);
    assert.ok(rule, '.thumbs rule exists');
    // Wraps onto new rows of EQUAL tiles (a flex-wrap row stretched a lone last thumbnail
    // to full width at 390px), at least 76px each.
    assert.match(rule[1], /grid-template-columns:repeat\(auto-fill,minmax\(76px,1fr\)\)/);
    assert.doesNotMatch(css.slice(css.indexOf('.thumbs{')), /overflow-x|overflow:auto|overflow:scroll/);
  });

  test('escapes titles everywhere they appear', () => {
    const evil = P.carousel(P.carouselSlides(hireOf({ caseStudies: [cs('x', { title: '<img src=x onerror=1>' }), cs('y')] }), []), 'kes', API);
    assert.doesNotMatch(evil, /<img src=x/);
  });
});

describe('the ledger never prints a 0 tile (profile upgrade §1.1)', () => {
  test('metricTile: leading number becomes the figure; phrases without one, and zeros, are not tiles', () => {
    assert.deepEqual(P.metricTile({ value: '97% of lost completion events resolved, from 46% by hand', label: 'x' }),
      { big: '97%', label: 'of lost completion events resolved, from 46% by hand', n: 97 });
    assert.deepEqual(P.metricTile({ value: '268 of 20,773 messages needed a human decision', label: 'x' }),
      { big: '268', label: 'of 20,773 messages needed a human decision', n: 268 });
    assert.deepEqual(P.metricTile({ value: '26,773', label: 'messages triaged' }), { big: '26,773', label: 'messages triaged', n: 26773 });
    assert.equal(P.metricTile({ value: '0 retries after inconclusive calls since the cap', label: 'x' }), null);
    assert.equal(P.metricTile({ value: 'Recovered in 1m31s', label: 'x' }), null);
    assert.equal(P.metricTile(null), null);
  });

  test("Kes's shape: no commits, no capabilities. Zeros drop out; real figures, largest first, then walkthroughs fill in", () => {
    const walk = { walkthroughSeconds: 100 };
    const cases = [
      cs('a', { heroMetric: { value: '268 of 20,773 messages needed a human decision', label: 'x' }, look: walk }),
      cs('b', { heroMetric: { value: '97% of lost completion events resolved, from 46% by hand', label: 'x' }, look: walk }),
      cs('c', { heroMetric: { value: '0 retries after inconclusive calls since the cap, from 551 before', label: 'x' }, look: walk }),
    ].concat(['d', 'e', 'f', 'g', 'h', 'i'].map((s) => cs(s, { look: walk })));
    const p = { stats: { years_experience: 40 }, verified_commits: [], capabilities: [], experience: [] };
    const tiles = P.ledgerTiles(p, { caseStudies: cases }, NOW);
    assert.deepEqual(tiles.map((t) => t.big), ['9', '268', '97%', '9']);
    assert.equal(tiles[3].label, 'video walkthroughs');
    assert.ok(tiles.every((t) => t.big !== '0'));
  });

  test('a profile with real commits and capabilities keeps its four tiles as before', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.match(html, /<b>1<\/b><span>verified commits<\/span>[\s\S]*<b>1<\/b><span>capabilities proven in code<\/span>[\s\S]*<b>412<\/b><span>files committed<\/span>/);
  });

  test('a rendered page never shows a 0 tile', () => {
    const b = body();
    b.portfolio.verified_commits = []; b.portfolio.capabilities = []; b.portfolio.stats = {};
    const html = P.renderPortfolio(b, 'ann-lee', [], NOW);
    const ledger = html.slice(html.indexOf('p-ledger'), html.indexOf('p-cols'));
    assert.doesNotMatch(ledger, /<b>0<\/b>/);
  });
});

describe('the page head', () => {
  test('Copy link is an icon-only 44px button with an accessible name; Request intro stays primary until booking ships', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.match(html, /<button type="button" class="btn btn-ghost btn-icon" data-copy aria-label="Copy profile link"><svg/);
    assert.match(html, /class="p-actions"><a class="btn btn-primary" href="\/intro\/\?talent=ann-lee"/);
  });

  test('leads with the carousel, then About, commits and Experience; the signature is linked once', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    const at = (s) => html.indexOf(s);
    assert.ok(at('data-car') < at('class="card about"') && at('class="card about"') < at('Verified commits') && at('Verified commits') < at('Experience <span'));
    assert.match(html, /Case-study verified · 1 published/);
    assert.equal(new Set([...html.matchAll(/href="\/case-studies\/([^/"]+)\/"/g)].map((m) => m[1])).size, 1);
    for (const gone of [/class="sig"/, /class="projs"/, /More of their published work/]) assert.doesNotMatch(html, gone);
  });

  test('helpers: media URLs resolve against the platform, lengths read as m:ss, labels lose the raw form', () => {
    assert.equal(C.mediaUrl(API, '/site-v2/a.jpg'), API + '/site-v2/a.jpg');
    assert.equal(C.mediaUrl(API + '/', '/a.jpg'), API + '/a.jpg');
    assert.equal(C.mediaUrl(API, 'https://cdn.x/a.jpg'), 'https://cdn.x/a.jpg');
    assert.equal(C.mediaUrl(API, 'javascript:alert(1)'), '');
    assert.equal(C.mediaUrl(API, '//evil.example/a.jpg'), '', 'protocol-relative is refused');
    assert.equal(C.mediaUrl(API, null), '');
    assert.equal(C.duration(94), '1:34');
    assert.equal(C.duration(0), '');
    assert.equal(C.capabilityLabel('operational-ai-voice-call-event-recovery'), 'Voice call event recovery');
    assert.equal(C.capabilityLabel(null), '');
    // Quincy, 2026-11-11: "Industries shows the raw tag data-infrastructure-operations".
    assert.equal(C.industryLabel('data-infrastructure-operations'), 'Data infrastructure operations');
    assert.equal(C.industryLabel('public-sector'), 'Public sector');
    assert.equal(C.industryLabel('Insurance'), 'Insurance');
    assert.equal(C.industryLabel('Data infrastructure and operations'), 'Data infrastructure and operations');
    assert.equal(C.industryLabel(null), '');
  });

  test('the industries sidebar never prints a raw facet key', () => {
    const b = body();
    b.hire.caseStudies = [{ slug: 'claims-triage', title: 'T', summary: 'S', industry: 'data-infrastructure-operations' }];
    const html = P.renderPortfolio(b, 'ann-lee', [], NOW);
    assert.match(html, /Data infrastructure operations/);
    assert.doesNotMatch(html, /data-infrastructure-operations/);
  });
});

describe('unlinkedCaseStudies (kept for the walkthrough picker in the schedule phase)', () => {
  test('lists the ones neither the signature nor a project links, once each, in API order', () => {
    const projects = [{ title: 'P1', case_study_slug: 'b' }, { title: 'P2', case_study_slug: 'c' }, { title: 'P3', case_study_slug: null }];
    const more = P.unlinkedCaseStudies({ caseStudies: nine.concat([cs('d')]) }, projects, { slug: 'a' });
    assert.deepEqual(more.map((c) => c.slug), ['d', 'e', 'f', 'g', 'h', 'i']);
    assert.deepEqual(P.unlinkedCaseStudies({}, null, null), []);
  });
});

describe('years of experience', () => {
  test('prints only when it reconciles with the roles listed', () => {
    const xp = [{ start: '2016-09-01', end: null }];
    assert.equal(P.reconciledYears({ years_experience: 10 }, xp, NOW), 10);
    assert.equal(P.reconciledYears({ years_experience: 26 }, xp, NOW), null, 'the old "26 years beside a ten-year history"');
    assert.equal(P.reconciledYears({ years_experience: 10 }, [], NOW), null);
    assert.equal(P.reconciledYears({}, xp, NOW), null);
  });

  test('falls back to files committed on the ledger when it does not reconcile', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.match(html, /<b>412<\/b><span>files committed<\/span>/);
    assert.doesNotMatch(html, /years of experience/);
  });
});

describe('the page', () => {
  test('links each verified commit to GitHub, and refuses any other host', () => {
    const ok = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.match(ok, /<a class="sha" href="https:\/\/github\.com\/annlee\/x\/commit\/abc1234"/);
    const b = body();
    b.portfolio.verified_commits[0].commit_url = 'javascript:alert(1)';
    assert.doesNotMatch(P.renderPortfolio(b, 'ann-lee', [], NOW), /javascript:/);
  });

  test('never prints a contact field the projection did not send', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.doesNotMatch(html, /mailto:/);
  });

  test('omits a section with nothing in it rather than drawing it empty', () => {
    const b = body();
    b.portfolio.about = []; b.portfolio.verified_commits = []; b.portfolio.experience = [];
    const html = P.renderPortfolio(b, 'ann-lee', [], NOW);
    assert.doesNotMatch(html, /Verified commits/);
    assert.doesNotMatch(html, /Experience <span/);
    assert.doesNotMatch(html, /class="card about"/);
  });

  test('rejects a body that is not a hire portfolio, so the not-listed state stays', () => {
    assert.equal(P.isPayload(body()), true);
    assert.equal(P.isPayload({ ok: true, portfolio: body().portfolio }), false, 'no hire block = not the hire surface');
    assert.equal(P.isPayload({ error: 'Not found' }), false);
  });
});

describe('slug from path', () => {
  test('reads /talent/<slug>/ and refuses anything else, including the shell itself', () => {
    assert.equal(P.slugFromPath('/talent/ann-lee/'), 'ann-lee');
    assert.equal(P.slugFromPath('/talent/ann-lee'), 'ann-lee');
    assert.equal(P.slugFromPath('/talent/record/'), null);
    assert.equal(P.slugFromPath('/talent/../etc/'), null);
    assert.equal(P.slugFromPath('/talent/'), null);
  });
});
