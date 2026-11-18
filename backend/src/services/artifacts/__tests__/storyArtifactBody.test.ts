import * as fs from 'fs';
import * as path from 'path';

import { validateArtifactContract, validateStoryPlanArtifacts } from '../storyArtifactContract';
import type { ResolvedArtifact } from '../storyArtifactContract';

/**
 * WHAT A1 PUT IN FRONT OF A PERSON, AND THE THREE WAYS IT COULD QUIETLY STOP BEING TRUE.
 *
 * A0 gave a story a contract. Nothing rendered it, so the ticket a builder is judged against
 * still said only "all acceptance scenarios pass". A1 renders it. The risks are not that the
 * renderer throws; they are that it silently stops showing something:
 *
 *   1. A FIELD GOES UNRENDERED. A rule that decides whether an artifact is accepted, and that
 *      the ticket does not show, is a rule a builder is held to and cannot read. So the field
 *      list is held against the REAL resolved shape rather than a list written by hand, and
 *      every value is looked for in the output.
 *   2. THE LOOP STOP GOES BACK INSIDE THE TRUST LINE. Before A1 it was rendered inside
 *      `if (s.trust)`, so a story with no `trust` field showed no stop condition at all. That
 *      is asserted against the publisher's SOURCE, because it is a property of where the call
 *      sits, which no amount of calling the renderer directly can prove.
 *   3. THE HARD GATE GETS SOFTENED. One edit to the publisher turns the requirement back into a
 *      report. Also asserted against the source.
 *
 * The publisher is CommonJS outside this workspace and `publish_story_build.js` runs on require
 * (it reads a config from argv at load), so the renderer was extracted into `lib/artifactBody.js`
 * to be testable at all. The publisher itself is read as text, never required.
 */

const SKILL_SCRIPTS = path.resolve(__dirname, '../../../../../.claude/skills/story-build/scripts');
const BODY_RENDERER = path.join(SKILL_SCRIPTS, 'lib/artifactBody.js');
const PUBLISHER = path.join(SKILL_SCRIPTS, 'publish_story_build.js');

interface BodyRenderer {
  ARTIFACT_BODY_FIELDS: string[];
  GATE_LABELS: Record<string, string>;
  artifactsHtml: (artifacts: unknown) => string;
  loopStopHtml: (artifacts: unknown) => string;
  contractSkeleton: (storyIds: string[]) => string;
  escapeHtml: (s: unknown) => string;
}

/** Loaded inside the tests: a require in a describe body that throws takes the whole suite with
 * it, including the test whose job is to report the file missing. */
let cached: BodyRenderer | null = null;
function renderer(): BodyRenderer {
  if (!cached) cached = require(BODY_RENDERER) as BodyRenderer;
  return cached;
}

let cachedSource: string | null = null;
function publisherSource(): string {
  if (cachedSource === null) cachedSource = fs.readFileSync(PUBLISHER, 'utf8');
  return cachedSource;
}

/** One fully populated artifact, so no field is absent for an uninteresting reason. */
function resolveOne(over: Record<string, unknown> = {}): ResolvedArtifact {
  const raw = [{
    key: 'ART-014',
    name: 'Churn model evaluation report',
    type: 'analysis_report',
    file_types: ['pdf'],
    repo_path: 'docs/artifacts/ART-014-churn.pdf',
    must_contain: ['confusion matrix', 'baseline comparison'],
    evaluation_criteria: 'A reader who never saw the project can say what was predicted, and how well.',
    gates: ['story_complete', 'release_demo'],
    ...over,
  }];
  const result = validateArtifactContract(raw, { storyId: 'S-014' });
  if (!result.ok) {
    throw new Error(`fixture does not validate: ${result.refusals.map((r) => r.code).join(',')}`);
  }
  return result.artifacts[0];
}

