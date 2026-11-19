/**
 * The builder path's two constants, and the two ways they can silently go wrong.
 *
 * **1. The name collision.** `AUTONOMY_LEVELS` is defined three times in this tree: the ten-rung
 * ladder in `agentDomain/autonomyLadder.ts`, a four-value one in
 * `workforce/agentReactivationService.ts`, and another four-value one in `types/inboxCase.ts`.
 * Importing the wrong one produces a four-key gate table that a naive `toHaveLength` would not
 * catch, because the table would still match the list it was built from. So the test asserts the
 * IMPORT PATH by reading the module's own source, not just the resulting key count.
 *
 * **2. Two lists that are supposed to match.** `BUILDER_STAGES` and `CANDIDATE_STAGES` live in
 * different files and must stay one-to-one. That is exactly the pair that drifts, so the test
 * compares them rather than trusting the comment that says they agree.
 */

import fs from 'fs';
import path from 'path';
import { AUTONOMY_LEVELS } from '../autonomyLadder';
import { CANDIDATE_STAGES } from '../candidateStages';
import {
  BUILDER_STAGES,
  BUILDER_STAGE_KEYS,
  GATE_SIZE_BY_RUNG,
  artifactPathFor,
  gateSizeForRung,
  stageFor,
} from '../builderPath';

const SOURCE = path.join(__dirname, '..', 'builderPath.ts');
const source = (): string => fs.readFileSync(SOURCE, 'utf8');

describe('GATE_SIZE_BY_RUNG — option C', () => {
  it('has a key for every rung, iterated from the import rather than counted', () => {
    for (const rung of AUTONOMY_LEVELS) {
      expect(GATE_SIZE_BY_RUNG).toHaveProperty(rung);
      expect(typeof GATE_SIZE_BY_RUNG[rung]).toBe('number');
    }
    expect(Object.keys(GATE_SIZE_BY_RUNG).sort()).toEqual([...AUTONOMY_LEVELS].sort());
  });

  it('imports AUTONOMY_LEVELS from ./autonomyLadder, not from either namesake', () => {
    // Comments stripped first. The module's own header NAMES the two namesakes, to record why
    // this test exists — and a sweep over the raw file would read that warning as the mistake it
    // warns about. Prose about a thing is not the thing, which is the lesson
    // `bootSchemaCreatable.test.ts` records against an earlier draft of itself.
    const code = source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/import\s*\{[^}]*AUTONOMY_LEVELS[^}]*\}\s*from\s*'\.\/autonomyLadder'/);
    expect(code).not.toMatch(/agentReactivationService/);
    expect(code).not.toMatch(/inboxCase/);
    expect(code).not.toMatch(/from\s*'[^']*workforce[^']*'/);
  });

  it('the ladder it keys off really is the ten-rung one', () => {
    // If a future edit swaps the import for a four-value namesake, the assertion above fails
    // first; this one states the fact that makes the gate table meaningful at all.
    expect(AUTONOMY_LEVELS).toHaveLength(10);
    expect(AUTONOMY_LEVELS[0]).toBe('R0');
    expect(AUTONOMY_LEVELS[9]).toBe('R9');
  });

  it('every gate size is a whole number of at least 1', () => {
    for (const rung of AUTONOMY_LEVELS) {
      const n = GATE_SIZE_BY_RUNG[rung];
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });

  it('is non-decreasing across the rungs, asserted pairwise', () => {
    for (let i = 1; i < AUTONOMY_LEVELS.length; i += 1) {
      const prev = GATE_SIZE_BY_RUNG[AUTONOMY_LEVELS[i - 1]];
      const here = GATE_SIZE_BY_RUNG[AUTONOMY_LEVELS[i]];
      expect(here).toBeGreaterThanOrEqual(prev);
    }
  });

  it('actually RISES, so option C is not a constant wearing a table', () => {
    const sizes = AUTONOMY_LEVELS.map((r) => GATE_SIZE_BY_RUNG[r]);
    expect(new Set(sizes).size).toBeGreaterThan(1);
    expect(sizes[sizes.length - 1]).toBeGreaterThan(sizes[0]);
  });

  it('gateSizeForRung returns the table value', () => {
    for (const rung of AUTONOMY_LEVELS) {
      expect(gateSizeForRung(rung)).toBe(GATE_SIZE_BY_RUNG[rung]);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(GATE_SIZE_BY_RUNG)).toBe(true);
  });
});

