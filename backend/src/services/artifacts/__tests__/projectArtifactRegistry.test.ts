import {
  headlineFor,
  verdictFor,
  type ProjectArtifactRegistry,
  type RequiredArtifact,
} from '../projectArtifactRegistry';
import {
  GROUP_COLLAPSE_AT,
  STATE_LABELS,
  esc,
  renderProjectArtifactRegistry,
} from '../projectArtifactRegistryHtml';

/**
 * THE ONE THING THIS PAGE MUST NOT DO.
 *
 * 0 of 67 published plans carry an artifact contract. A registry that reported "0 outstanding"
 * for those would show a green zero for almost every project in the system, which is the exact
 * illusion this whole workstream exists to end: a surface that looks like oversight and produces
 * none. So `requires_nothing` is a separate verdict from `all_satisfied`, and the two must read
 * differently. Most of this suite is about that distinction and about the three ways the page can
 * quietly overclaim.
 *
 * `verdictFor`, `headlineFor` and the renderer are pure, so none of this needs a database. The
 * queries are exercised against production separately, read-only.
 */

const EMPTY_COUNTS = {
  stories_total: 0,
  stories_with_contract: 0,
  required: 0,
  satisfied: 0,
  outstanding: 0,
  existing: 0,
  unclassified: 0,
};

const reg = (over: Partial<ProjectArtifactRegistry> = {}): ProjectArtifactRegistry => ({
  project_id: 'p-1',
  plan_version: 3,
  verdict: 'requires_nothing',
  headline: '',
  required: [],
  outstanding_keys: [],
  existing: [],
  unclassified: [],
  malformed: [],
  counts: { ...EMPTY_COUNTS },
  warnings: [],
  ...over,
});

const required = (over: Partial<RequiredArtifact> = {}): RequiredArtifact => ({
  story_id: 'STORY-001',
  key: 'ART-001',
  name: 'Churn model evaluation report',
  type: 'analysis_report',
  evaluation_criteria: 'A reader who never saw the project can say what was predicted, and how well.',
  repo_path: 'docs/churn.pdf',
  state: 'missing',
  commit_sha: null,
  seen_at: null,
  ...over,
});

/** A registry with n required artifacts, the first s of them handed over. */
const withRequired = (n: number, satisfied: number): ProjectArtifactRegistry => {
  const rows = Array.from({ length: n }, (_, i) => required({
    key: `ART-${String(i + 1).padStart(3, '0')}`,
    state: i < satisfied ? 'satisfied' : 'missing',
    commit_sha: i < satisfied ? 'a'.repeat(40) : null,
    seen_at: i < satisfied ? '2026-11-18T04:00:00.000Z' : null,
  }));
  const outstanding = rows.filter((r) => r.state === 'missing').map((r) => r.key);
  const base = reg({
    required: rows,
    outstanding_keys: outstanding,
    counts: {
      ...EMPTY_COUNTS,
      stories_total: 12,
      stories_with_contract: 12,
      required: n,
      satisfied,
      outstanding: outstanding.length,
      existing: 5,
    },
  });
  // The builder computes these two LAST, from the counts, and the page renders them. A fixture
  // that left them at their defaults rendered an empty headline and still passed most of this
  // suite, which is how the first version of the page test proved nothing about the headline.
  return { ...base, verdict: verdictFor(base), headline: headlineFor(base) };
};

describe('the registry verdict', () => {
  it('separates "requires nothing" from "all satisfied"', () => {
    // THE distinction. These two would both show zero outstanding, and they mean opposite things.
    expect(verdictFor(reg({ counts: { ...EMPTY_COUNTS, stories_total: 12 } }))).toBe('requires_nothing');
    expect(verdictFor(withRequired(3, 3))).toBe('all_satisfied');
    expect(verdictFor(withRequired(3, 1))).toBe('outstanding');
  });

  it('says there is no plan rather than that nothing is required', () => {
    expect(verdictFor(reg({ plan_version: null }))).toBe('no_plan');
  });
});

