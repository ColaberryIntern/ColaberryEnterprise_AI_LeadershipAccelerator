/**
 * The checklist that cannot be talked into ticking itself, and the proof it reaches a repository.
 *
 * ## The two things worth testing here
 *
 * **1. A tick comes from a file being there.** There is no boolean parameter, and a test reads the
 * module's own source to assert that. The moment a caller can pass `done: true`, the checklist
 * stops being evidence and becomes a second place to record a claim — which is the whole failure
 * the old board measured: 853 tasks above R0 with zero completions, because nothing it asked for
 * left a trace.
 *
 * **2. It actually reaches a repository.** `renderDocs()` is the repo-write path;
 * `buildDocsBundle` is the zip download and holds no file list of its own. An earlier plan cycle
 * named the bundle, which would have shipped the file to the download and to no repository at all.
 * So the assertion is made on `renderDocs` itself.
 */

import fs from 'fs';
import path from 'path';
import { BUILDER_STAGES } from '../builderPath';
import { AUTONOMY_LEVELS } from '../autonomyLadder';
import { GATE_SIZE_BY_RUNG } from '../builderPath';
import {
  BUILDER_PATH_CHECKLIST_PATH,
  builderPathChecklist,
  checklistRows,
} from '../builderPathChecklist';
import { isAllowedPath, renderDocs } from '../../sbp/renderDocs';
import { ownershipOf, isSafeToOverwrite } from '../../sbp/fileOwnership';
import type { BuildPlan } from '../../sbp/planContract';

const SOURCE = path.join(__dirname, '..', 'builderPathChecklist.ts');

/** The artifact path for each stage with a real slug substituted. */
const present = (slug: string) =>
  BUILDER_STAGES.map((s) => s.artifact_path.replace('{slug}', slug));

/** The smallest plan `renderDocs` will accept: it throws on a plan with no stories. */
function plan(): BuildPlan {
  return {
    project: { name: 'Test', slug: 'test' },
    requirements: [{ id: 'R1', title: 'A requirement', description: 'd' }],
    releases: [{ key: 'r0', name: 'R0', position: 0 }],
    stories: [{
      id: 'STORY-001',
      title: 'A story',
      release: 'r0',
      narrative: 'n',
      acceptance: ['a'],
      fulfills: ['R1'],
    }],
  } as unknown as BuildPlan;
}

describe('a tick comes from a file being there', () => {
  it('a stage whose artifact is ABSENT renders not done', () => {
    const rows = checklistRows([]);
    expect(rows).toHaveLength(BUILDER_STAGES.length);
    for (const r of rows) {
      expect(r.mark).toBe('not_done');
      expect(r.evidence).toEqual([]);
    }
  });

  it('a stage whose artifact is PRESENT renders done, with the path as its evidence', () => {
    const rows = checklistRows(present('weekly-intake-summary'));
    for (const r of rows) {
      expect(r.mark).toBe('done');
      expect(r.evidence).toHaveLength(1);
      expect(r.evidence[0]).toContain('weekly-intake-summary');
    }
  });

  it('one present artifact ticks exactly ONE stage, not the neighbours', () => {
    const only = BUILDER_STAGES[4].artifact_path.replace('{slug}', 'x');
    const rows = checklistRows([only]);
    const done = rows.filter((r) => r.mark === 'done');
    expect(done).toHaveLength(1);
    expect(done[0].stage).toBe(BUILDER_STAGES[4].stage);
  });

  it('an artifact in the WRONG PLACE ticks nothing', () => {
    // `{slug}` stands for ONE path segment. A looser match would let a file nested somewhere else
    // satisfy a stage, which is how a checklist starts lying politely.
    const nested = BUILDER_STAGES[4].artifact_path.replace('{slug}', 'x/notes');
    expect(checklistRows([nested]).filter((r) => r.mark === 'done')).toEqual([]);
  });

  it('an unknown extra path ticks nothing', () => {
    const rows = checklistRows(['README.md', 'docs/SOMETHING.md', 'artifacts/other/thing.md']);
    expect(rows.filter((r) => r.mark === 'done')).toEqual([]);
  });

  it('a path that merely CONTAINS the pattern ticks nothing, because the match is anchored', () => {
    const p = BUILDER_STAGES[0].artifact_path.replace('{slug}', 'x');
    expect(checklistRows([`prefix/${p}`]).filter((r) => r.mark === 'done')).toEqual([]);
    expect(checklistRows([`${p}.bak`]).filter((r) => r.mark === 'done')).toEqual([]);
  });
});

describe('there is no boolean parameter, and there never will be', () => {
  /**
   * MUTATION PROOF, by hand: adding `done?: boolean` to either exported signature turns this red.
   * The point is not style — a boolean here is a caller-supplied tick, which is the one thing a
   * checklist built as evidence must not accept.
   */
  it('neither exported function takes a boolean', () => {
    const src = fs.readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const signatures = [...src.matchAll(/export function (\w+)\(([\s\S]*?)\):/g)];
    expect(signatures.length).toBeGreaterThanOrEqual(2);
    for (const [, name, params] of signatures) {
      expect({ name, hasBoolean: /boolean/.test(params) }).toEqual({ name, hasBoolean: false });
    }
  });

  it('the word boolean appears nowhere in the module\'s code', () => {
    const src = fs.readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bboolean\b/);
  });
});