describe('BUILDER_STAGES', () => {
  it('has exactly one entry per candidate stage, in the same order', () => {
    expect(BUILDER_STAGE_KEYS).toEqual([...CANDIDATE_STAGES]);
  });

  it('has no duplicate stage', () => {
    expect(new Set(BUILDER_STAGE_KEYS).size).toBe(BUILDER_STAGES.length);
  });

  it('every stage names a non-empty artifact path', () => {
    for (const s of BUILDER_STAGES) {
      expect(typeof s.artifact_path).toBe('string');
      expect(s.artifact_path.trim().length).toBeGreaterThan(0);
    }
  });

  it('every artifact path is inside a PATH_ALLOWLIST root, or a builder repo will reject it', () => {
    // `renderDocs.ts` allows CLAUDE.md, docs/, .colaberry/ and artifacts/ and THROWS on anything
    // else. A stage that named `.claude/skills/...` would look fine here and break document sync
    // for every builder on the first run after deploy.
    for (const s of BUILDER_STAGES) {
      expect(s.artifact_path).toMatch(/^(CLAUDE\.md$|docs\/|\.colaberry\/|artifacts\/)/);
    }
  });

  it('every artifact path carries the {slug} placeholder exactly once', () => {
    for (const s of BUILDER_STAGES) {
      expect(s.artifact_path.split('{slug}')).toHaveLength(2);
    }
  });

  it('every artifact path is unique, so two stages cannot overwrite each other', () => {
    const paths = BUILDER_STAGES.map((s) => s.artifact_path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every stage says when its artifact is done, in a sentence not a word', () => {
    for (const s of BUILDER_STAGES) {
      expect(s.artifact_is_done_when.trim().length).toBeGreaterThan(30);
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.meaning.trim().length).toBeGreaterThan(20);
    }
  });

  it('every stage is owned by exactly one side', () => {
    for (const s of BUILDER_STAGES) {
      expect(['builder', 'owner']).toContain(s.owned_by);
    }
  });

  it('the two waiting stages are the owner\'s, and they are the only ones', () => {
    const owned = BUILDER_STAGES.filter((s) => s.owned_by === 'owner').map((s) => s.stage);
    expect(owned).toEqual(['platform_owed', 'tool_requested']);
  });

  it('NEVER asks a builder what they do by hand, which is the correction this path exists for', () => {
    const prose = BUILDER_STAGES
      .map((s) => `${s.title} ${s.meaning} ${s.artifact_is_done_when}`)
      .join(' ');
    expect(prose).not.toMatch(/what do you do/i);
    expect(prose).not.toMatch(/by hand\?/i);
    expect(prose).not.toMatch(/what.{0,20}manually/i);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(BUILDER_STAGES)).toBe(true);
  });
});

describe('the helpers', () => {
  it('stageFor resolves every candidate stage', () => {
    for (const s of CANDIDATE_STAGES) {
      expect(stageFor(s).stage).toBe(s);
    }
  });

  it('stageFor throws by name on a stage that does not exist', () => {
    expect(() => stageFor('invented' as never)).toThrow(/BuilderPathStageMissing: invented/);
  });

  it('artifactPathFor substitutes the slug and leaves no placeholder behind', () => {
    for (const s of CANDIDATE_STAGES) {
      const p = artifactPathFor(s, 'weekly-intake-summary');
      expect(p).toContain('weekly-intake-summary');
      expect(p).not.toContain('{slug}');
    }
  });

  it('artifactPathFor is deterministic', () => {
    expect(artifactPathFor('proven_by_hand', 'x')).toBe(artifactPathFor('proven_by_hand', 'x'));
  });
});
