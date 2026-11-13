/**
 * The candidate-written profile pieces (kit §1.4, §1.5) and how the profile uses them: each
 * collapses when its data is absent, times show in the VIEWER's zone, and with no open time the
 * page keeps today's Request intro.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const X = require('../src/assets/profile-extras.js');
const P = require('../src/assets/portfolio.js');

const API = 'https://enterprise.colaberry.ai';
const NOW = new Date('2026-11-13T12:00:00Z');
const SLOTS = ['2026-11-16T15:00:00.000Z', '2026-11-16T15:30:00.000Z', '2026-11-17T21:00:00.000Z'];
const OPEN = { enabled: true, nextSlots: SLOTS, formats: [{ id: 'intro', name: 'Intro call', minutes: 20 }] };
const INTRO = {
  answers: [
    { key: 'handed', question: 'What problem do you most want to be handed?', text: 'Messy <data> pipelines.' },
    { key: 'caught', question: 'Tell us about a time you caught something before it shipped.', text: 'A timezone bug.' },
  ],
  roles: ['QA Analyst'], setups: ['remote', 'hybrid'], earliestStart: '2026-12-01',
  video: { streamUrl: '/site-v2/v/intro.mp4', posterUrl: '/site-v2/v/p.jpg', captionsUrl: '/site-v2/v/c.vtt', seconds: 90 },
};
const body = (hire = {}) => ({
  ok: true,
  portfolio: { identity: { full_name: 'Ann Lee', headline: 'QA', linkedin_url: 'https://www.linkedin.com/in/ann' }, about: [], experience: [], projects: [], capabilities: [], verified_commits: [], stats: {} },
  hire: { signature: null, caseStudies: [{ slug: 'a', title: 'A' }], availability: null, indexable: false, ...hire },
});

describe('In their words (§1.4)', () => {
  test('renders the video with captions on, the answers escaped, and the Looking for chips', () => {
    const html = X.inTheirWords(INTRO, API);
    assert.match(html, /In their words <span class="src">written by the candidate<\/span>/);
    assert.match(html, /<source src="https:\/\/enterprise\.colaberry\.ai\/site-v2\/v\/intro\.mp4">/);
    assert.match(html, /poster="https:\/\/enterprise\.colaberry\.ai\/site-v2\/v\/p\.jpg"/);
    assert.match(html, /<track kind="captions"[^>]*default>/);
    assert.match(html, /Intro · 1:30/);
    assert.match(html, /Messy &lt;data&gt; pipelines\./);
    for (const chip of ['QA Analyst', 'Remote', 'Hybrid', 'Can start Dec 1, 2026']) assert.match(html, new RegExp('<span class="look-chip">' + chip + '</span>'));
  });

  test('each part collapses on its own, and nothing at all renders no card', () => {
    const noVideo = X.inTheirWords({ ...INTRO, video: null }, API);
    assert.doesNotMatch(noVideo, /video-box/);
    assert.match(noVideo, /class="words one"/);
    assert.doesNotMatch(X.inTheirWords({ ...INTRO, answers: [] }, API), /class="qa"/);
    assert.doesNotMatch(X.inTheirWords({ ...INTRO, roles: [], setups: [], earliestStart: null }, API), /Looking for/);
    assert.equal(X.inTheirWords(null, API), '');
    assert.equal(X.inTheirWords({ answers: [], roles: [], setups: [], earliestStart: null, video: null }, API), '');
    // A video URL that is not http(s) or site-relative is dropped, never rendered.
    assert.doesNotMatch(X.inTheirWords({ ...INTRO, video: { streamUrl: 'javascript:alert(1)' } }, API), /<video/);
  });
});

describe('Book an interview (§1.5)', () => {
  test('the next 3 open times in the viewer zone, each preselecting its slot, then See all times', () => {
    const html = X.bookCard(OPEN, 'ann-lee', 'America/New_York');
    assert.match(html, /Next open times in your time zone \(Eastern \(ET\)\)/);
    assert.equal((html.match(/class="slot-link"/g) || []).length, 3);
    assert.match(html, /href="\/talent\/ann-lee\/schedule\/\?slot=2026-11-16T15%3A00%3A00\.000Z" data-book="ann-lee"><span>Mon, Nov 16<\/span><b>10:00 AM<\/b>/);
    assert.match(html, /href="\/talent\/ann-lee\/schedule\/" data-book="ann-lee">See all times/);
    // The same instant, read in Central, is an hour earlier.
    assert.match(X.bookCard(OPEN, 'ann-lee', 'America/Chicago'), /<b>9:00 AM<\/b>/);
  });

  test('booking off or no open time renders nothing', () => {
    assert.equal(X.bookCard({ ...OPEN, enabled: false }, 'ann-lee', 'America/Chicago'), '');
    assert.equal(X.bookCard({ ...OPEN, nextSlots: [] }, 'ann-lee', 'America/Chicago'), '');
    assert.equal(X.bookCard(undefined, 'ann-lee', 'America/Chicago'), '');
  });
});

describe('the profile with and without booking', () => {
  // One call shape for every case: the payload varies, the slug, clock, API and zone do not.
  const TZ = 'America/Chicago';
  const render = (hire) => P.renderPortfolio(body(hire), 'ann-lee', [], NOW, API, TZ);
  test('bookable: Schedule interview leads, the booking card tops the sidebar, Contact drops Request intro', () => {
    const html = render({ booking: OPEN, intro: INTRO });
    assert.match(html, /<div class="p-actions"><a class="btn btn-primary" href="\/talent\/ann-lee\/schedule\/" data-book="ann-lee">.*Schedule interview<\/a>/);
    assert.match(html, /<aside class="side"><div class="card book">/);
    assert.doesNotMatch(html, /btn btn-primary btn-block" href="\/intro\//);
    assert.match(html, /Or request an intro/);
    // In their words sits after the carousel and before About.
    assert.ok(html.indexOf('In their words') > html.indexOf('class="car"'));
  });

  test('not bookable: exactly today\'s Request intro, and no booking card or empty words card', () => {
    const html = render({ booking: { enabled: false, nextSlots: [], formats: [] }, intro: null });
    assert.match(html, /<div class="p-actions"><a class="btn btn-primary" href="\/intro\/\?talent=ann-lee" data-intro="ann-lee">Request intro<\/a>/);
    assert.match(html, /btn btn-primary btn-block" href="\/intro\/\?talent=ann-lee"/);
    assert.doesNotMatch(html, /card book|In their words|schedule\//);
  });

  test('no contact detail of the candidate ever reaches the page', () => {
    const html = render({ booking: OPEN, intro: INTRO });
    assert.doesNotMatch(html, /mailto:|tel:/);
  });
});

describe('zones', () => {
  test('a known zone has a plain name; anything else falls back to its id, readable', () => {
    assert.equal(X.zoneName('America/Chicago'), 'Central (CT)');
    assert.equal(X.zoneName('Europe/London'), 'Europe/London');
    assert.equal(X.isZone('Not/AZone'), false);
    assert.ok(X.isZone(X.viewerZone()));
  });
});
