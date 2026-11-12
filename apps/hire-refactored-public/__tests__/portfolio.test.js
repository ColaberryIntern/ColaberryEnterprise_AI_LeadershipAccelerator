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

  test('render NOTHING for a project whose case study is not published on Hire (Ali, 2026-11-11)', () => {
    assert.equal(P.projectCard({ title: 'Intake Router', case_study_slug: 'draft-only-slug' }, published, 'ann-lee'), '');
    assert.equal(P.projectCard({ title: 'Ledger Bot', case_study_slug: null }, published, 'ann-lee'), '');
  });

  test('a whole page never names an unconverted project, a draft slug, or "in review"', () => {
    const b = body({ hire: { signature: null, caseStudies: [{ slug: 'claims-triage', title: 'Claims triage that flags itself' }], availability: null, spotlight: false, indexable: true } });
    const html = P.renderPortfolio(b, 'ann-lee', [], NOW);
    assert.match(html, /Claims triage that flags itself/);
    for (const banned of [/Intake Router/, /Ledger Bot/, /draft-only-slug/, /in review/i, /proj pending/]) assert.doesNotMatch(html, banned);
  });
});

describe('every published case study is reachable (Kes: "9 published", 2 linked, 2026-11-10)', () => {
  const cs = (slug) => ({ slug, title: 'T ' + slug, summary: 'S ' + slug, industry: 'Ops' });
  const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(cs);

  test('lists the ones neither the signature nor a project card links, once each, in API order', () => {
    const projects = [{ title: 'P1', case_study_slug: 'b' }, { title: 'P2', case_study_slug: 'c' }, { title: 'P3', case_study_slug: null }];
    const more = P.unlinkedCaseStudies({ caseStudies: nine.concat([cs('d')]) }, projects, { slug: 'a' });
    assert.deepEqual(more.map((c) => c.slug), ['d', 'e', 'f', 'g', 'h', 'i']);
  });

  test('without a signature, nothing is dropped; empty and malformed input are safe', () => {
    assert.equal(P.unlinkedCaseStudies({ caseStudies: nine }, [], null).length, 9);
    assert.deepEqual(P.unlinkedCaseStudies({}, null, null), []);
    assert.deepEqual(P.unlinkedCaseStudies({ caseStudies: [null, {}, { slug: '' }] }, [], null), []);
  });

  test('the page links exactly as many distinct case studies as the badge counts', () => {
    const b = body({
      hire: { signature: { ...cs('a'), outcomes: [] }, caseStudies: nine, availability: null, spotlight: false, indexable: true },
    });
    b.portfolio.projects = [{ title: 'P1', case_study_slug: 'b' }, { title: 'P2', case_study_slug: 'c' }];
    const html = P.renderPortfolio(b, 'ann-lee', [], NOW);
    assert.match(html, /9 published/);
    const linked = new Set([...html.matchAll(/href="\/case-studies\/([^/"]+)\/"/g)].map((m) => m[1]));
    assert.deepEqual([...linked].sort(), nine.map((c) => c.slug));
    assert.match(html, /More of their published work/);
  });

  test('a listed case card opens in a new tab with the launch hook and its own source', () => {
    const html = P.caseCard(cs('e'), 'ann-lee');
    assert.match(html, /<a class="proj" href="\/case-studies\/e\/" target="_blank" rel="noopener" data-launch data-from="case-list" data-case="e" data-talent-slug="ann-lee">/);
  });

  test('draws no extra section when every case study is already linked', () => {
    const html = P.renderPortfolio(body(), 'ann-lee', [], NOW);
    assert.doesNotMatch(html, /Published case studies/);
  });
});

describe('cards show what makes each record different (Ali, 2026-11-11)', () => {
  const C = require('../src/assets/common.js');
  const API = 'https://enterprise.colaberry.ai';
  const full = {
    slug: 'recovering-calls', title: 'Recovering the Calls', summary: 'S', industry: 'education',
    heroMetric: { value: '97%', label: 'of lost events resolved' },
    look: { coverImageUrl: '/site-v2/thumb-cora-recovery.jpg?v=8d', walkthroughSeconds: 94, capability: 'operational-ai-voice-call-event-recovery', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 },
  };

  test('helpers: media URLs resolve against the platform, lengths read as m:ss, capabilities lose the shared prefix', () => {
    assert.equal(C.mediaUrl(API, '/site-v2/a.jpg'), API + '/site-v2/a.jpg');
    assert.equal(C.mediaUrl(API + '/', '/a.jpg'), API + '/a.jpg');
    assert.equal(C.mediaUrl(API, 'https://cdn.x/a.jpg'), 'https://cdn.x/a.jpg');
    assert.equal(C.mediaUrl(API, 'javascript:alert(1)'), '');
    assert.equal(C.mediaUrl(API, '//evil.example/a.jpg'), '', 'protocol-relative is refused');
    assert.equal(C.mediaUrl(API, null), '');
    assert.equal(C.duration(94), '1:34');
    assert.equal(C.duration(60), '1:00');
    assert.equal(C.duration(5), '0:05');
    assert.equal(C.duration(0), '');
    assert.equal(C.duration(null), '');
    assert.equal(C.capabilityLabel('operational-ai-voice-call-event-recovery'), 'Voice call event recovery');
    assert.equal(C.capabilityLabel('agent-assisted-software-delivery'), 'Agent assisted software delivery');
    assert.equal(C.capabilityLabel(null), '');
    // Quincy, 2026-11-11: "Industries shows the raw tag data-infrastructure-operations".
    assert.equal(C.industryLabel('data-infrastructure-operations'), 'Data infrastructure operations');
    assert.equal(C.industryLabel('public-sector'), 'Public sector');
    assert.equal(C.industryLabel('education'), 'Education');
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

  test('a full record: its own cover with the walkthrough length, capability, figure and proof row', () => {
    const html = P.caseCard(full, 'kes', API);
    assert.match(html, /<img class="cover" src="https:\/\/enterprise\.colaberry\.ai\/site-v2\/thumb-cora-recovery\.jpg\?v=8d"/);
    assert.match(html, /class="play"[^>]*>▶ 1:34</);
    assert.match(html, /class="cap-line">Voice call event recovery</);
    assert.match(html, /class="fig"><b>97%<\/b><span>of lost events resolved/);
    assert.match(html, /<span class="ok">✓ Verified<\/span><span>Workflow diagram<\/span><span>3 decisions<\/span><span>1 repo<\/span>/);
  });

  test('an unfinished record collapses: generated art instead of a cover, and no empty figure, chip or badge', () => {
    const bare = { slug: 'bare', title: 'Bare', summary: null, industry: null, heroMetric: null,
      look: { coverImageUrl: null, walkthroughSeconds: null, capability: null, verified: false, workflowDiagram: false, decisions: 0, repositories: 0 } };
    for (const c of [bare, { slug: 'old', title: 'Old payload with no look' }]) {
      const html = P.caseCard(c, 'kes', API);
      assert.doesNotMatch(html, /<img/);
      assert.match(html, /<svg/, 'falls back to the generated art, never a blank box');
      for (const cls of ['play', 'cap-line', 'fig', 'proof']) assert.doesNotMatch(html, new RegExp('class="' + cls + '"'), cls + ' must not render empty');
    }
  });

  test('two records by the same person no longer render the same card', () => {
    const other = { ...full, slug: 'intent', title: 'Intent', heroMetric: null,
      look: { ...full.look, coverImageUrl: '/site-v2/thumb-cora-intent-routing.jpg', walkthroughSeconds: 101, capability: 'operational-ai-call-intent-routing' } };
    const strip = (h) => h.replace(/recovering-calls|intent|Recovering the Calls|Intent/g, '');
    assert.notEqual(strip(P.caseCard(full, 'kes', API)), strip(P.caseCard(other, 'kes', API)));
  });

  test('the signature and a linked project card use the same cover and proof', () => {
    const b = body({ hire: { signature: { ...full, outcomes: [] }, caseStudies: [full], availability: null, spotlight: false, indexable: true } });
    b.portfolio.projects = [];
    const html = P.renderPortfolio(b, 'kes', [], NOW, API);
    assert.match(html, /class="sig"[\s\S]*<img class="cover"[\s\S]*▶ 1:34[\s\S]*✓ Verified/);
    const proj = P.projectCard({ title: 'Cora', case_study_slug: 'recovering-calls' }, { 'recovering-calls': full }, 'kes', API);
    assert.match(proj, /<img class="cover"/);
    assert.match(proj, /class="org">Cora</);
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
