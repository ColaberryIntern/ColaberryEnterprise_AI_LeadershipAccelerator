import {
  sourceOverflows,
  buildDecomposeUserPrompt,
  MAX_BRIEF_CHARS,
  MAX_DOCUMENT_CHARS,
} from '../decomposePrompt';

/**
 * P6-T4 — source material that never reaches the model, made visible.
 *
 * `request.md:243`: "No fixed story/task target may silently truncate source scope; review Factory
 * prompt sizing and source clipping and implement explicit completeness checks/chunking or a
 * visible blocking overflow where necessary."
 *
 * The clip was real and it was silent. `delimited` writes `…[truncated at N chars]` INTO THE
 * PROMPT, so the model is told and no human, caller or log is. These tests pin both halves: that
 * the clip still happens (it is a safety behaviour — an unbounded prompt is its own problem), and
 * that it is now reportable.
 *
 * ## The generator, not an example
 *
 * Standing rule: a claim quantified over an input space ships with a generator. The claim here is
 * "a source set larger than the budget is never quietly truncated", so the inputs are BUILT from
 * the exported budgets rather than hand-sized. If someone raises `MAX_DOCUMENT_CHARS`, these tests
 * follow it instead of silently testing a case that is no longer the boundary.
 */

const over = (n: number) => 'x'.repeat(n);

describe('sourceOverflows reports what the model will not see', () => {
  it('reports nothing when both inputs fit — a measured answer, not an absence', () => {
    expect(sourceOverflows({ brief: 'short', document: 'also short' })).toEqual([]);
  });

  it('reports the document, with the dropped character count', () => {
    const doc = over(MAX_DOCUMENT_CHARS + 50_000);
    expect(sourceOverflows({ brief: 'b', document: doc })).toEqual([{
      tag: 'EXPANDED_DOCUMENT',
      limit: MAX_DOCUMENT_CHARS,
      actual: MAX_DOCUMENT_CHARS + 50_000,
      droppedChars: 50_000,
    }]);
  });

  it('reports the brief independently of the document', () => {
    const [o] = sourceOverflows({ brief: over(MAX_BRIEF_CHARS + 1), document: 'fits' });
    expect(o.tag).toBe('ORIGINAL_BRIEF');
    expect(o.droppedChars).toBe(1);
  });

  it('reports BOTH when both overflow, rather than stopping at the first', () => {
    const both = sourceOverflows({
      brief: over(MAX_BRIEF_CHARS + 10),
      document: over(MAX_DOCUMENT_CHARS + 20),
    });
    expect(both.map((o) => o.tag)).toEqual(['ORIGINAL_BRIEF', 'EXPANDED_DOCUMENT']);
    expect(both.map((o) => o.droppedChars)).toEqual([10, 20]);
  });

  it('is exact at the boundary: at the limit fits, one over does not', () => {
    // Off-by-one here would under-report by a character or over-report a document that fits.
    expect(sourceOverflows({ brief: over(MAX_BRIEF_CHARS), document: '' })).toEqual([]);
    expect(sourceOverflows({ brief: over(MAX_BRIEF_CHARS + 1), document: '' })).toHaveLength(1);
  });

  it('treats missing inputs as empty rather than throwing', () => {
    // `DecomposeInputs` types these as strings, but nothing validates `plan_json`-adjacent inputs
    // at this boundary and a gatherer that throws is worse than one that reports nothing.
    expect(sourceOverflows({} as Parameters<typeof sourceOverflows>[0])).toEqual([]);
  });
});

describe('the clip itself still happens, and the overflow report agrees with it', () => {
  it('still truncates, because an unbounded prompt is its own problem', () => {
    // Making the overflow visible must NOT have quietly removed the clamp: it is a SAFE-002
    // control, not an accident. Both behaviours are asserted together so neither can be traded
    // away for the other.
    const doc = over(MAX_DOCUMENT_CHARS + 1_000);
    const prompt = buildDecomposeUserPrompt({ brief: 'b', document: doc } as never);
    expect(prompt).toContain(`…[truncated at ${MAX_DOCUMENT_CHARS} chars]`);

    // Measure THE BLOCK, not the whole prompt.
    //
    // My first version asserted `prompt.length < doc.length`, which is a proxy that only holds
    // while the instruction text is shorter than the overflow — and it broke the moment I added
    // the workspace paragraphs to the prompt, reporting a failure where the clip was working
    // perfectly. A proxy that depends on unrelated text is not a measurement of truncation.
    const body = prompt.slice(
      prompt.indexOf('<EXPANDED_DOCUMENT>') + '<EXPANDED_DOCUMENT>'.length,
      prompt.indexOf('</EXPANDED_DOCUMENT>'),
    );
    const xs = (body.match(/x/g) ?? []).length;
    expect(xs).toBe(MAX_DOCUMENT_CHARS);
    expect(xs).toBeLessThan(doc.length);
  });

  it('the report fires exactly when the prompt carries a truncation marker', () => {
    // The two must never disagree: a prompt that clipped while the report said nothing is the
    // original defect, and a report firing on a prompt that did not clip would be a false alarm.
    const cases: ReadonlyArray<[string, string]> = [
      ['b', 'fits'],
      ['b', over(MAX_DOCUMENT_CHARS + 1)],
      [over(MAX_BRIEF_CHARS + 1), 'fits'],
    ];
    for (const [brief, document] of cases) {
      const prompt = buildDecomposeUserPrompt({ brief, document } as never);
      const marked = prompt.includes('…[truncated at');
      expect(sourceOverflows({ brief, document }).length > 0).toBe(marked);
    }
  });
});
