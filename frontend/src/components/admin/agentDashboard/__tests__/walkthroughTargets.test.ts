/**
 * Every walkthrough step must point at something that is actually on the page it is mounted on.
 *
 * ## The failure this exists for, which it was written after finding
 *
 * `DECIDER_STEPS` was authored against the HUB's cards — `hub-card-tool-requests` and
 * `hub-card-tasks` — before the decide console had any elements to point at. The walkthrough is
 * mounted on the console, where neither of those exists, so two of the five steps rendered "This
 * step is about something that is not on this page right now": the tour telling the reader it
 * cannot find the thing it is about, on the page it exists to explain.
 *
 * Nothing crashed and no other test cared. The component is deliberate about saying so rather than
 * outlining empty space, which is the only reason it was findable by eye at all — and that is
 * exactly the kind of thing that stays broken for a month. So the targets are checked here against
 * the source of the pages that mount them.
 *
 * ## Why it reads source text rather than rendering
 *
 * Rendering the console needs an authenticated queue, a task read, a package and a selection, and
 * the step about the instruction box only appears once a request is open. A render test would have
 * to drive all of that to assert one string, and the thing being asserted is not behaviour: it is
 * that a name on one side matches a name on the other. Reading both sides is the honest shape, and
 * it cannot pass vacuously because the target lists come from the real exports.
 */
import fs from 'fs';
import path from 'path';
import { BUILDER_STEPS, DECIDER_STEPS, type WalkStep } from '../AgentDashboardWalkthrough';

const SRC = path.join(__dirname, '..', '..', '..', '..');

function read(...parts: string[]): string {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf8');
}

/**
 * Every test id a file can render, including the ones built from a template.
 *
 * `data-testid={`hub-card-${card.key}`}` renders a different id per card, so a literal scan would
 * report every hub card as missing. The card keys are literals in the same file, so the set is
 * recoverable; what is NOT recoverable is a target assembled from a runtime value, and such a
 * target would fail here rather than pass — which is the right direction for a check like this.
 */
function testIdsIn(source: string): Set<string> {
  const ids = new Set<string>();
  for (const m of source.matchAll(/data-testid="([^"]+)"/g)) ids.add(m[1]);
  // The templated form: capture the prefix, and expand it over the `key: '...'` literals.
  const prefixes = [...source.matchAll(/data-testid=\{`([a-z-]+)-\$\{[^}]+\}`\}/g)].map((m) => m[1]);
  if (prefixes.length) {
    const keys = [...source.matchAll(/\bkey: '([a-z0-9-]+)'/g)].map((m) => m[1]);
    for (const p of prefixes) for (const k of keys) ids.add(`${p}-${k}`);
  }
  return ids;
}

const HUB_IDS = testIdsIn(read('pages', 'admin', 'AgentDashboardPage.tsx'));

/**
 * The console is a page plus the components it mounts, so its ids are the union.
 *
 * Listed by name rather than globbed: a glob would quietly start covering a component added later
 * and make a broken target pass because something unrelated happened to use the same id.
 */
const CONSOLE_IDS = new Set<string>([
  ...testIdsIn(read('pages', 'admin', 'AdminToolRequestReviewPage.tsx')),
  ...testIdsIn(read('components', 'admin', 'toolReview', 'DecideOverview.tsx')),
  ...testIdsIn(read('components', 'admin', 'toolReview', 'QueueCard.tsx')),
  ...testIdsIn(read('components', 'admin', 'toolReview', 'TaskPanel.tsx')),
  ...testIdsIn(read('components', 'admin', 'toolReview', 'DecisionPanel.tsx')),
  ...testIdsIn(read('components', 'admin', 'toolReview', 'InstructionsInForce.tsx')),
]);

function targetsOf(steps: ReadonlyArray<WalkStep>): string[] {
  return steps.map((s) => s.target).filter((t): t is string => Boolean(t));
}

describe('THE CONTROL: the scan finds real ids', () => {
  it('reads the hub and finds the elements the builder tour names first', () => {
    // Without this, an empty set would make every assertion below pass for the wrong reason.
    expect(HUB_IDS.has('agent-scope-bar')).toBe(true);
    expect(HUB_IDS.size).toBeGreaterThan(4);
  });

  it('expands the templated hub-card id over the real card keys', () => {
    expect(HUB_IDS.has('hub-card-tasks')).toBe(true);
    expect(HUB_IDS.has('hub-card-capability-board')).toBe(true);
    // And it does not invent one. A card key that does not exist must not resolve.
    expect(HUB_IDS.has('hub-card-nonsense')).toBe(false);
  });

  it('reads the console and its panels as one surface', () => {
    expect(CONSOLE_IDS.has('decide-overview')).toBe(true);
    expect(CONSOLE_IDS.has('standing-instructions')).toBe(true);
    expect(CONSOLE_IDS.size).toBeGreaterThan(8);
  });
});

describe('the builder tour points at the hub', () => {
  it('names at least one target, so an empty tour cannot pass', () => {
    expect(targetsOf(BUILDER_STEPS).length).toBeGreaterThan(0);
  });

  it('every target exists on the page it is mounted on', () => {
    const missing = targetsOf(BUILDER_STEPS).filter((t) => !HUB_IDS.has(t));
    expect(missing).toEqual([]);
  });
});

describe('the decider tour points at the console', () => {
  it('names at least one target', () => {
    expect(targetsOf(DECIDER_STEPS).length).toBeGreaterThan(0);
  });

  it('every target exists on the page it is mounted on', () => {
    // THE ASSERTION THAT FOUND THE BUG. Before the fix this was
    // ['hub-card-tool-requests', 'hub-card-tasks'].
    const missing = targetsOf(DECIDER_STEPS).filter((t) => !CONSOLE_IDS.has(t));
    expect(missing).toEqual([]);
  });

  it('points at NO hub card, because the decider tour is not mounted on the hub', () => {
    // The specific mistake, named, so the same one cannot come back wearing a different id.
    const hubCards = targetsOf(DECIDER_STEPS).filter((t) => t.startsWith('hub-card-'));
    expect(hubCards).toEqual([]);
  });

  it('gives every step a target, since all five are about something on the screen', () => {
    expect(DECIDER_STEPS.every((s) => Boolean(s.target))).toBe(true);
  });
});

describe('both tours stay readable', () => {
  it('each step says why it matters and what the reader does', () => {
    for (const step of [...BUILDER_STEPS, ...DECIDER_STEPS]) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.you.length).toBeGreaterThan(10);
    }
  });

  it('is five steps each, which is what the offer on the card promises', () => {
    // The card says "Five steps, about a minute". A tour of seven would make that copy a lie.
    expect(BUILDER_STEPS).toHaveLength(5);
    expect(DECIDER_STEPS).toHaveLength(5);
  });
});
