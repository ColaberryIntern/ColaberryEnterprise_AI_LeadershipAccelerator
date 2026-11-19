/**
 * The builder's entry point: the per-stage instructions, in their repository.
 *
 * ## The rule this file exists to hold
 *
 * **It never asks a builder what they do by hand.** Ali's correction, 17 Nov 2026: they do not
 * hold the job, and a list built from guesses about somebody else's week is how the first attempt
 * at this went wrong. The emitted body is swept for every question form that would break it.
 *
 * ## And the path that would have broken document sync
 *
 * An earlier plan cycle emitted `.claude/skills/capability/SKILL.md`. `PATH_ALLOWLIST` in
 * `renderDocs.ts` is `[CLAUDE.md, docs/, .colaberry/, artifacts/]` and `renderDocs` **throws** on
 * an unlisted path, so that would have broken document sync for all seven builders on the first
 * run after deploy. Every emitted path is asserted to be inside `docs/`, with a positive control
 * that the allowlist really does refuse the path cycle 2 chose.
 */

import fs from 'fs';
import path from 'path';
import { BUILDER_STAGES } from '../builderPath';
import { AUTONOMY_LEVELS, AUTONOMY_MEANINGS } from '../autonomyLadder';
import { GATE_SIZE_BY_RUNG } from '../builderPath';
import { CANDIDATE_STAGES } from '../candidateStages';
import {
  CANDIDATE_SOURCE_GUIDE,
  CAPABILITY_SKILL_PATH,
  CAPABILITY_SKILL_PATHS,
  capabilitySkillBody,
  capabilitySkillFiles,
} from '../capabilitySkill';
import { isAllowedPath, renderDocs } from '../../sbp/renderDocs';
import type { BuildPlan } from '../../sbp/planContract';

const SOURCE = path.join(__dirname, '..', 'capabilitySkill.ts');
const body = capabilitySkillBody();

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

describe('it never asks a builder what they do by hand', () => {
  it.each([
    [/what do you do/i, 'what do you do'],
    [/by hand\?/i, 'by hand?'],
    [/manually today/i, 'manually today'],
    [/what.{0,30}do you.{0,20}manually/i, 'what do you ... manually'],
    [/tell us what/i, 'tell us what'],
  ])('contains no "%s" question', (rx) => {
    expect(body).not.toMatch(rx as RegExp);
  });

  it('says the opposite, in words', () => {
    expect(body).toMatch(/not\*\* being asked what you do by hand/);
    expect(body).toMatch(/You do not hold this job/);
  });

  it('POSITIVE CONTROL: the sweep would catch the phrasing if it were there', () => {
    // Without this, the five assertions above could be passing over regexes that match nothing.
    const bad = 'So: what do you do by hand? Tell us what you do manually today.';
    expect(bad).toMatch(/what do you do/i);
    expect(bad).toMatch(/by hand\?/i);
    expect(bad).toMatch(/manually today/i);
  });
});

describe('it names all four sources, each one individually', () => {
  it('has exactly four, with distinct keys', () => {
    expect(CANDIDATE_SOURCE_GUIDE).toHaveLength(4);
    expect(CANDIDATE_SOURCE_GUIDE.map((s) => s.key).sort())
      .toEqual(['manager', 'owner', 'research', 'suggested']);
  });

  it.each([...CANDIDATE_SOURCE_GUIDE])('names %s in the body with its weight', (s) => {
    expect(body).toContain(s.label);
    expect(body).toContain(`\`${s.key}\``);
    expect(body).toContain(s.weight);
  });

  it('says what each source is WORTH, not just that it exists', () => {
    for (const s of CANDIDATE_SOURCE_GUIDE) {
      expect(s.weight.length).toBeGreaterThan(60);
    }
    // The manager is called the most reliable signal, which is the whole point of labelling them.
    const manager = CANDIDATE_SOURCE_GUIDE.find((s) => s.key === 'manager')!;
    expect(manager.weight).toMatch(/most reliable/);
  });

  it('says four run in parallel, so nobody waits on Ali', () => {
    expect(body).toMatch(/Four at a time, in parallel/);
  });
});

