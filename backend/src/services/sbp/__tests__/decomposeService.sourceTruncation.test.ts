import { decomposeBuild } from '../decomposeService';
import { MAX_BRIEF_CHARS, MAX_DOCUMENT_CHARS } from '../decomposePrompt';

/**
 * P6-T4 attempt 2 — the EMISSION that makes source truncation visible.
 *
 * ## Why this file exists
 *
 * Attempt 1 shipped `sourceOverflows()` with ten tests and wired it into `decomposeBuild`, then
 * cited a green 80-suite / 1329-test run as the evidence. A verifier deleted the entire
 * `log('sbp_decompose_source_truncated', …)` loop and **that run stayed green at 80 suites, 1329
 * tests, exit 0.** The pure predicate was thoroughly covered; the one line that makes truncation
 * observable to a human — the whole point of `request.md:243` — was covered by nothing.
 *
 * That is the same defect class `lifecycleEvidence.applyMeasurements`' own header documents:
 * "deleting the whole loop left 850 of 850 tests green". I quoted it in a comment on the lifecycle
 * side, mutation-hunted that side hard, and committed the identical hole here.
 *
 * So this suite asserts the OBSERVABLE BEHAVIOUR rather than the predicate: that a caller who
 * overflows a budget produces a structured log line a human can find. The model client is stubbed —
 * nothing here calls OpenAI — because the assertion is about what gets logged before the call.
 */

/** A client that returns one valid plan, so generation reaches its normal end. */
function stubClient() {
  const plan = {
    project_name: 'P', descriptor: 'd',
    requirements: [{ id: 'REQ-1', statement: 's', kind: 'FUNC', priority: 'must', cluster: 'c', from_dimensions: [] }],
    releases: [{ key: 'r0', name: 'n', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
    stories: [{
      id: 'STORY-001', release: 'r0', title: 't', narrative: 'n', fulfills: ['REQ-1'],
      owner_agent: 'A', acceptance: ['Given a', 'When b', 'Trust c'], task_guidance: 'g',
      failure_paths: ['f'], blocked_by: [],
    }],
  };
  return {
    create: jest.fn(async () => ({
      choices: [{ message: { content: JSON.stringify(plan) } }],
      usage: { total_tokens: 1 },
    })),
  };
}

/** Capture the structured lines this run writes, without swallowing a real failure. */
function captureLogs(): { lines: Array<Record<string, unknown>>; restore: () => void } {
  const lines: Array<Record<string, unknown>> = [];
  const original = console.log;
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string') {
      try { lines.push(JSON.parse(first)); } catch { /* not a structured line */ }
    }
  };
  return { lines, restore: () => { console.log = original; } };
}

const over = (n: number) => 'x'.repeat(n);

async function run(brief: string, document: string) {
  const cap = captureLogs();
  try {
    await decomposeBuild({ brief, document, client: stubClient(), correlationId: 'corr-t4' } as never);
  } finally {
    cap.restore();
  }
  return cap.lines.filter((l) => l.event === 'sbp_decompose_source_truncated');
}

describe('decomposeBuild makes dropped source visible', () => {
  it('emits NOTHING when both inputs fit', async () => {
    // The negative half. Without it, a loop that logs unconditionally would pass every other test
    // here while crying wolf on every build.
    expect(await run('a short brief', 'a short document')).toEqual([]);
  });

  it('emits one line for an over-budget document, with the dropped count', async () => {
    const lines = await run('b', over(MAX_DOCUMENT_CHARS + 7_000));
    expect(lines).toHaveLength(1);
    // Domain fields live under `context`, which is CLAUDE.md's Observability schema rather than
    // an accident of this helper: "context": { "...": "domain-specific" }. My first version of
    // this test asserted them at the top level and failed — the code was right.
    expect(lines[0]).toMatchObject({
      event: 'sbp_decompose_source_truncated',
      outcome: 'partial',
      context: {
        tag: 'EXPANDED_DOCUMENT',
        limit: MAX_DOCUMENT_CHARS,
        droppedChars: 7_000,
      },
    });
  });

  it('logs outcome `partial`, not `success` — the generation used less than it was given', async () => {
    const [line] = await run('b', over(MAX_DOCUMENT_CHARS + 1));
    // The field an operator filters on. `success` here would make a lossy build indistinguishable
    // from a complete one in any log search.
    expect(line.outcome).toBe('partial');
  });

  it('carries the correlation id, so the line joins the rest of the build', async () => {
    const [line] = await run('b', over(MAX_DOCUMENT_CHARS + 1));
    expect(line.correlation_id).toBe('corr-t4');
  });

  it('emits one line PER overflowing input, not one per build', async () => {
    const lines = await run(over(MAX_BRIEF_CHARS + 5), over(MAX_DOCUMENT_CHARS + 9));
    const ctx = lines.map((l) => l.context as Record<string, unknown>);
    expect(ctx.map((c) => c.tag)).toEqual(['ORIGINAL_BRIEF', 'EXPANDED_DOCUMENT']);
    expect(ctx.map((c) => c.droppedChars)).toEqual([5, 9]);
  });

  it('emits BEFORE the model is called, so a failing generation still reports the loss', async () => {
    // Otherwise the one build most worth knowing about — big input, failed generation — is the one
    // that reports nothing.
    const cap = captureLogs();
    const client = { create: jest.fn(async () => { throw new Error('upstream down'); }) };
    try {
      await decomposeBuild({
        brief: 'b', document: over(MAX_DOCUMENT_CHARS + 3), client, correlationId: 'corr-fail',
      } as never).catch(() => undefined);
    } finally {
      cap.restore();
    }
    const truncation = cap.lines.filter((l) => l.event === 'sbp_decompose_source_truncated');
    expect(truncation).toHaveLength(1);
    expect((truncation[0].context as Record<string, unknown>).droppedChars).toBe(3);
  });
});
