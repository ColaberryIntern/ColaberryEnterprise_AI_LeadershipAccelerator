import { FLAGS } from '../../../config/featureFlags';
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

/**
 * Run with the overflow BLOCK off.
 *
 * L9.6 turned `sbpSourceOverflowBlock` on by default, so over-budget source is now REFUSED
 * before this detect-only reporting is ever reached. The reporting is still shipped and still
 * correct: it is what an operator sees after turning the block off, which is the whole point of
 * the escape hatch. These cases therefore force the flag off rather than being deleted, and the
 * blocked path gets its own describe below. Deleting them would have retired the detect-only
 * coverage on the day the flag flipped.
 */
function clipping<T>(fn: () => T): T {
  const prev = FLAGS.sbpSourceOverflowBlock;
  (FLAGS as { sbpSourceOverflowBlock: boolean }).sbpSourceOverflowBlock = false;
  try {
    return fn();
  } finally {
    (FLAGS as { sbpSourceOverflowBlock: boolean }).sbpSourceOverflowBlock = prev;
  }
}

async function run(brief: string, document: string) {
  const cap = captureLogs();
  try {
    await clipping(() => decomposeBuild(
      { brief, document, client: stubClient(), correlationId: 'corr-t4' } as never,
    ));
  } finally {
    cap.restore();
  }
  return cap.lines.filter((l) => l.event === 'sbp_decompose_source_truncated');
}

/** The same call at the DEFAULT, returning whatever was logged on the way to the refusal. */
async function blocked(brief: string, document: string) {
  const cap = captureLogs();
  let thrown: unknown;
  try {
    await decomposeBuild({ brief, document, client: stubClient(), correlationId: 'corr-t4' } as never);
  } catch (e) {
    thrown = e;
  } finally {
    cap.restore();
  }
  return { thrown, lines: cap.lines };
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
      await clipping(() => decomposeBuild({
        brief: 'b', document: over(MAX_DOCUMENT_CHARS + 3), client, correlationId: 'corr-fail',
      } as never).catch(() => undefined));
    } finally {
      cap.restore();
    }
    const truncation = cap.lines.filter((l) => l.event === 'sbp_decompose_source_truncated');
    expect(truncation).toHaveLength(1);
    expect((truncation[0].context as Record<string, unknown>).droppedChars).toBe(3);
  });
});

/**
 * The blocked path, which is what production now does.
 *
 * The suite above proves the detect-only reporting still works behind the escape hatch. This one
 * proves the default behaves like every other failure in `decomposeService`: it refuses, and it
 * says so with an `error_class` an operator can filter on. Without it, the single most
 * consequential outcome in this service would have been the only one with no log line.
 */
describe('with the block at its DEFAULT, an over-budget build is refused and SAID so', () => {
  it('refuses rather than generating from source the model will not see', async () => {
    const { thrown } = await blocked('b', over(MAX_DOCUMENT_CHARS + 7_000));
    expect((thrown as Error)?.name).toBe('SourceOverflowError');
  });

  it('logs the refusal with an error_class, a tag and the characters that would have been lost', async () => {
    const { lines } = await blocked('b', over(MAX_DOCUMENT_CHARS + 7_000));
    const line = lines.find((l) => l.event === 'sbp_decompose_source_blocked');
    expect(line).toBeDefined();
    expect(line).toMatchObject({
      outcome: 'failure',
      context: {
        error_class: 'SourceOverflowBlocked',
        tag: 'EXPANDED_DOCUMENT',
        limit: MAX_DOCUMENT_CHARS,
        // `actual` as well as `droppedChars`. A verifier deleted this one field with the suite
        // green: without it an operator knows something was refused and not how far over the
        // input was, which is the first number they need to decide what to tell the student.
        actual: MAX_DOCUMENT_CHARS + 7_000,
        droppedChars: 7_000,
      },
    });
  });

  it('emits one blocked line PER overflowing input, like the truncation report it replaces', async () => {
    const { lines } = await blocked(over(MAX_BRIEF_CHARS + 5), over(MAX_DOCUMENT_CHARS + 9));
    const blockedLines = lines.filter((l) => l.event === 'sbp_decompose_source_blocked');
    expect(blockedLines.map((l) => (l.context as { tag: string }).tag).sort())
      .toEqual(['EXPANDED_DOCUMENT', 'ORIGINAL_BRIEF']);
  });

  it('does NOT refuse a build whose source fits, so the default is a gate and not an outage', async () => {
    const { thrown, lines } = await blocked('a short brief', 'a short document');
    expect(thrown).toBeUndefined();
    expect(lines.some((l) => l.event === 'sbp_decompose_source_blocked')).toBe(false);
  });

  it('does not ALSO emit the truncation line, because nothing was truncated', async () => {
    // The two reports describe different outcomes. A build that was refused did not clip, and
    // logging both would make an operator think the model saw a partial document.
    const { lines } = await blocked('b', over(MAX_DOCUMENT_CHARS + 7_000));
    expect(lines.some((l) => l.event === 'sbp_decompose_source_truncated')).toBe(false);
  });
});

/**
 * The STAGED path, which is what production actually runs.
 *
 * `SBP_STAGED_GENERATION` is on unless set to 'off', so `decomposeBuild` delegates to
 * `generateStagedPlan` before it ever builds its own prompt, and the refusal surfaces through
 * that catch rather than the one above. An independent verifier measured it arriving as
 * `UpstreamError`, whose student-facing recovery is the Retry button: a retry of an input that is
 * too long can never succeed, so the one thing the person is offered is the one thing that cannot
 * work. The class is ours now, and it says what happened.
 */
describe('a staged build classifies a refusal as a refusal, not as an upstream failure', () => {
  it('fails with SourceOverflowBlocked rather than UpstreamError', async () => {
    const cap = captureLogs();
    let thrown: unknown;
    try {
      await decomposeBuild({
        brief: 'b',
        document: over(MAX_DOCUMENT_CHARS + 7_000),
        client: stubClient(),
        correlationId: 'corr-staged',
        staged: true,
      } as never);
    } catch (e) {
      thrown = e;
    } finally {
      cap.restore();
    }
    expect((thrown as { error_class?: string })?.error_class).toBe('SourceOverflowBlocked');
    expect((thrown as { error_class?: string })?.error_class).not.toBe('UpstreamError');
  });

  it('and the failure line carries that class too, so a log search finds it', async () => {
    const cap = captureLogs();
    try {
      await decomposeBuild({
        brief: 'b',
        document: over(MAX_DOCUMENT_CHARS + 7_000),
        client: stubClient(),
        correlationId: 'corr-staged',
        staged: true,
      } as never).catch(() => undefined);
    } finally {
      cap.restore();
    }
    const failed = cap.lines.find((l) => l.event === 'sbp_decompose_failed');
    expect(failed).toBeDefined();
    expect((failed!.context as { error_class?: string }).error_class).toBe('SourceOverflowBlocked');
  });

  it('a staged build whose source fits is not refused, so the class is not a blanket', async () => {
    // The control: without it, a classifier that returned SourceOverflowBlocked for everything
    // would satisfy both cases above.
    const cap = captureLogs();
    let thrown: unknown;
    try {
      await decomposeBuild({
        brief: 'b', document: 'fits', client: stubClient(), correlationId: 'corr-staged', staged: true,
      } as never);
    } catch (e) {
      thrown = e;
    } finally {
      cap.restore();
    }
    expect((thrown as { error_class?: string })?.error_class).not.toBe('SourceOverflowBlocked');
  });
});
