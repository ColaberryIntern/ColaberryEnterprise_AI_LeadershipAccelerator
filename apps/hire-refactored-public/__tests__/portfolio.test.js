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

describe('project cards', () => {
  const published = { 'claims-triage': { slug: 'claims-triage', title: 'Claims triage that flags itself' } };

  test('link only when the case study is published on Hire, in a new tab, with the launch hook', () => {
    const html = P.projectCard({ title: 'Claims Triage', case_study_slug: 'claims-triage' }, published, 'ann-lee');
    assert.match(html, /<a class="proj" href="\/case-studies\/claims-triage\/" target="_blank" rel="noopener" data-launch data-from="project"/);
  });

  test('say "Case study in review" with the PROJECT title when the case study is not published there', () => {
    const html = P.projectCard({ title: 'Intake Router', case_study_slug: 'draft-only-slug' }, published, 'ann-lee');
    assert.match(html, /class="proj pending"/);
    assert.match(html, /Case study in review/);
    assert.match(html, /<h4>Intake Router<\/h4>/);
    assert.doesNotMatch(html, /draft-only-slug/, 'an unpublished case study slug must not reach the page');
    assert.doesNotMatch(html, /<a /, 'a pending card is not a link');
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
  test('leads with the signature case study and does not repeat it as a project', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.match(html, /★ Signature case study[\s\S]*class="sig"[\s\S]*data-from="signature"/);
    assert.equal((html.match(/href="\/case-studies\/claims-triage\/"/g) || []).length, 1);
    assert.match(html, /Case-study verified · 1 published/);
  });

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
