/**
 * renderDocs — graded against the real pilot plan, because these are the files
 * a student's Claude Code session actually opens. If a story prompt names
 * `docs/stories/STORY-003.md`, this is what has to put it there.
 */
import { renderDocs, isAllowedPath, manifestPaths, RenderError } from '../renderDocs';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const CTX = { repoUrl: 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63', generatedAt: '2026-08-10T00:00:00Z', planVersion: 1, planSha256: 'abc123' };

const render = (plan: BuildPlan = pilot, ctx = CTX) => renderDocs(plan, ctx);
const pathsOf = (plan: BuildPlan = pilot) => render(plan).map((f) => f.path);
const fileAt = (path: string, plan: BuildPlan = pilot) => render(plan).find((f) => f.path === path)!;

describe('the file set', () => {
  it('renders every document the prompts reference', () => {
    const paths = pathsOf();
    for (const p of ['docs/REQUIREMENTS.md', 'docs/STORIES.md', 'docs/TRACEABILITY.md', 'CLAUDE.md']) {
      expect(paths).toContain(p);
    }
  });

  it('renders exactly one story file per story', () => {
    const storyFiles = pathsOf().filter((p) => p.startsWith('docs/stories/'));
    expect(storyFiles).toHaveLength(pilot.stories.length);
    for (const s of pilot.stories) expect(storyFiles).toContain(`docs/stories/${s.id}.md`);
  });

  it('renders the machine-readable bookkeeping', () => {
    const paths = pathsOf();
    for (const p of ['.colaberry/plan.json', '.colaberry/manifest.json', '.colaberry/progress.json']) {
      expect(paths).toContain(p);
    }
  });

  it('refuses a plan with no stories rather than writing empty docs', () => {
    expect(() => renderDocs({ ...pilot, stories: [] })).toThrow(RenderError);
  });
});

describe('the write allowlist (FR-027)', () => {
  it('emits nothing outside CLAUDE.md, docs/** and .colaberry/**', () => {
    for (const p of pathsOf()) expect(isAllowedPath(p)).toBe(true);
  });

  it.each([
    ['src/index.ts', false],
    ['package.json', false],
    ['.github/workflows/ci.yml', false],
    ['../escape.md', false],
    ['CLAUDE.md', true],
    ['docs/REQUIREMENTS.md', true],
    ['.colaberry/manifest.json', true],
  ])('isAllowedPath(%p) === %p', (path, allowed) => {
    expect(isAllowedPath(path as string)).toBe(allowed);
  });
});

describe('determinism — an unchanged plan must produce no diff', () => {
  it('is byte-identical across two renders', () => {
    expect(JSON.stringify(render())).toBe(JSON.stringify(render()));
  });

  it('does not depend on the input array order', () => {
    const shuffled: BuildPlan = {
      ...pilot,
      stories: [...pilot.stories].reverse(),
      requirements: [...pilot.requirements].reverse(),
      releases: [...pilot.releases].reverse(),
    };
    expect(JSON.stringify(render(shuffled))).toBe(JSON.stringify(render()));
  });

  it('does not read a clock — the timestamp is supplied, not sampled', () => {
    const a = renderDocs(pilot, { ...CTX, generatedAt: '2020-01-01T00:00:00Z' });
    const b = renderDocs(pilot, { ...CTX, generatedAt: '2020-01-01T00:00:00Z' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not mutate the plan it was given', () => {
    const snapshot = JSON.stringify(pilot);
    render();
    expect(JSON.stringify(pilot)).toBe(snapshot);
  });
});

describe('story files — what the student and the agent read', () => {
  const story = pilot.stories[0];
  const doc = () => fileAt(`docs/stories/${story.id}.md`).content;

  it('carries the narrative, guidance and failure paths', () => {
    expect(doc()).toContain(story.narrative);
    expect(doc()).toContain(story.task_guidance);
    for (const f of story.failure_paths ?? []) expect(doc()).toContain(f);
  });

  it('quotes the requirement statement verbatim, not just its id', () => {
    const req = pilot.requirements.find((r) => r.id === story.fulfills[0])!;
    expect(doc()).toContain(req.statement);
  });

  // The progress signal: SBP-GH-v1 §8 reads these boxes to decide "done".
  it('renders acceptance as UNTICKED checkboxes', () => {
    for (const a of story.acceptance ?? []) expect(doc()).toContain(`- [ ] ${a}`);
    expect(doc()).not.toContain('- [x]');
  });

  it('states the gating explicitly, including when there is none', () => {
    expect(doc()).toMatch(/\*\*Blocked by:\*\*/);
  });
});

describe('requirements and traceability', () => {
  it('lists every requirement with its statement', () => {
    const doc = fileAt('docs/REQUIREMENTS.md').content;
    for (const r of pilot.requirements) {
      expect(doc).toContain(r.id);
      expect(doc).toContain(r.statement);
    }
  });

  it('gives every requirement a row in the traceability matrix', () => {
    const doc = fileAt('docs/TRACEABILITY.md').content;
    for (const r of pilot.requirements) expect(doc).toContain(`| ${r.id} |`);
  });

  it('flags must-haves that no story covers', () => {
    const gapped: BuildPlan = {
      ...pilot,
      requirements: [...pilot.requirements, { id: 'REQ-999', statement: 'Uncovered.', kind: 'FUNC', priority: 'must', cluster: 'X' }],
    };
    expect(fileAt('docs/TRACEABILITY.md', gapped).content).toContain('REQ-999');
    expect(fileAt('docs/TRACEABILITY.md', gapped).content).toMatch(/⚠️.*no story/);
  });

  it('does not treat an unfulfilled CONSTRAINT as a gap', () => {
    const withConstraint: BuildPlan = {
      ...pilot,
      requirements: [...pilot.requirements, { id: 'REQ-998', statement: 'Must use PaySimple.', kind: 'CONSTRAINT', priority: 'must', cluster: 'X' }],
    };
    const doc = fileAt('docs/TRACEABILITY.md', withConstraint).content;
    expect(doc).toContain('_(constraint — no story)_');
    expect(doc).not.toContain('REQ-998, ');
  });
});

describe('CLAUDE.md — the conventions the agent inherits', () => {
  const doc = () => fileAt('CLAUDE.md').content;

  it('points at the requirement documents', () => {
    for (const p of ['docs/REQUIREMENTS.md', 'docs/STORIES.md', 'docs/TRACEABILITY.md']) {
      expect(doc()).toContain(p);
    }
  });

  it('teaches the commit convention the progress signal depends on', () => {
    expect(doc()).toMatch(/STORY-001: /);
    expect(doc()).toMatch(/commit message names the story/i);
  });

  it('states the non-negotiables: timeouts, idempotency, no swallowed errors', () => {
    expect(doc()).toMatch(/timeout/i);
    expect(doc()).toMatch(/idempotent/i);
    expect(doc()).toMatch(/catch/i);
  });

  it('includes the repo URL when there is one, and omits the section when there is not', () => {
    expect(doc()).toContain(CTX.repoUrl);
    expect(renderDocs(pilot, {}).find((f) => f.path === 'CLAUDE.md')!.content).not.toContain('## This repo');
  });
});

describe('the manifest — what prompt assembly will check against (FR-032)', () => {
  it('lists every rendered file with a hash', () => {
    const files = render();
    const listed = manifestPaths(files);
    // The manifest describes the files rendered before it; it cannot list itself.
    for (const f of files) {
      if (f.path === '.colaberry/manifest.json') continue;
      expect(listed).toContain(f.path);
    }
  });

  it('includes every story path a prompt could reference', () => {
    const listed = manifestPaths(render());
    for (const s of pilot.stories) expect(listed).toContain(`docs/stories/${s.id}.md`);
  });

  it('hashes change when content changes, so conflict detection has something to compare', () => {
    const a = JSON.parse(fileAt('.colaberry/manifest.json').content);
    const altered: BuildPlan = { ...pilot, descriptor: 'Something else entirely' };
    const b = JSON.parse(fileAt('.colaberry/manifest.json', altered).content);
    const reqA = a.files.find((f: any) => f.path === 'docs/REQUIREMENTS.md').sha256;
    const reqB = b.files.find((f: any) => f.path === 'docs/REQUIREMENTS.md').sha256;
    expect(reqA).not.toBe(reqB);
  });

  it('carries the plan version and hash so a repo can be traced back to a plan', () => {
    const m = JSON.parse(fileAt('.colaberry/manifest.json').content);
    expect(m.plan_version).toBe(1);
    expect(m.plan_sha256).toBe('abc123');
  });
});
