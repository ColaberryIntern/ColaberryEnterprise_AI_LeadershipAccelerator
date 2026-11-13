/**
 * The directory renderer: what a payload becomes, and what NOT having one leaves alone.
 * Rendered as strings (the renderer is pure), asserted on structure, never on pixels.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/assets/directory.js');
const C = require('../src/assets/common.js');

const person = (over = {}) => ({
  slug: 'ann-lee', name: 'Ann Lee', avatarUrl: null, role: 'AI Systems Architect', track: 'architect',
  headline: 'Ships agent workflows into claims operations', location: 'Dallas, TX', cohort: 'July 2026',
  availability: null, caseStudyCount: 2, verifiedCommitCount: 7,
  capabilities: [{ name: 'Agent Skills', proven: true }, { name: 'MCP', proven: false }],
  signature: { slug: 'claims-triage', title: 'Claims triage that flags itself', industry: 'Insurance', heroMetric: null },
  spotlight: false, ...over,
});
const payload = (over = {}) => ({
  ok: true, totals: { listed: 1, caseStudies: 2, verifiedCommits: 7, industries: 1 },
  spotlight: [], spotlightSource: 'latest', talent: [person()], facets: {}, nextCursor: null, ...over,
});

describe('payload trust', () => {
  test('accepts only a well-formed payload; anything else reads as "API down"', () => {
    assert.equal(D.isPayload(payload()), true);
    for (const bad of [null, {}, { ok: true }, { ok: false, talent: [], totals: {} }, { ok: true, talent: 'x', totals: {} }]) {
      assert.equal(D.isPayload(bad), false);
    }
  });
});

describe('filters live in the query string', () => {
  test('round-trips a shareable filter', () => {
    const f = D.parseFilters('?track=fde&q=claims&sort=newest');
    assert.deepEqual(f, { q: 'claims', track: 'fde', sort: 'newest' });
    assert.equal(D.filtersToQuery(f), '?q=claims&track=fde&sort=newest');
  });

  test('drops unknown values instead of forwarding them, and caps q at 80', () => {
    const f = D.parseFilters('?track=wizard&sort=random&q=' + 'x'.repeat(500));
    assert.equal(f.track, '');
    assert.equal(f.sort, 'featured');
    assert.equal(f.q.length, 80);
    assert.equal(D.filtersToQuery({ q: '', track: '', sort: 'featured' }), '');
  });
});

describe('talent cards', () => {
  test('are a real link to the portfolio, same tab', () => {
    const html = D.talentCard(person(), []);
    assert.match(html, /<a class="tcard-link" href="\/talent\/ann-lee\/"/);
    assert.doesNotMatch(html, /target="_blank"/);
    assert.doesNotMatch(html, /data-go=/, 'the prototype div+onclick must not survive');
  });

  test('give every listed person the gold ring and star', () => {
    assert.match(D.talentCard(person(), []), /class="ring"[\s\S]*class="badge"/);
  });

  test('render nothing for a missing field rather than inventing one', () => {
    const html = D.talentCard(person({ headline: null, location: null, cohort: null, availability: null, signature: null }), []);
    assert.doesNotMatch(html, /class="hl"/);
    assert.doesNotMatch(html, /class="loc"/);
    assert.doesNotMatch(html, /class="avail/);
    assert.doesNotMatch(html, /class="cs"/);
  });

  test('escape API text, so a name is never markup', () => {
    const html = D.talentCard(person({ name: '<img src=x onerror=alert(1)>' }), []);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test('reflect the shortlist', () => {
    assert.match(D.talentCard(person(), ['ann-lee']), /star-btn on" data-star="ann-lee"/);
    assert.match(D.talentCard(person(), []), /aria-pressed="false"/);
  });
});

describe('the page', () => {
  test('keeps the honest empty copy when nobody is listed', () => {
    const html = D.renderDirectory(payload({ talent: [], totals: { listed: 0, caseStudies: 0, verifiedCommits: 0, industries: 0 } }), D.parseFilters(''), []);
    assert.match(html, /Nobody is listed yet/);
    assert.doesNotMatch(html, /class="tcard/);
  });

  test('a failed first load says the directory could not be reached, never that nobody is listed', () => {
    const html = D.renderUnavailable();
    assert.match(html, /could not be reached/);
    assert.doesNotMatch(html, /Nobody is listed/);
  });

  test('says "no match" rather than "nobody listed" when a filter excludes everyone', () => {
    const html = D.renderDirectory(payload({ talent: [] }), D.parseFilters('?q=zzz'), []);
    assert.match(html, /No listed engineers match that yet/);
  });

  test('labels a fallback spotlight for what it is, never as a pick', () => {
    const spot = [person({ spotlight: false })];
    assert.match(D.renderSpotlight(spot, 'latest'), /Latest standout builders/);
    assert.doesNotMatch(D.renderSpotlight(spot, 'latest'), /★ Spotlight</);
    assert.match(D.renderSpotlight(spot, 'flagged'), /★ Spotlight/);
    assert.equal(D.renderSpotlight([], 'flagged'), '');
  });

  test('opens case studies from the strip in a new tab, natively, with the launch hook', () => {
    const html = D.renderStrip([person()]);
    assert.match(html, /href="\/case-studies\/claims-triage\/" target="_blank" rel="noopener" data-launch data-from="strip"/);
  });

  test('prints the API totals, and staggers the four gate rows', () => {
    const html = D.renderHero({ listed: 3, caseStudies: 4, verifiedCommits: 20, industries: 2 });
    assert.match(html, /data-count="20">20</);
    for (const delay of ['0.25s', '0.60s', '0.95s', '1.30s']) assert.match(html, new RegExp('animation-delay:' + delay.replace('.', '\\.')));
    assert.match(html, /class="step anim listed"/);
  });
});

describe('the home page uses each record\'s own cover (Ali, 2026-11-11: "shouldn\'t we use the pictures here")', () => {
  const API = 'https://enterprise.colaberry.ai';
  const look = { coverImageUrl: '/site-v2/thumb-claims.jpg?v=1', walkthroughSeconds: 125, capability: null, verified: true, workflowDiagram: true, decisions: 3, repositories: 1 };
  const withCover = person({ signature: { slug: 'claims-triage', title: 'Claims triage', industry: 'Insurance', heroMetric: null, look } });

  test('the proof-library strip shows the cover and the walkthrough length', () => {
    const html = D.renderStrip([withCover], API);
    assert.match(html, /<img class="cover" src="https:\/\/enterprise\.colaberry\.ai\/site-v2\/thumb-claims\.jpg\?v=1"/);
    assert.match(html, /▶ 2:05/);
    assert.doesNotMatch(html, /<svg/);
  });

  test('the spotlight card shows the signature cover under its ribbon', () => {
    const html = D.renderSpotlight([withCover], 'flagged', API);
    assert.match(html, /<img class="cover"[^>]*>[\s\S]*class="ribbon">★ Spotlight/);
  });

  test('a record with no cover, or an older payload with no look, keeps the generated art', () => {
    for (const t of [person(), person({ signature: { slug: 'x', title: 'X', industry: null, heroMetric: null, look: { coverImageUrl: null } } })]) {
      const strip = D.renderStrip([t], API);
      assert.match(strip, /<svg/);
      assert.doesNotMatch(strip, /<img|class="play"/);
    }
  });

  test('the whole page passes the API origin through to both places', () => {
    const html = D.renderDirectory(payload({ talent: [withCover], spotlight: [withCover], spotlightSource: 'flagged' }), D.parseFilters(''), [], API);
    assert.equal((html.match(/<img class="cover"/g) || []).length, 2);
  });
});

describe('art', () => {
  test('is deterministic per slug, with unique ids per instance', () => {
    const strip = (s) => s.replace(/\b(bg|g|p)a\d+-\d+\b/g, 'ID');
    const a = C.art('claims-triage', { n: 7 });
    const b = C.art('claims-triage', { n: 7 });
    assert.equal(strip(a), strip(b), 'same slug, same picture');
    assert.notEqual(a, b, 'two instances must not share gradient ids');
    assert.notEqual(strip(C.art('other-slug', { n: 7 })), strip(a));
    assert.match(a, /r="9" fill="#F2C14E"/, 'the terminal node is gold');
  });

  test('never repeats a gradient or pattern id across a full 48-card page', () => {
    // A full directory page holds 48 cards; some share a slug (the same case study drawn on a
    // card and in the published strip), which is exactly when ids would collide.
    const page = Array.from({ length: 48 }, (_, i) => C.art(i % 6 === 0 ? 'shared-slug' : `slug-${i}`, { n: 9 })).join('');
    const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, 48 * 3, 'three defs per picture');
    assert.equal(new Set(ids).size, ids.length, 'every id unique');
    for (const ref of page.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref[1]), `dangling url(#${ref[1]})`);
  });
});
