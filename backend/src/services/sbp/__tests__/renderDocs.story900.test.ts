/**
 * STORY-900 wired into the spine, asserted in BOTH directions.
 *
 * The direction people remember is "with the flag on, the demo appears". The direction that
 * actually protects anybody is the other one: with the flag OFF, every one of these surfaces
 * must produce EXACTLY what it produces today, by name and by count. This repo keeps
 * rediscovering the one-way test, and a feature gated behind a flag that silently changes
 * output when the flag is off is not gated at all.
 */
import { renderDocs } from '../renderDocs';
import { renderStories } from '../planDocSections';
import { planStorySpecs } from '../verification/storyPoints';
import {
  CONNECTED_DEMO_STORY_ID,
  CONNECTED_DEMO_ACCEPTANCE,
  connectedDemoStoryDoc,
} from '../connectedDemoStory';
import { COMMAND_CENTER_STORY_ID } from '../commandCenterStory';
import { demoKitFiles } from '../demoKit';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const CTX = {
  repoUrl: 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63',
  generatedAt: '2026-08-10T00:00:00Z',
  planVersion: 1,
  planSha256: 'abc123',
};

const pathsWith = (connectedDemo?: boolean) =>
  renderDocs(pilot, { ...CTX, ...(connectedDemo === undefined ? {} : { connectedDemo }) })
    .map((f) => f.path);

/** The same plan with every array reversed. Structurally identical, different order. */
function shuffled(plan: BuildPlan): BuildPlan {
  return {
    ...plan,
    requirements: [...plan.requirements].reverse(),
    releases: [...plan.releases].reverse(),
    stories: [...plan.stories].reverse(),
  };
}

