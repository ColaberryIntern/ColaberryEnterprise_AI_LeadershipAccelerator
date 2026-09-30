/**
 * WHERE the Command Center goes — the prompt's answer and the prober's answer,
 * pinned in the same test on purpose.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 *
 * A student built a Command Center correctly, hosted it correctly, and GitHub
 * served it at `<site>/command-center/index.html` with a 200. The platform
 * probed `<site>/`, got a 404, logged `sbp_pages_not_live`, and never wrote
 * `command_center_url` — so the link never appeared and nothing said why.
 *
 * The cause was not the prober. The 26,055-character prompt never said WHERE to
 * put the Command Center, so the agent picked, and the platform assumed. Two
 * facts about one location, held in two places that had never been introduced.
 *
 * ── WHY THESE TWO ASSERTIONS SHARE A TEST ────────────────────────────────────
 *
 * "The prompt names a location" and "the prober checks that location" are each
 * individually green in the broken world: the prompt could name `docs/` and the
 * prober could keep checking the root, and both tests would pass while the
 * defect stayed exactly where it was. Separating them is how this defect was
 * born. So the pin below asserts the SECOND from the FIRST — the URL the prober
 * hits first is derived from the path the prompt states, not from a literal
 * typed twice.
 */
import {
  COMMAND_CENTER_DIRS,
  COMMAND_CENTER_ENTRY_FILE,
  COMMAND_CENTER_ENTRY_PATH,
  COMMAND_CENTER_ENTRY_RULE,
  commandCenterProbeUrls,
} from '../commandCenterLocation';
import { commandCenterPrompt } from '../commandCenterStory';
import { BuildPlan } from '../planContract';

/** A site root of the ordinary project-repo shape. */
const SITE = 'https://colaberryintern.github.io/AcceleratorTesting/';