describe('absent is not zero', () => {
  it('null renders every stage as NOT RECORDED, never as not done', () => {
    const rows = checklistRows(null);
    expect(rows.map((r) => r.mark)).toEqual(BUILDER_STAGES.map(() => 'not_recorded'));
  });

  it('the file says so in words, and uses a mark that is not an empty box', () => {
    const md = builderPathChecklist(null);
    expect(md).toMatch(/did not supply a file list/);
    expect(md).toMatch(/NOT a statement/);
    expect(md).toContain('[?]');
    expect(md).not.toContain('[x]');
  });

  it('an EMPTY repository is a different answer from an unknown one', () => {
    expect(builderPathChecklist([])).not.toBe(builderPathChecklist(null));
    expect(builderPathChecklist([])).toContain('0 of 8 stages have an artifact');
  });

  it('a full repository counts them', () => {
    expect(builderPathChecklist(present('x'))).toContain('8 of 8 stages have an artifact');
  });
});

describe('every stage appears exactly once, and the output is deterministic', () => {
  it('one row per stage, in BUILDER_STAGES order', () => {
    expect(checklistRows([]).map((r) => r.stage)).toEqual(BUILDER_STAGES.map((s) => s.stage));
  });

  it('every stage appears exactly once in the rendered table', () => {
    const md = builderPathChecklist(present('x'));
    for (const s of BUILDER_STAGES) {
      const rows = [...md.matchAll(new RegExp(`\\| \\[x\\] \\|[^|]*\\(\`${s.stage}\`\\)`, 'g'))];
      expect({ stage: s.stage, rows: rows.length }).toEqual({ stage: s.stage, rows: 1 });
    }
  });

  it('is deterministic for a SHUFFLED input list', () => {
    const paths = present('x');
    const shuffled = [...paths].reverse();
    expect(builderPathChecklist(shuffled)).toBe(builderPathChecklist(paths));
    // And the evidence inside each row is sorted, so two orders cannot differ in the bytes.
    expect(checklistRows(shuffled)).toEqual(checklistRows(paths));
  });

  it('carries no clock, so a sync cannot commit a file whose only change is the time', () => {
    expect(builderPathChecklist(present('x'))).not.toMatch(/20\d\d-\d\d-\d\d/);
    const src = fs.readFileSync(SOURCE, 'utf8');
    expect(src).not.toMatch(/new Date|Date\.now|toISOString/);
  });

  it('names the gate size for every rung, from the import', () => {
    const md = builderPathChecklist([]);
    for (const r of AUTONOMY_LEVELS) {
      expect(md).toContain(`| \`${r}\` | ${GATE_SIZE_BY_RUNG[r]} |`);
    }
  });

  it('names the two stages that are not the builder\'s', () => {
    const md = builderPathChecklist([]);
    expect(md).toMatch(/## Two stages are not yours/);
    for (const s of BUILDER_STAGES.filter((x) => x.owned_by === 'owner')) {
      expect(md).toContain(s.title);
    }
  });

  it('never asks the builder what they do by hand', () => {
    const md = builderPathChecklist([]);
    expect(md).toMatch(/never asked what you do by hand/);
    expect(md).not.toMatch(/what do you do/i);
  });
});

describe('it reaches a REPOSITORY, not only a download', () => {
  it('renderDocs() output contains the file', () => {
    // Asserted on `renderDocs` itself, which is the repo-write path. `buildDocsBundle` takes this
    // function's output and adds a notice, so proving it here proves both surfaces.
    const files = renderDocs(plan());
    const found = files.find((f) => f.path === BUILDER_PATH_CHECKLIST_PATH);
    expect(found).toBeDefined();
    expect(String(found?.content)).toContain('# Your capability path');
  });

  it('renderDocs does not throw, and the path is allowlisted', () => {
    expect(isAllowedPath(BUILDER_PATH_CHECKLIST_PATH)).toBe(true);
    expect(() => renderDocs(plan())).not.toThrow();
  });

  it('POSITIVE CONTROL: the allowlist really does refuse something', () => {
    // Without this, `isAllowedPath` returning true could mean it returns true for everything —
    // and the path an earlier plan cycle chose is exactly the one that would have thrown.
    expect(isAllowedPath('.claude/skills/capability/SKILL.md')).toBe(false);
  });

  it('the checklist in the rendered file reflects the paths it was given', () => {
    const withArtifacts = renderDocs(plan(), { existingRepoPaths: present('x') });
    const file = withArtifacts.find((f) => f.path === BUILDER_PATH_CHECKLIST_PATH);
    expect(String(file?.content)).toContain('8 of 8 stages have an artifact');

    const without = renderDocs(plan());
    const file2 = without.find((f) => f.path === BUILDER_PATH_CHECKLIST_PATH);
    expect(String(file2?.content)).toMatch(/did not supply a file list/);
  });

  it('is PLATFORM-owned by default, which is what makes it overwrite-safe', () => {
    // The polarity is the opposite of the obvious guess: `ownershipOf` DEFAULTS to `platform` for
    // an unlisted path, so adding this file to the OWNERSHIP map is what would make it unsafe.
    // Pinned rather than trusted, because an earlier plan cycle had it exactly backwards.
    expect(ownershipOf(BUILDER_PATH_CHECKLIST_PATH)).toBe('platform');
    expect(isSafeToOverwrite(BUILDER_PATH_CHECKLIST_PATH)).toBe(true);
  });

  it('POSITIVE CONTROL: a student-owned path is NOT overwrite-safe', () => {
    expect(isSafeToOverwrite('.claude/agents/mine.md')).toBe(false);
  });
});