describe('WITHOUT the flag, the output is exactly today\'s', () => {
  it('omitting it and passing false produce the identical file set', () => {
    expect(pathsWith(undefined)).toEqual(pathsWith(false));
  });

  it('renders no STORY-900 doc and no kit file', () => {
    const paths = pathsWith(false);
    expect(paths).not.toContain(`docs/stories/${CONNECTED_DEMO_STORY_ID}.md`);
    for (const f of demoKitFiles()) expect(paths).not.toContain(f.path);
    expect(paths.filter((p) => p.startsWith('docs/demo-kit/'))).toHaveLength(0);
  });

  it('renders byte-identical bytes with the flag omitted and with it false', () => {
    const a = renderDocs(pilot, CTX);
    const b = renderDocs(pilot, { ...CTX, connectedDemo: false });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('leaves STORIES.md without a STORY-900 entry, so no link points at a missing doc', () => {
    const stories = renderDocs(pilot, CTX).find((f) => f.path === 'docs/STORIES.md')!.content;
    expect(stories).not.toContain(CONNECTED_DEMO_STORY_ID);
  });

  it('leaves progress.json without a STORY-900 seed', () => {
    const progress = renderDocs(pilot, CTX).find((f) => f.path.endsWith('progress.json'))!.content;
    expect(progress).not.toContain(CONNECTED_DEMO_STORY_ID);
  });
});

describe('WITH the flag, the demo is rendered whole', () => {
  it('adds the story doc and exactly the four kit files, and nothing else', () => {
    const before = pathsWith(false);
    const after = pathsWith(true);
    const added = after.filter((p) => !before.includes(p)).sort();
    expect(added).toEqual(
      [`docs/stories/${CONNECTED_DEMO_STORY_ID}.md`, ...demoKitFiles().map((f) => f.path)].sort(),
    );
    // Nothing is REMOVED either. A flag that adds five files and quietly drops one is worse
    // than a flag that does nothing.
    expect(before.filter((p) => !after.includes(p))).toEqual([]);
  });

  it('indexes STORY-900 in STORIES.md, so an agent scanning it finds the work', () => {
    const stories = renderDocs(pilot, { ...CTX, connectedDemo: true })
      .find((f) => f.path === 'docs/STORIES.md')!.content;
    expect(stories).toContain(CONNECTED_DEMO_STORY_ID);
    // The link has to point at a file this same render produced.
    expect(stories).toContain(`stories/${CONNECTED_DEMO_STORY_ID}.md`);
    expect(pathsWith(true)).toContain(`docs/stories/${CONNECTED_DEMO_STORY_ID}.md`);
  });

  it('seeds STORY-900 in progress.json, so the agent flips a boolean instead of retyping criteria', () => {
    const progress = renderDocs(pilot, { ...CTX, connectedDemo: true })
      .find((f) => f.path.endsWith('progress.json'))!.content;
    expect(progress).toContain(CONNECTED_DEMO_STORY_ID);
  });

  /**
   * The story doc has to TELL the student the public link exists.
   *
   * The platform can mint a link nobody knows about. An independent verifier deleted the step-4
   * bullet that points at the portal panel and 2,279 tests stayed green, which meant the only
   * instruction connecting a finished demo to a shareable link was unprotected. A student who
   * finishes this story and is never told has a demo that opens on their own machine and nothing
   * to send anybody, which is the outcome the whole task exists to prevent.
   */
  it('step 4 tells the student how to get the public link, and names the file the panel asks for', () => {
    const doc = renderDocs(pilot, { ...CTX, connectedDemo: true })
      .find((f) => f.path === `docs/stories/${CONNECTED_DEMO_STORY_ID}.md`)!.content;
    const stepFour = doc.slice(doc.indexOf('## Step 4'), doc.indexOf('## Step 5'));
    expect(stepFour.length).toBeGreaterThan(100);
    // The surface, by the name the student sees on it.
    expect(stepFour).toContain('Your demo link');
    // The file the panel asks them to pick. Naming it here is what makes the instruction usable.
    expect(stepFour).toContain('command-center/data-model.json');
    // And that the link is public, which is the part that makes it worth doing.
    expect(stepFour).toMatch(/anybody can open|anyone can open/);
  });

  it('step 4 still carries the LOCAL demo link, which is the per-project Command Center half', () => {
    // Ali's decision 6: the demo link reaches the project Command Center through this step, not
    // by editing commandCenterStory.ts. Both halves are asserted so neither can quietly vanish.
    const doc = renderDocs(pilot, { ...CTX, connectedDemo: true })
      .find((f) => f.path === `docs/stories/${CONNECTED_DEMO_STORY_ID}.md`)!.content;
    const stepFour = doc.slice(doc.indexOf('## Step 4'), doc.indexOf('## Step 5'));
    expect(stepFour).toContain('Command Center');
    expect(stepFour).toContain('demo/index.html');
  });

  it('every kit path is one renderDocs is allowed to write', () => {
    // renderDocs throws on a path outside PATH_ALLOWLIST, so reaching this line at all proves
    // it; asserting the prefix says WHY it is allowed.
    for (const f of demoKitFiles()) expect(f.path.startsWith('docs/demo-kit/')).toBe(true);
  });
});

describe('determinism, with the flag on', () => {
  it('is byte-identical across two calls', () => {
    const a = renderDocs(pilot, { ...CTX, connectedDemo: true });
    const b = renderDocs(pilot, { ...CTX, connectedDemo: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is byte-identical for a plan whose arrays arrived in a different order', () => {
    // The FR-026 rule: array order must not reach the bytes, or repoWriter sees a changed hash
    // and commits a change that is not one, churning the student's history.
    const a = renderDocs(pilot, { ...CTX, connectedDemo: true });
    const b = renderDocs(shuffled(pilot), { ...CTX, connectedDemo: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('and the shuffle is real, so that test is not comparing a plan to itself', () => {
    expect(JSON.stringify(shuffled(pilot).stories)).not.toBe(JSON.stringify(pilot.stories));
  });

  /*
   * The order-independence of the story DOC, tested directly.
   *
   * A mutation that made renderDocs pass the caller's `plan` instead of `orderedPlan` survived
   * the whole-file comparison above, and the reason is worth recording: `connectedDemoPrompt`
   * sorts its own inputs by id, so the doc is already order-independent and the `orderedPlan`
   * at that call site is defensive rather than load-bearing.
   *
   * The sort inside the prompt is the real tripwire, so this tests that property where it
   * actually lives. Without it, the guarantee was being asserted at a layer that could not see
   * whether it held.
   */
  it('the story doc itself is order-independent, which is where the guarantee really lives', () => {
    expect(connectedDemoStoryDoc(pilot)).toBe(connectedDemoStoryDoc(shuffled(pilot)));
  });

  it('and the doc does vary with CONTENT, so the test above is not comparing constants', () => {
    const renamed: BuildPlan = { ...pilot, project_name: 'A Completely Different Name' };
    expect(connectedDemoStoryDoc(pilot)).not.toBe(connectedDemoStoryDoc(renamed));
  });
});

describe('a plan that carries its own STORY-900 wins', () => {
  const withOwn: BuildPlan = {
    ...pilot,
    stories: [
      ...pilot.stories,
      {
        id: CONNECTED_DEMO_STORY_ID,
        release: pilot.releases[0].key,
        title: 'The plan\'s own demo story',
        narrative: 'As a builder, I want my own demo story, so that the plan is the authority.',
        fulfills: [],
        owner_agent: 'agent.builder',
        acceptance: ['Given a plan', 'When it names STORY-900', 'Trust: the plan wins'],
      } as BuildPlan['stories'][number],
    ],
  };

  it('does not render a second doc over the top of the plan\'s own', () => {
    const paths = renderDocs(withOwn, { ...CTX, connectedDemo: true })
      .filter((p) => p.path === `docs/stories/${CONNECTED_DEMO_STORY_ID}.md`);
    expect(paths).toHaveLength(1);
  });

  it('does not index it twice in STORIES.md', () => {
    const stories = renderDocs(withOwn, { ...CTX, connectedDemo: true })
      .find((f) => f.path === 'docs/STORIES.md')!.content;
    expect(stories.split(`stories/${CONNECTED_DEMO_STORY_ID}.md`).length - 1).toBe(1);
  });
});

describe('renderStories, directly, in both directions', () => {
  it('omits STORY-900 by default', () => {
    expect(renderStories(pilot)).not.toContain(CONNECTED_DEMO_STORY_ID);
  });

  it('includes it when asked', () => {
    expect(renderStories(pilot, true)).toContain(CONNECTED_DEMO_STORY_ID);
  });

  it('still leads with the Command Center either way', () => {
    for (const flag of [false, true]) {
      expect(renderStories(pilot, flag)).toContain(COMMAND_CENTER_STORY_ID);
    }
  });
});

describe('planStorySpecs: without this, the task is built and never paid', () => {
  it('EXCLUDES STORY-900 by default', () => {
    const specs = planStorySpecs(pilot);
    expect(specs.map((s) => s.id)).not.toContain(CONNECTED_DEMO_STORY_ID);
  });

  it('INCLUDES it when the flag is on, with the same criteria the task row carries', () => {
    const specs = planStorySpecs(pilot, undefined, true);
    const demo = specs.find((s) => s.id === CONNECTED_DEMO_STORY_ID);
    expect(demo).toBeDefined();
    // The same constant the board row is built from. Two sources for one story's criteria is
    // what put 19 of 20 live builds three versions behind.
    expect(demo!.acceptance).toEqual([...CONNECTED_DEMO_ACCEPTANCE]);
  });

  it('still appends the Command Center in both states', () => {
    for (const flag of [false, true]) {
      expect(planStorySpecs(pilot, undefined, flag).map((s) => s.id))
        .toContain(COMMAND_CENTER_STORY_ID);
    }
  });

  it('adds exactly ONE spec when the flag flips, not a reshuffle', () => {
    const off = planStorySpecs(pilot, undefined, false);
    const on = planStorySpecs(pilot, undefined, true);
    expect(on).toHaveLength(off.length + 1);
    expect(on.slice(0, off.length)).toEqual(off);
  });

  it('defers to a plan that carries its own STORY-900 rather than appending a second', () => {
    const planWithOwn = {
      stories: [
        ...pilot.stories,
        { id: CONNECTED_DEMO_STORY_ID, acceptance: ['Given the plan\'s own criterion'] },
      ],
    } as unknown as BuildPlan;
    const specs = planStorySpecs(planWithOwn, undefined, true);
    const demos = specs.filter((s) => s.id === CONNECTED_DEMO_STORY_ID);
    expect(demos).toHaveLength(1);
    expect(demos[0].acceptance).toEqual(['Given the plan\'s own criterion']);
  });
});
