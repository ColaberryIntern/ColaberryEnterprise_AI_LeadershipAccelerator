/**
 * The `.colaberry/progress.json` example inside STORY-000's prompt must be a
 * file the platform can actually READ.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
 *
 * STORY-000's prompt is the ONLY place a student is handed the exact shape of
 * the progress file. For a repo the platform cannot write — no managed block, no
 * seeded `.colaberry/progress.json` — it is the only source of that shape there
 * is. So the example is not documentation. It is the contract, and an example
 * the parser rejects is worse than no example: the student follows it exactly,
 * the whole file is refused at the schema gate, and the platform reports nothing
 * about the work they did.
 *
 * That is not hypothetical. The example carried `stories` and `criteria` and no
 * `schema_version`, which `progressFileSchema` requires — so pasting it produced
 * exactly the production failure of 2026-08-17:
 * `schema_version: Invalid input: expected number, received undefined`.
 *
 * The defence is a ROUND TRIP: take the prompt's own example and push it through
 * the very function that reads a student's file. Nothing else can drift.
 */
import { BuildPlan } from '../planContract';
import { commandCenterPrompt, COMMAND_CENTER_ACCEPTANCE, COMMAND_CENTER_STORY_ID } from '../commandCenterStory';
import { parseProgressFile, PROGRESS_SCHEMA_VERSION } from '../verification/progressContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;

/** The single fenced ```json block in the prompt — the file the student is told to create. */
function exampleJson(): string {
  const blocks = commandCenterPrompt(pilot).match(/```json\n([\s\S]*?)\n```/g) ?? [];
  expect(blocks).toHaveLength(1);
  return blocks[0].replace(/^```json\n/, '').replace(/\n```$/, '');
}

describe('the prompt hands the student a file the reader accepts', () => {
  it('parses through parseProgressFile — the same gate a real repo file meets', () => {
    const result = parseProgressFile(exampleJson());
    expect(result.ok).toBe(true);
  });

  it('declares the schema_version the reader requires', () => {
    const parsed = JSON.parse(exampleJson());
    expect(parsed.schema_version).toBe(PROGRESS_SCHEMA_VERSION);
  });

  it('carries STORY-000 with every criterion, generated from the constant', () => {
    const result = parseProgressFile(exampleJson());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const story = result.file.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID);
    expect(story).toBeDefined();
    // Byte-identical text, in plan order. A retyped dash here is a claim the
    // matcher cannot recognise.
    expect(story!.criteria.map((c) => c.text)).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('is still an all-true example, so the surrounding prose stays true', () => {
    const result = parseProgressFile(exampleJson());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const story = result.file.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;
    expect(story.criteria.every((c) => c.passed)).toBe(true);
    // The paragraph directly under the block describes it as an all-true build.
    expect(commandCenterPrompt(pilot)).toContain(
      `That example is a build where all ${COMMAND_CENTER_ACCEPTANCE.length} lines are genuinely true.`,
    );
  });
});
