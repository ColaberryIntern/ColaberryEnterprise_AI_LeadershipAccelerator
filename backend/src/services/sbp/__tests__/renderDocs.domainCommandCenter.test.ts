/**
 * AF3.9 -- the renderer must write the DOMAIN Command Center, not the SBP one.
 *
 * THE PRODUCTION FAILURE THIS PINS. Quincy Nkwain Ninying reported on 31 Oct 2026 that the six
 * acceptance criteria his portal board showed him never reached his repository: two syncs changed
 * nothing, `progress.json` held an older STORY-000 with five different lines, and
 * `docs/stories/platform.STORY-000.md` did not exist. He was right, and it was all ten domains.
 *
 * AF3.6's backfill wrote `<domain>.STORY-000` into `student_tasks`, which is what the portal
 * renders. `renderDocs` renders from the published plan and asked
 * `plan.stories.some(s => s.id === 'STORY-000')` -- the BARE id. No domain plan contains a
 * STORY-000 of either shape (measured in production 1 Nov 2026: 10 of 10 have the task row, 0 of 10
 * have it in the plan, and all 10 DO have a published plan, so this was never `no_plan`). The test
 * missed, the branch fired, and the Student Build Pipeline's generic FIVE-line Command Center was
 * written into every domain builder's repo: a correct, well-formed file about the wrong assignment.
 *
 * A second sync could not repair it either, because `repoWriter` is content-addressed and the bytes
 * were stable and wrong.
 *
 * Every assertion below fails against the renderer as it stood before this ticket.
 */
import { renderDocs, type CommandCenterOverride } from '../renderDocs';
import { BuildPlan } from '../planContract';
import { COMMAND_CENTER_STORY_ID } from '../commandCenterStory';
import { ProgressFile } from '../verification/progressContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const plan = raw as unknown as BuildPlan;

const CTX = {
  repoUrl: 'https://github.com/qninying/platform-reliability-agent',
  generatedAt: '2026-11-02T00:00:00Z',
  planVersion: 1,
  planSha256: 'af39',
};

const DOMAIN_STORY_ID = 'platform.STORY-000';
const BARE_DOC = `docs/stories/${COMMAND_CENTER_STORY_ID}.md`;
const DOMAIN_DOC = `docs/stories/${DOMAIN_STORY_ID}.md`;
const PROGRESS = '.colaberry/progress.json';
const SNAPSHOT = '.colaberry/agent-domain.json';
const MANIFEST = '.colaberry/manifest.json';

/** The six, abbreviated to their distinguishing clause. The real ones live in the domain module. */
const SIX = [
  'all six panels render and each one names the endpoint it read',
  'it says so in words and is visibly distinct from a panel that is still loading',
  'all ten rungs are present with the owner\'s wording',
  'the reason `no_tool_grants`, not the authority the capability record asks for',
  'nothing on the page states or implies that filing it granted anything',
  'no panel shows a number, a grant, a rung or a result this domain has not actually produced',
];

const override: CommandCenterOverride = {
  storyId: DOMAIN_STORY_ID,
  release: 'autonomy:R0',
  acceptance: [...SIX],
  doc: `# STORY-000 · Build your Command Center\n\n**Story id:** \`${DOMAIN_STORY_ID}\`\n`,
  files: [
    { path: SNAPSHOT, content: '{\n  "schema": "colaberry.agent-domain/v1"\n}\n' },
    { path: BARE_DOC, content: `# STORY-000 -- superseded\n\nRead \`${DOMAIN_DOC}\` instead.\n` },
  ],
};

const render = (ccOverride: CommandCenterOverride | null) =>
  renderDocs(plan, { ...CTX, commandCenterOverride: ccOverride });
const at = (files: ReturnType<typeof renderDocs>, path: string) => files.find((f) => f.path === path);
const progressOf = (files: ReturnType<typeof renderDocs>): ProgressFile =>
  JSON.parse(at(files, PROGRESS)!.content);
const storyIn = (file: ProgressFile, id: string) => file.stories.filter((s) => s.id === id);