describe('one prompt per stage, and every prompt names its artifact', () => {
  it('emits exactly one section per stage, counted', () => {
    const headings = [...body.matchAll(/^## Stage (\d+) of (\d+): /gm)];
    expect(headings).toHaveLength(BUILDER_STAGES.length);
    expect(headings.map((m) => Number(m[1]))).toEqual(
      BUILDER_STAGES.map((_s, i) => i + 1),
    );
    for (const m of headings) expect(Number(m[2])).toBe(BUILDER_STAGES.length);
  });

  it.each([...BUILDER_STAGES])('the $stage prompt names its stage key, title and artifact', (s) => {
    expect(body).toContain(`**Stage key:** \`${s.stage}\``);
    expect(body).toContain(s.title);
    expect(body).toContain(`**Produces:** \`${s.artifact_path}\``);
    expect(body).toContain(s.meaning);
    expect(body).toContain(s.artifact_is_done_when);
  });

  it('covers every stage in the enum, with no extra and none missing', () => {
    for (const stage of CANDIDATE_STAGES) {
      expect(body).toContain(`\`${stage}\``);
    }
    // And the switch is total: a stage with no case throws by name rather than emitting a blank.
    const src = fs.readFileSync(SOURCE, 'utf8');
    for (const stage of CANDIDATE_STAGES) {
      expect(src).toContain(`case '${stage}':`);
    }
    expect(src).toContain('CapabilitySkillMissingStage');
  });

  it('every prompt has real instructions, not a label', () => {
    const sections = body.split(/^## Stage \d+ of \d+: /m).slice(1);
    expect(sections).toHaveLength(BUILDER_STAGES.length);
    for (const s of sections) {
      expect(s).toContain('### What to do');
      expect(s).toContain('### Done when');
      expect(s.length).toBeGreaterThan(400);
    }
  });

  it('the one stage with no board row says why, rather than omitting it', () => {
    expect(body).toMatch(/\*\*Board row:\*\* none, deliberately/);
    expect(body).toMatch(/a task telling you to wait/);
  });

  it('the two owner stages tell the builder to start another candidate', () => {
    const owners = BUILDER_STAGES.filter((s) => s.owned_by === 'owner');
    expect(owners).toHaveLength(2);
    expect([...body.matchAll(/not yours to clear/g)]).toHaveLength(owners.length);
  });

  it('names the gate size for every rung, read from the import not retyped', () => {
    // The first draft of this test imported `GATE_SIZE_BY_RUNG` from `autonomyLadder`, where it
    // does not exist, and compared the table against `undefined`. The gate table lives in
    // `builderPath.ts` and only there.
    for (const r of AUTONOMY_LEVELS) {
      expect(body).toContain(`| \`${r}\` | ${AUTONOMY_MEANINGS[r]} | ${GATE_SIZE_BY_RUNG[r]} |`);
    }
    // And the row count matches the ladder, so a rung cannot be silently missing from the table.
    expect([...body.matchAll(/^\| `R\d` \| /gm)]).toHaveLength(AUTONOMY_LEVELS.length);
  });
});

describe('every emitted path is inside docs/', () => {
  it('the declared path list is all docs/', () => {
    expect(CAPABILITY_SKILL_PATHS.length).toBeGreaterThan(0);
    for (const p of CAPABILITY_SKILL_PATHS) expect(p.startsWith('docs/')).toBe(true);
  });

  it('what it actually emits is all docs/, so a later edit cannot reintroduce .claude/', () => {
    for (const f of capabilitySkillFiles()) {
      expect(f.path.startsWith('docs/')).toBe(true);
      expect(f.path).not.toMatch(/^\.claude\//);
    }
  });

  it('the path is allowlisted and renderDocs does not throw', () => {
    expect(isAllowedPath(CAPABILITY_SKILL_PATH)).toBe(true);
    expect(() => renderDocs(plan())).not.toThrow();
  });

  it('POSITIVE CONTROL: the allowlist refuses the path an earlier cycle chose', () => {
    expect(isAllowedPath('.claude/skills/capability/SKILL.md')).toBe(false);
  });

  it('renderDocs() output contains the file, which is what proves it reaches a repo', () => {
    const found = renderDocs(plan()).find((f) => f.path === CAPABILITY_SKILL_PATH);
    expect(found).toBeDefined();
    expect(String(found?.content)).toContain('# `/capability`');
  });

  it('the source names no .claude path at all, outside its own warning', () => {
    const code = fs.readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.claude\//);
  });
});

describe('it is honest about not being an installed command', () => {
  it('says so in the body rather than implying a slash command exists', () => {
    expect(body).toMatch(/It is a document, not an installed command/);
    expect(body).toMatch(/cannot register a slash command/);
  });

  it('points at the README for installing it locally', () => {
    expect(body).toContain('docs/agent/README.md');
  });
});

describe('it is deterministic and carries no clock', () => {
  it('two calls return identical bytes', () => {
    expect(capabilitySkillBody()).toBe(capabilitySkillBody());
    expect(JSON.stringify(capabilitySkillFiles())).toBe(JSON.stringify(capabilitySkillFiles()));
  });

  it('no date anywhere in the output, and no clock in the module', () => {
    expect(body).not.toMatch(/20\d\d-\d\d-\d\d/);
    const src = fs.readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/new Date|Date\.now|Math\.random/);
  });
});
