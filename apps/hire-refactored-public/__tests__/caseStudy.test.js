/**
 * The case-study frame and the intro form. The record body is the shared renderer's
 * (packages/case-study-shell), so what is asserted here is the hire layer around it.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../src/assets/case-study.js');
const I = require('../src/assets/intro.js');

const body = (over = {}) => ({
  surface: { key: 'hire', sectionOrder: ['hero', 'builder', 'contributors', 'build'] },
  caseStudy: {
    slug: 'claims-triage', title: 'Claims triage that flags itself', standfirst: 'Late claims surface first.',
    industry: 'Insurance', organizationLabel: 'A regional insurer', stack: ['Node', 'Postgres'],
    heroMetrics: [{ label: 'queues merged', valueDisplay: '3', unit: null }],
    builder: { name: 'Ann Lee', roleTitle: 'AI Systems Architect', photoUrl: null },
    repositories: [{ label: 'annlee/claims', url: 'https://github.com/annlee/claims', role: 'primary' }],
  },
  builderPortfolioSlug: 'ann-lee',
  ...over,
});

describe('the hire hero', () => {
  test('leads with the gold eyebrow and links "Built by" to the portfolio when reachable', () => {
    const html = S.hero(body());
    assert.match(html, /★ Published case study · Insurance/);
    assert.match(html, /<a class="builder" href="\/talent\/ann-lee\/"/);
    assert.match(html, /<h1 id="cs-title" tabindex="-1">/, 'focus starts on the h1 (MOTION §6)');
  });

  test('renders the chip unlinked when the builder is not reachable on Hire', () => {
    const html = S.hero(body({ builderPortfolioSlug: null }));
    assert.match(html, /<span class="builder">/);
    assert.doesNotMatch(html, /href="\/talent\//);
  });

  test('draws no chip at all for a record that names no builder', () => {
    const b = body(); b.caseStudy.builder = null;
    assert.doesNotMatch(S.hero(b), /class="builder"/);
    assert.doesNotMatch(S.hireCard(b), /Request intro/);
  });
});

describe('outcomes and the hire card', () => {
  test('shows only the record\'s own hero metrics, at most four', () => {
    const b = body(); b.caseStudy.heroMetrics = Array.from({ length: 6 }, (_, i) => ({ label: 'm' + i, valueDisplay: String(i), unit: null }));
    assert.equal((S.outcomes(b).match(/<b>/g) || []).length, 4);
    b.caseStudy.heroMetrics = [];
    assert.equal(S.outcomes(b), '', 'no metric, no tile - nothing is invented');
  });

  test('links repositories only over https', () => {
    const b = body(); b.caseStudy.repositories = [{ label: 'x', url: 'javascript:alert(1)' }];
    assert.doesNotMatch(S.hireCard(b), /javascript:/);
  });

  test('sends the intro request for the builder, by slug', () => {
    assert.match(S.hireCard(body()), /href="\/intro\/\?talent=ann-lee"/);
  });
});

describe('paths and payloads', () => {
  test('reads /case-studies/<slug>/ and refuses the shell and traversal', () => {
    assert.equal(S.slugFromPath('/case-studies/claims-triage/'), 'claims-triage');
    assert.equal(S.slugFromPath('/case-studies/record/'), null);
    assert.equal(S.slugFromPath('/case-studies/../x'), null);
  });

  test('treats a 404 body as not-a-record', () => {
    assert.equal(S.isPayload({ error: 'Not found' }), false);
    assert.equal(S.isPayload(body()), true);
  });
});

describe('the shell wiring', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'case-studies', 'record', 'index.html'), 'utf8');
  test('mounts the shared renderer on the hire surface, into a frame shipped hidden', () => {
    assert.match(html, /case-study-record\.js" data-api="\{\{brand\.platformApiBase\}\}"\s+data-surface="hire"/);
    assert.match(html, /<div class="wrap" id="case-frame" hidden>/);
    assert.match(html, /id="cs-record"/);
  });
});

describe('the intro form', () => {
  test('has an honest message for every response class', () => {
    assert.equal(I.introStatus(201).ok, true);
    assert.equal(I.introStatus(200).ok, true);
    for (const code of [0, 400, 429, 500, 503]) assert.equal(I.introStatus(code).ok, false);
    assert.match(I.introStatus(429).text, /Too many/);
  });

  test('accepts only a slug-shaped talent parameter', () => {
    assert.equal(I.talentFrom('?talent=ann-lee'), 'ann-lee');
    assert.equal(I.talentFrom('?talent=<script>'), '');
    assert.equal(I.talentFrom(''), '');
  });

  test('works without JavaScript: a real POST form to the API', () => {
    const intro = fs.readFileSync(path.join(__dirname, '..', 'src', 'intro', 'index.html'), 'utf8');
    assert.match(intro, /<form class="intro-form" id="intro-form" method="post" action="\{\{brand\.platformApiBase\}\}\/api\/public\/hire\/intro"/);
    for (const name of ['talentSlug', 'name', 'email', 'company', 'role', 'message']) assert.match(intro, new RegExp('name="' + name + '"'));
  });
});