describe('the headline', () => {
  it('refuses to congratulate a project that promised nothing', () => {
    const h = headlineFor(reg({
      counts: { ...EMPTY_COUNTS, stories_total: 12, existing: 9 },
    }));
    expect(h).toContain('requires NONE of them');
    expect(h).toContain('absence of promises, not a clean record');
    // The words that would make this read as compliance.
    expect(h).not.toMatch(/all required|nothing outstanding|up to date|complete/i);
  });

  it('names what is owed, rather than counting it', () => {
    const h = headlineFor(withRequired(3, 1));
    expect(h).toContain('2 of 3');
    expect(h).toContain('ART-002');
    expect(h).toContain('ART-003');
  });

  it('is plain when everything required really is handed over', () => {
    const h = headlineFor(withRequired(2, 2));
    expect(h).toContain('All 2 required artifacts have been handed over');
  });

  it('counts unclassified artifacts as held, so the total is not quietly smaller', () => {
    const h = headlineFor(reg({
      plan_version: null,
      counts: { ...EMPTY_COUNTS, existing: 4, unclassified: 2 },
    }));
    expect(h).toContain('Holds 6 artifacts');
  });

  it('says "1 artifact" rather than "1 artifacts"', () => {
    expect(headlineFor(reg({ plan_version: null, counts: { ...EMPTY_COUNTS, existing: 1 } })))
      .toContain('Holds 1 artifact.');
  });
});