function plan(): BuildPlan {
  return {
    project_name: 'Client Onboarding Concierge',
    descriptor: 'runs a new client\'s first week',
    requirements: [
      { id: 'REQ-001', statement: 'The system must draft the welcome pack.', kind: 'FUNC', priority: 'must', cluster: 'core' },
    ],
    releases: [{ key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
    stories: [{
      id: 'STORY-001', release: 'r0', title: 'Deliver the draft',
      narrative: 'As an account owner, I want a draft, so that the work lands.',
      fulfills: ['REQ-001'], owner_agent: 'Drafting Agent',
      acceptance: ['Given a, when b, then c.'],
      task_guidance: 'guidance', failure_paths: ['upstream down'],
    }],
  };
}

// ── the choice, and the reason for it ───────────────────────────────────────

describe('the documented location', () => {
  it('is the repo root, because it is the only place a free public repo can serve from', () => {
    // GitHub Pages accepts exactly two source paths on a free public repo: `/`
    // and `/docs`. `command-center/` cannot be selected as a Pages source at
    // all, which is why the build in the field could only ever be one directory
    // below its own site root.
    expect(COMMAND_CENTER_DIRS[0]).toBe('');
    expect(COMMAND_CENTER_ENTRY_PATH).toBe('index.html');
    expect(COMMAND_CENTER_ENTRY_PATH).toBe(`${COMMAND_CENTER_DIRS[0]}${COMMAND_CENTER_ENTRY_FILE}`);
  });

  it('is never `docs/` — the platform owns that directory and rewrites it every sync', () => {
    // repoWriter refuses to write outside `CLAUDE.md / docs/** / .colaberry/**`,
    // and refreshRepoDocuments rewrites docs/REQUIREMENTS.md, docs/STORIES.md,
    // docs/TRACEABILITY.md and docs/stories/*.md on every sync. An app hosted
    // out of there is a defect waiting for its first sync.
    expect(COMMAND_CENTER_DIRS).not.toContain('docs/');
    expect(COMMAND_CENTER_DIRS).not.toContain('docs');
  });
});

// ── THE PIN ─────────────────────────────────────────────────────────────────

describe('the prompt and the prober agree about where it lives', () => {
  it('the prompt states a location at all — the whole of the defect was that it did not', () => {
    const out = commandCenterPrompt(plan(), null);

    // Before this fix, grep for `index.html`, `command-center/`, `folder` and
    // `root of` across the entire 26,055-character prompt returned nothing.
    expect(out).toContain(COMMAND_CENTER_ENTRY_RULE);

    // And the constant it was rendered from is a real sentence about a real
    // path, so `toContain` above cannot be satisfied by an empty string.
    expect(COMMAND_CENTER_ENTRY_PATH.length).toBeGreaterThan(0);
    expect(COMMAND_CENTER_ENTRY_RULE).toContain(COMMAND_CENTER_ENTRY_PATH);
  });

  it('and the prober looks there FIRST, at a URL derived from that same path', () => {
    const probed = commandCenterProbeUrls(SITE);

    // Anti-vacuity: an empty probe list would make every containment assertion
    // below meaningless, and an empty list is exactly what a refactor that
    // dropped the constant would produce.
    expect(probed.length).toBeGreaterThan(0);

    // The address the documented location actually serves at, computed from
    // COMMAND_CENTER_ENTRY_PATH rather than typed out again. If the prompt is
    // ever changed to name a different location, this stops matching.
    const documented = new URL(COMMAND_CENTER_ENTRY_PATH, SITE).href.replace(/index\.html$/, '');

    expect(probed[0]).toBe(documented);
    expect(probed[0]).toBe(SITE);
  });

  it('still looks where builds made before the convention actually put it', () => {
    // Not a second convention — an honesty measure. Those students' sites are
    // genuinely live, and the previous prober told them they were not.
    expect(commandCenterProbeUrls(SITE)).toContain(`${SITE}command-center/`);
  });

  it('keeps the documented root ahead of the legacy shape, so the convention wins', () => {
    const probed = commandCenterProbeUrls(SITE);
    expect(probed.indexOf(SITE)).toBeLessThan(probed.indexOf(`${SITE}command-center/`));
  });
});

// ── URL construction ────────────────────────────────────────────────────────

describe('commandCenterProbeUrls', () => {
  it('does not double the slash when the site root already ends in one', () => {
    const doubled = commandCenterProbeUrls(SITE).filter((u) => /[^:]\/\//.test(u));
    expect(doubled).toEqual([]);
    // …and it produced something to check in the first place.
    expect(commandCenterProbeUrls(SITE)).toEqual([SITE, `${SITE}command-center/`]);
  });

  it('adds the missing slash when it does not', () => {
    expect(commandCenterProbeUrls('https://alice.github.io/cc'))
      .toEqual(['https://alice.github.io/cc/', 'https://alice.github.io/cc/command-center/']);
  });

  it('works off a custom domain, which no formula could have produced', () => {
    // GitHub reports the CNAME as html_url; the prefixes are relative to
    // whatever root arrives, so a custom domain needs no special case.
    expect(commandCenterProbeUrls('https://command.example.com/'))
      .toEqual(['https://command.example.com/', 'https://command.example.com/command-center/']);
  });
});

// ── the repair path for a build already in the wrong place ──────────────────

describe('a student who already built it somewhere else', () => {
  it('is told to add a root entry point, not to move or rebuild their work', () => {
    // The same rule Step 2b lives under: work already in the repo is theirs and
    // it stays. "Move it to the root" is exactly the instruction that turns
    // into a regenerated app and a deleted afternoon.
    const out = commandCenterPrompt(plan(), null);

    expect(out).toMatch(/do not move it and do not rebuild it/i);
    expect(out).toMatch(/one-line redirect/i);
  });

  it('explains why the root, rather than just asserting it', () => {
    const out = commandCenterPrompt(plan(), null);

    expect(out).toMatch(/exactly two places/i);
    expect(out).toMatch(/rewrites it every time you sync/i);
  });
});
