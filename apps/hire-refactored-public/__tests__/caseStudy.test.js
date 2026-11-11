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

describe('a role-only record linked to a listed person (audit 2026-11-08)', () => {
  const roleOnly = (over) => { const b = body(over); b.caseStudy.builder = { name: null, roleTitle: 'AI Systems Architect', photoUrl: null }; return b; };
  const portfolioRes = { ok: true, status: 200, body: { ok: true, portfolio: { identity: { full_name: 'Kes D', headline: 'QA', avatar_data_url: null } } } };

  test('names the builder from their public portfolio, keeping the record\'s role title', () => {
    const person = S.personFromPortfolio(portfolioRes);
    assert.deepEqual(person, { name: 'Kes D', role: 'QA', avatarUrl: null });
    const html = S.hero(roleOnly(), person);
    assert.match(html, /Built by Kes D/);
    assert.match(html, /AI Systems Architect/, 'the record\'s role beats the portfolio headline');
    assert.match(S.hireCard(roleOnly(), person), /Request intro/);
  });

  test('never borrows a portfolio name when the server linked no reachable person', () => {
    const person = S.personFromPortfolio(portfolioRes);
    assert.doesNotMatch(S.hero(roleOnly({ builderPortfolioSlug: null }), person), /class="builder"/);
    assert.equal(S.builderOf(roleOnly()), null, 'before the portfolio answers there is no name to show');
  });

  test('reads nothing from a failed or malformed portfolio response', () => {
    assert.equal(S.personFromPortfolio({ ok: false, status: 404, body: null }), null);
    assert.equal(S.personFromPortfolio({ ok: true, body: { identity: { full_name: 'top-level is not the shape' } } }), null);
    assert.equal(S.personFromPortfolio({ ok: true, body: { portfolio: { identity: { full_name: '' } } } }), null);
  });

  test('badges a verified record only, and counts private repositories without naming them', () => {
    assert.doesNotMatch(S.hero(body()), /✓ Verified/, 'no class, no badge');
    const v = body(); v.caseStudy.verificationClass = 'verified';
    assert.match(S.hero(v), /✓ Verified/);
    const a = body(); a.caseStudy.verificationClass = 'anonymized';
    assert.doesNotMatch(S.hero(a), /✓ Verified/);
    const p = body(); p.caseStudy.repositories = []; p.caseStudy.privateRepositoryCount = 1;
    assert.match(S.hireCard(p), /1 private repository/);
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

  test('hides the shell hero\'s COPY only, never its picture slot (the walkthrough lives there)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'case-study.css'), 'utf8');
    assert.doesNotMatch(css, /#cs-record\s*>\s*\.cs-hero\s*\{\s*display:\s*none/, 'hiding the whole hero hid every video on Hire');
    assert.match(css, /#cs-record\s*>\s*\.cs-hero\s*>\s*\.cs-hero-copy\s*\{\s*display:\s*none/);
  });

  test('the person card stays on screen: its aside is the grid item, not a card-high wrapper', () => {
    // A sticky box only travels inside its parent. With #hire-card-host as an ordinary block, the
    // aside was as tall as the card (592px beside a 12,199px record) and scrolled away.
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'case-study.css'), 'utf8');
    assert.match(html, /<div class="cs-body">\s*<article[^>]*id="cs-record"[^>]*><\/article>\s*<div id="hire-card-host"><\/div>/);
    assert.match(css, /#hire-card-host\s*\{\s*display:\s*contents\s*\}/);
    assert.match(css, /\.sticky\s*\{\s*position:\s*sticky;\s*top:\s*\d+px\s*\}/);
    assert.match(S.hireCard({ caseStudy: {} }, null), /^<aside><div class="sticky">/);
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