describe('the page', () => {
  const page = (r: ProjectArtifactRegistry) => renderProjectArtifactRegistry(r, '2026-11-18T07:00:00Z');

  it('renders, and leads with the headline', () => {
    const html = page(withRequired(3, 1));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Artifact registry');
    expect(html.indexOf('2 of 3')).toBeGreaterThan(-1);
    // The control: a real page, not a stub.
    expect(html.length).toBeGreaterThan(2000);
  });

  it('says what the missing thing was supposed to be, which is the point of the page', () => {
    const html = page(withRequired(2, 0));
    // The path it was promised at...
    expect(html).toContain('docs/churn.pdf');
    // ...and the sentence it would have been judged by.
    expect(html).toContain('A reader who never saw the project can say what was predicted');
    expect(html).toContain('Still owed');
  });

  it('shows the commit a satisfied artifact was seen at', () => {
    const html = page(withRequired(1, 1));
    expect(html).toContain('aaaaaaaaa');
    expect(html).toContain('2026-11-18');
    expect(html).toContain('Handed over');
  });

  it('tells a project that requires nothing so, in the table as well as the headline', () => {
    const html = page(reg({ counts: { ...EMPTY_COUNTS, stories_total: 12, existing: 9 } }));
    expect(html).toContain('absence of');
    expect(html).toContain('nothing was asked for');
    // And it must not draw an empty table that reads as a clean list.
    expect(html).not.toContain('<tbody></tbody>');
  });

  it('puts a failed read ABOVE everything, in red, never as an empty list', () => {
    const html = page(reg({
      warnings: ['The repository verification rows could not be read'],
      counts: { ...EMPTY_COUNTS, stories_total: 12 },
    }));
    expect(html).toContain('could not be read, so this page is incomplete');
    expect(html).toContain('The repository verification rows could not be read');
    // Above the headline: "we could not look" must not look like "there is nothing there".
    expect(html.indexOf('this page is incomplete')).toBeLessThan(html.indexOf('absence of'));
  });

  it('lists a malformed contract rather than treating it as no contract', () => {
    const html = page(reg({
      malformed: [{ story_id: 'STORY-007', refusals: ['type_unknown', 'key_malformed'] }],
      counts: { ...EMPTY_COUNTS, stories_total: 12, stories_with_contract: 1 },
    }));
    expect(html).toContain('Contracts that do not parse');
    expect(html).toContain('STORY-007');
    expect(html).toContain('type_unknown');
    expect(html).toContain('unreadable promise is not the same as no promise');
  });

  it('shows an unclassified artifact rather than filing it under a guess', () => {
    const html = page(reg({
      unclassified: [{ kind: 'mystery_kind', catalog_type: null, title: 'A thing', created_at: '2026-11-01T00:00:00.000Z' }],
      counts: { ...EMPTY_COUNTS, stories_total: 1, unclassified: 1 },
    }));
    expect(html).toContain('Unclassified (1)');
    expect(html).toContain('mystery_kind');
    expect(html).toContain('filed under a type nobody chose');
  });

  it('groups what exists by catalog type, largest first', () => {
    const html = page(reg({
      existing: [
        { kind: 'case_study', catalog_type: 'case_study', title: 'One', created_at: '2026-11-01T00:00:00.000Z' },
        { kind: 'build_artifact', catalog_type: 'build_artifact', title: 'Two', created_at: '2026-11-02T00:00:00.000Z' },
        { kind: 'build_artifact', catalog_type: 'build_artifact', title: 'Three', created_at: '2026-11-03T00:00:00.000Z' },
      ],
      counts: { ...EMPTY_COUNTS, existing: 3 },
    }));
    expect(html.indexOf('build_artifact')).toBeLessThan(html.indexOf('case_study'));
    expect(html).toContain('(2)');
  });

  it('escapes everything, because a title is somebody else\'s text', () => {
    const html = page(reg({
      existing: [{
        kind: 'case_study',
        catalog_type: 'case_study',
        title: '<script>alert(1)</script> & "quoted"',
        created_at: '2026-11-01T00:00:00.000Z',
      }],
      counts: { ...EMPTY_COUNTS, existing: 1 },
    }));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });

  it('is pure: the same registry and timestamp give byte-identical HTML', () => {
    const r = withRequired(3, 2);
    expect(page(r)).toBe(page(r));
  });

  it('declares a label for every state the registry can produce', () => {
    // A state with no label would render blank, which reads as "fine".
    const states: Array<RequiredArtifact['state']> =
      ['satisfied', 'present_content_unchecked', 'missing', 'not_repo_evidence'];
    expect(Object.keys(STATE_LABELS).sort()).toEqual([...states].sort());
    for (const s of states) {
      expect(STATE_LABELS[s].label.length).toBeGreaterThan(5);
    }
    // And the one that means "owed" is the only one coloured as bad.
    expect(Object.entries(STATE_LABELS).filter(([, v]) => v.tone === 'bad').map(([k]) => k))
      .toEqual(['missing']);
  });

  it('never claims a platform artifact was verified here', () => {
    const html = page(reg({
      required: [required({ state: 'not_repo_evidence', repo_path: null, type: 'portfolio' })],
      counts: { ...EMPTY_COUNTS, required: 1, stories_total: 1, stories_with_contract: 1 },
    }));
    expect(html).toContain('not checkable here');
    expect(html).toContain('handed over on the platform');
    expect(html).not.toContain('Handed over<');
  });

  it('escapes with the helper the page uses, including quotes', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('two defects a screenshot found that the assertions did not', () => {
  const page = (r: ProjectArtifactRegistry) => renderProjectArtifactRegistry(r, '2026-11-18T07:00:00Z');

  it('keeps an artifact key on one line', () => {
    // The browser breaks ART-001 at the hyphen into "ART-" and "001". Every assertion about that
    // cell passed while it rendered as two lines; only the screenshot showed it.
    const html = page(withRequired(1, 0));
    const cell = html.slice(html.indexOf('<td'), html.indexOf('</td>'));
    expect(cell).toContain('white-space:nowrap');
  });

  it('collapses a large holdings group instead of printing a wall of bullets', () => {
    // 79 artifacts as one flat list made the page about 2,600 pixels tall. Nobody reads that.
    const many = Array.from({ length: GROUP_COLLAPSE_AT + 4 }, (_, i) => ({
      kind: 'build_artifact', catalog_type: 'build_artifact',
      title: `Upload ${i + 1}`, created_at: '2026-10-02T00:00:00.000Z',
    }));
    const html = page(reg({ existing: many, counts: { ...EMPTY_COUNTS, existing: many.length } }));
    expect(html).toContain('<details');
    expect(html).toContain(`(${many.length})`);
    // Everything is still there, just behind the disclosure.
    expect(html).toContain('Upload 1');
    expect(html).toContain(`Upload ${many.length}`);
  });

  it('leaves a small group open, because hiding three items helps nobody', () => {
    const few = Array.from({ length: GROUP_COLLAPSE_AT }, (_, i) => ({
      kind: 'case_study', catalog_type: 'case_study',
      title: `Case ${i + 1}`, created_at: '2026-10-02T00:00:00.000Z',
    }));
    const html = page(reg({ existing: few, counts: { ...EMPTY_COUNTS, existing: few.length } }));
    expect(html).not.toContain('<details');
    expect(html).toContain('Case 1');
  });
});