describe('the artifact contract, rendered into the ticket', () => {
  it('the renderer is where this test expects it', () => {
    expect(fs.existsSync(BODY_RENDERER)).toBe(true);
    expect(fs.existsSync(PUBLISHER)).toBe(true);
  });

  it('renders a block at all, with the key, the name and the type', () => {
    // The control. Every assertion below is "X appears in the HTML", which a renderer returning
    // one enormous string of everything would also satisfy; this is the test that the output is
    // the shape a person reads.
    const html = renderer().artifactsHtml([resolveOne()]);
    expect(html).toContain('HANDS OVER');
    expect(html).toContain('ART-014');
    expect(html).toContain('Churn model evaluation report');
    expect(html).toContain('analysis_report');
    expect(html.match(/<li>/g) || []).toHaveLength(1);
    expect(html.length).toBeGreaterThan(300);
  });

  it('declares exactly the fields a resolved artifact actually has', () => {
    // Risk 1. Add a field to the contract and this fails until the renderer accounts for it.
    const resolved = resolveOne();
    expect(renderer().ARTIFACT_BODY_FIELDS.slice().sort()).toEqual(Object.keys(resolved).sort());
  });

  it('shows the value of every field a builder is judged on', () => {
    const resolved = resolveOne();
    const html = renderer().artifactsHtml([resolved]);
    const missing: string[] = [];
    for (const field of renderer().ARTIFACT_BODY_FIELDS) {
      const value = (resolved as unknown as Record<string, unknown>)[field];
      // requires_screenshot is false here and renders as the ABSENCE of a line; it gets its own
      // two-directional test below, because "false" is not a string to look for.
      if (typeof value === 'boolean') continue;
      const parts = Array.isArray(value) ? value : [value];
      for (const p of parts) {
        // A gate is shown as the sentence a person reads ("this story is complete"), not as the
        // enum ("story_complete"), so the label map is what the value has to be looked for
        // through. Taken from the renderer rather than restated, so the two cannot disagree.
        const shown = field === 'gates' ? (renderer().GATE_LABELS[String(p)] || String(p)) : p;
        const needle = renderer().escapeHtml(shown);
        if (needle && !html.includes(needle)) missing.push(`${field}=${String(p)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names where the artifact is handed over, and never invents a path for a platform one', () => {
    const repoHtml = renderer().artifactsHtml([resolveOne()]);
    expect(repoHtml).toContain('docs/artifacts/ART-014-churn.pdf');
    expect(repoHtml).toContain('in the repo');

    const platform = resolveOne({ type: 'portfolio', file_types: undefined, repo_path: undefined });
    expect(platform.evidence_source).toBe('platform');
    expect(platform.repo_path).toBeNull();
    const platformHtml = renderer().artifactsHtml([platform]);
    expect(platformHtml).toContain('on the platform');
    expect(platformHtml).not.toContain('Hand it over in the repo');
    // The hole this closes: a null path rendered as the word "null" in a ticket.
    expect(platformHtml).not.toContain('null');
  });

  it('asks for a capture only for the types that owe one', () => {
    // Both directions: a matcher never seen to NOT match proves nothing.
    const owes = resolveOne({ type: 'demo_capture', file_types: ['png'], repo_path: undefined });
    expect(owes.requires_screenshot).toBe(true);
    expect(renderer().artifactsHtml([owes])).toContain('screen capture');

    const doesNot = resolveOne();
    expect(doesNot.requires_screenshot).toBe(false);
    expect(renderer().artifactsHtml([doesNot])).not.toContain('screen capture');
  });

  it('says "any file type" rather than printing a bare asterisk', () => {
    const any = resolveOne({ type: 'build_artifact', file_types: undefined, repo_path: 'src/app.ts' });
    expect(any.file_types).toEqual(['*']);
    const html = renderer().artifactsHtml([any]);
    expect(html).toContain('any file type');
    expect(html).not.toContain('<code>*</code>');
  });

  it('escapes what it renders, because a name reaches a ticket as HTML', () => {
    const hostile = resolveOne({ name: '<script>alert(1)</script> & "quoted"' });
    const html = renderer().artifactsHtml([hostile]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('renders nothing at all for a story with no contract', () => {
    // A story that predates the contract must have a body byte-for-byte what it had before A1.
    for (const empty of [undefined, null, []]) {
      expect(renderer().artifactsHtml(empty)).toBe('');
    }
  });
});

describe('the loop stop', () => {
  it('names every artifact key when there is a contract', () => {
    const two = validateArtifactContract([
      { key: 'ART-014', name: 'Report', type: 'analysis_report', repo_path: 'docs/a.pdf' },
      { key: 'ART-015', name: 'Page', type: 'portfolio' },
    ], { storyId: 'S-014' });
    expect(two.ok).toBe(true);
    const html = renderer().loopStopHtml(two.artifacts);
    expect(html).toContain('all acceptance scenarios pass');
    expect(html).toContain('every artifact key is present');
    expect(html).toContain('ART-014');
    expect(html).toContain('ART-015');
  });

  it('falls back to the old sentence, and only the old sentence, with no contract', () => {
    for (const empty of [undefined, null, []]) {
      const html = renderer().loopStopHtml(empty);
      expect(html).toContain('all acceptance scenarios pass');
      expect(html).not.toContain('artifact key');
    }
  });

  it('is rendered for every story, not only one that has a trust line', () => {
    // Risk 2, asserted against the publisher's source, because it is a property of WHERE the
    // call sits. Before A1 the stop condition was rendered inside `if (s.trust)`, so a story
    // with no `trust` field showed no stop condition at all.
    const source = publisherSource();
    const trustLine = source.split('\n').find((l) => l.includes('Trust (TBI)'));
    expect(trustLine).toBeDefined();
    expect(trustLine).not.toContain('Loop stop');
    expect(trustLine).not.toContain('loopStopHtml');

    const stopLine = source.split('\n').find((l) => l.includes('rows.push(loopStopHtml('));
    expect(stopLine).toBeDefined();
    // Unconditional: no `if` guarding the push on its own line.
    expect(stopLine!.trim()).toBe('rows.push(loopStopHtml(artifacts));');

    // And the renderer never returns nothing, in either branch, or the line above renders a gap.
    expect(renderer().loopStopHtml([]).length).toBeGreaterThan(20);
    expect(renderer().loopStopHtml(resolveOne() ? [resolveOne()] : []).length).toBeGreaterThan(20);
  });
});

describe('gate 5 requires a contract as of A1', () => {
  it('refuses a story that declares nothing, and reports which ones', () => {
    const stories = [
      { id: 'S-001' },
      { id: 'S-002', artifacts: [{ key: 'ART-001', name: 'Guide', type: 'field_guide' }] },
      { id: 'S-003' },
    ];
    const hard = validateStoryPlanArtifacts(stories, {}, { requireContract: true });
    expect(hard.ok).toBe(false);
    expect(hard.refusals.map((r) => r.code)).toEqual(['story_missing_contract', 'story_missing_contract']);
    expect(hard.refusals.map((r) => r.storyId)).toEqual(['S-001', 'S-003']);
    expect(hard.storiesMissingContract).toEqual(['S-001', 'S-003']);
    expect(hard.storiesWithContract).toBe(1);

    // The other direction: the default is still lenient, so the platform can read old boards.
    const soft = validateStoryPlanArtifacts(stories, {});
    expect(soft.ok).toBe(true);
    expect(soft.refusals).toEqual([]);
    expect(soft.storiesMissingContract).toEqual(['S-001', 'S-003']);
  });

  it('counts a story with no id as missing, rather than skipping it', () => {
    // A story with no id cannot be reached by a by_story override, so it can never acquire a
    // contract. Skipping it would make the gate quietly passable by deleting a story id.
    const hard = validateStoryPlanArtifacts([{ title: 'no id' }], {}, { requireContract: true });
    expect(hard.ok).toBe(false);
    expect(hard.refusals.map((r) => r.code)).toEqual(['story_missing_contract']);
    expect(hard.storiesMissingContract).toEqual([null]);
  });

  it('is actually switched on in the publisher', () => {
    // Risk 3. One edit turns the requirement back into a report; this is what notices.
    const source = publisherSource();
    expect(source).toContain('{ requireContract: true }');
    expect(source).toContain('process.exit(4)');
  });
});

describe('the skeleton the refusal prints', () => {
  it('covers every story that is missing one', () => {
    const skeleton = JSON.parse(renderer().contractSkeleton(['S-001', 'S-007']));
    expect(Object.keys(skeleton.artifacts.by_story).sort()).toEqual(['S-001', 'S-007']);
    expect(skeleton.artifacts.by_story['S-001']).toHaveLength(1);
  });

  it('CANNOT validate if it is pasted unedited', () => {
    // The point of the whole phase. A skeleton that validated on paste would recreate the
    // failure one level up: a declared contract nobody thought about, and a ticket that looks
    // finished again. So the placeholder type is refused BY NAME.
    const skeleton = JSON.parse(renderer().contractSkeleton(['S-001']));
    const result = validateArtifactContract(skeleton.artifacts.by_story['S-001'], { storyId: 'S-001' });
    expect(result.ok).toBe(false);
    expect(result.refusals.map((r) => r.code)).toContain('type_unknown');
  });

  it('offers the real catalog types to choose from, not a list written by hand', () => {
    const skeleton = JSON.parse(renderer().contractSkeleton(['S-001']));
    const offered: string = skeleton.artifacts.by_story['S-001'][0].type;
    // Derived from the catalog, so a type added there appears here with no edit to this test.
    const catalog = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../storyArtifactTypes.json'), 'utf8',
    )) as { types: { type: string }[] };
    expect(catalog.types.length).toBeGreaterThan(5);
    for (const t of catalog.types) expect(offered).toContain(t.type);
  });
});
