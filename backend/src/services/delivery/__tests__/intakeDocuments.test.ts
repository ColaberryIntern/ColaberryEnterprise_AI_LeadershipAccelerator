/**
 * A document attached to the interview has to do BOTH things it was asked to do.
 *
 *     "Also I should be able to add documents to this process that can be analyzed
 *      before submitting the next question and can be used when creating the
 *      requirements."  (Ali, 2026-09-29)
 *
 * Two obligations, and the cheap version satisfies one. Feeding the document to the
 * interviewer alone makes attaching feel like it worked while the plan is built from the
 * conversation as though no document existed. Feeding it only to the extraction makes the
 * interviewer ask questions the person can see they already answered in writing.
 *
 * So these tests are split the same way the contract is: what the interviewer is told,
 * and what the extractor is given. The wiring tests that prove both ends are actually
 * connected live in `flotationInterviewService.test.ts` and `projectIntake.test.ts` —
 * a rendering with no caller is the failure this area has already had once.
 */

import {
  boundDocuments,
  documentsForInterviewer,
  documentsForTranscript,
  DOCUMENT_TEXT_MAX,
  DOCUMENTS_MAX,
  DOCUMENTS_TOTAL_MAX,
  DOCUMENT_NAME_MAX,
} from '../intakeDocuments';

const doc = (name: string, text: string) => ({ name, text });

describe('bounding what a client attached', () => {
  it('keeps a normal document as it was', () => {
    expect(boundDocuments([doc('spec.md', 'The system must log every dispatch.')])).toEqual([
      { name: 'spec.md', text: 'The system must log every dispatch.' },
    ]);
  });

  it('refuses more documents than the ceiling allows', () => {
    const many = Array.from({ length: DOCUMENTS_MAX + 4 }, (_, i) => doc(`d${i}.md`, `content ${i}`));
    expect(boundDocuments(many)).toHaveLength(DOCUMENTS_MAX);
  });

  it('drops a WHOLE document at the total ceiling rather than half of one', () => {
    // Half a specification reads as a complete specification that is missing
    // requirements, which is worse than one visibly absent. Same rule as packItems.
    const big = 'x'.repeat(DOCUMENT_TEXT_MAX);
    const count = Math.ceil(DOCUMENTS_TOTAL_MAX / DOCUMENT_TEXT_MAX) + 2;
    const out = boundDocuments(Array.from({ length: count }, (_, i) => doc(`d${i}.md`, big)));

    const total = out.reduce((n, d) => n + d.text.length, 0);
    expect(total).toBeLessThanOrEqual(DOCUMENTS_TOTAL_MAX);
    for (const d of out) expect(d.text).toHaveLength(DOCUMENT_TEXT_MAX);
  });

  it('clips one enormous document rather than refusing it', () => {
    const out = boundDocuments([doc('huge.pdf', 'y'.repeat(DOCUMENT_TEXT_MAX + 10_000))]);
    expect(out).toHaveLength(1);
    expect(out[0].text.length).toBeLessThanOrEqual(DOCUMENT_TEXT_MAX);
  });

  it('ignores an empty or whitespace-only document instead of attaching nothing', () => {
    // A scan with no text layer extracts to '' upstream. An empty document on the
    // prompt is noise that looks like evidence.
    expect(boundDocuments([doc('blank.pdf', '   '), doc('real.md', 'something')])).toEqual([
      { name: 'real.md', text: 'something' },
    ]);
  });

  it('names an unnamed document rather than rendering a headerless block', () => {
    expect(boundDocuments([{ text: 'content' }])[0].name).toBe('Untitled document');
  });

  it('clips a filename long enough to be an attack on the prompt', () => {
    const out = boundDocuments([doc('n'.repeat(DOCUMENT_NAME_MAX + 500), 'content')]);
    expect(out[0].name.length).toBeLessThanOrEqual(DOCUMENT_NAME_MAX);
  });

  it('survives anything that is not a list of documents', () => {
    for (const junk of [undefined, null, 'a string', 42, {}, [null], [{ name: 'x' }], [{ text: 5 }]]) {
      expect(boundDocuments(junk)).toEqual([]);
    }
  });
});

describe('what the interviewer is told', () => {
  const docs = [doc('brief.md', 'Dispatchers need to see every open job.')];

  it('carries the document verbatim, under its own name', () => {
    const out = documentsForInterviewer(docs);
    expect(out).toContain('--- brief.md ---');
    expect(out).toContain('Dispatchers need to see every open job.');
  });

  it('tells it NOT to ask what the document already answers', () => {
    // Without this the model gives the document the same weight as anything else and
    // asks a question the first page answers - an interrogation the person can see is
    // redundant, which is the failure flotationInterviewService was written against.
    expect(documentsForInterviewer(docs)).toMatch(/do not ask/i);
  });

  it('says nothing at all when nothing was attached', () => {
    // An empty section still costs prompt and still invites the model to comment on
    // documents that do not exist.
    expect(documentsForInterviewer([])).toBe('');
  });

  it('keeps several documents separately identifiable', () => {
    const out = documentsForInterviewer([doc('a.md', 'first'), doc('b.md', 'second')]);
    expect(out).toContain('--- a.md ---');
    expect(out).toContain('--- b.md ---');
    expect(out.indexOf('first')).toBeLessThan(out.indexOf('second'));
  });
});

describe('what the extractor is given', () => {
  const docs = [doc('requirements.docx', 'REQ-1: every dispatch is logged.')];

  it('carries the document verbatim so the requirements can be built from it', () => {
    const out = documentsForTranscript(docs);
    expect(out).toContain('--- requirements.docx ---');
    expect(out).toContain('REQ-1: every dispatch is logged.');
  });

  it('attributes it to the person, not to us', () => {
    // Provenance is the one thing this pipeline refuses to blur: an inference and a
    // customer statement are kept apart everywhere else, so a document the customer
    // wrote must arrive as theirs or the decomposer will build our words as fact.
    expect(documentsForTranscript(docs)).toMatch(/^human:/);
  });

  it('says nothing at all when nothing was attached', () => {
    expect(documentsForTranscript([])).toBe('');
  });
});