describe('AF3.9: with a domain override, the repo gets the domain Command Center', () => {
  const files = render(override);

  it('writes the story doc at the NAMESPACED path', () => {
    expect(at(files, DOMAIN_DOC)).toBeDefined();
    expect(at(files, DOMAIN_DOC)!.content).toContain(DOMAIN_STORY_ID);
  });

  it('seeds the SIX domain criteria into progress.json, not the SBP five', () => {
    const entries = storyIn(progressOf(files), DOMAIN_STORY_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0].criteria.map((c) => c.text)).toEqual(SIX);
    expect(entries[0].release).toBe('autonomy:R0');
  });

  it('leaves every seeded criterion UNTICKED, because that is the progress signal', () => {
    expect(storyIn(progressOf(files), DOMAIN_STORY_ID)[0].criteria.every((c) => !c.passed)).toBe(true);
  });

  it('does NOT seed a bare STORY-000 entry beside it', () => {
    // The bug in one assertion: before the fix this array had one element carrying five criteria
    // about tabs, sample mode and committing `.colaberry` files.
    expect(storyIn(progressOf(files), COMMAND_CENTER_STORY_ID)).toHaveLength(0);
  });

  it('supersedes the wrong bare doc rather than leaving two briefs in one repo', () => {
    // `repoWriter` writes the paths it renders and never deletes, so the stale file has to be
    // overwritten explicitly or it sits beside the real one with nothing to say which is live.
    expect(at(files, BARE_DOC)!.content).toContain('superseded');
    expect(at(files, BARE_DOC)!.content).toContain(DOMAIN_DOC);
  });

  it('emits the committed snapshot a public Command Center reads', () => {
    expect(at(files, SNAPSHOT)).toBeDefined();
  });

  it('declares every override file in the manifest, so prompt assembly may cite them', () => {
    const declared = JSON.parse(at(files, MANIFEST)!.content).files.map((f: { path: string }) => f.path);
    expect(declared).toContain(DOMAIN_DOC);
    expect(declared).toContain(SNAPSHOT);
    expect(declared).toContain(BARE_DOC);
  });

  it('renders byte-identically twice, whatever order the override files arrive in', () => {
    // FR-026: unchanged implies no commit. An unsorted splice here would churn the builder's
    // history with commits that change nothing.
    const reversed: CommandCenterOverride = { ...override, files: [...override.files!].reverse() };
    expect(render(reversed)).toEqual(render(override));
  });
});

describe('AF3.9: without an override, nothing about an ordinary build changes', () => {
  const files = render(null);

  it('still writes the SBP Command Center at the bare path', () => {
    expect(at(files, BARE_DOC)).toBeDefined();
    expect(at(files, BARE_DOC)!.content).not.toContain('superseded');
  });

  it('still seeds a bare STORY-000 entry', () => {
    expect(storyIn(progressOf(files), COMMAND_CENTER_STORY_ID)).toHaveLength(1);
  });

  it('writes no namespaced doc and no snapshot', () => {
    expect(at(files, DOMAIN_DOC)).toBeUndefined();
    expect(at(files, SNAPSHOT)).toBeUndefined();
  });
});

describe('AF3.9: a plan that carries its own Command Center still wins', () => {
  it('does not inject when the plan already contains the override id', () => {
    const planWithIt = {
      ...plan,
      stories: [...plan.stories, { ...plan.stories[0], id: DOMAIN_STORY_ID }],
    } as unknown as BuildPlan;
    const files = renderDocs(planWithIt, { ...CTX, commandCenterOverride: override });
    // One doc, from the plan's own story, and exactly one progress entry -- not two.
    expect(storyIn(progressOf(files), DOMAIN_STORY_ID)).toHaveLength(1);
    expect(at(files, DOMAIN_DOC)!.content).not.toContain('**Story id:**');
  });
});

describe('AF3.9: the allowlist still governs an override', () => {
  it('refuses a path outside the platform write allowlist', () => {
    const escaping: CommandCenterOverride = {
      ...override,
      files: [{ path: 'src/index.ts', content: 'owned by the builder' }],
    };
    expect(() => render(escaping)).toThrow(/allowlist/);
  });
});
