/**
 * factoryDecomposeInput establishes the deterministic guarantees the LLM's output later depends on:
 * every requirement is a citable 'requirement' block, nothing is 'unresolved', and the ids are stable
 * (idempotent). These tests pin those, and the last block proves the adapter's output actually feeds
 * the T2 prompt such that every requirement block is coverable (the SOURCE_COVERAGE handshake).
 */
import { buildFactoryDecomposeInput, type FactoryDecomposeSource } from '../factoryDecomposeInput';
import { buildFactoryDecomposeUserPrompt, coversRequirementBlocks } from '../factoryDecomposePrompt';

const src: FactoryDecomposeSource = {
  requirements: [
    { id: 'REQ-1', statement: 'Extract requirements', kind: 'technical', priority: 'must', section: 'L.3.1', extracted_text: 'shall extract requirements' },
    { id: 'REQ-2', statement: 'Classify requirements', kind: 'technical', priority: 'must', section: 'L.3.2' },
  ],
  understanding: [
    { dimension: 'Desired Outcome', content: 'A traceable compliance matrix.' },
    { dimension: 'Actors', content: 'A compliance analyst and a proposal lead.' },
  ],
};

describe('buildFactoryDecomposeInput classifies and grounds the source deterministically', () => {
  it('makes one citable requirement block per requirement, id blk-<reqId>', () => {
    const { blocks } = buildFactoryDecomposeInput(src);
    const reqBlocks = blocks.filter((b) => b.kind === 'requirement');
    expect(reqBlocks.map((b) => b.id)).toEqual(['blk-REQ-1', 'blk-REQ-2']);
    // extracted_text is preferred over the paraphrase for the citable text
    expect(reqBlocks[0].text).toBe('shall extract requirements');
    // falls back to the statement when extracted_text is absent
    expect(reqBlocks[1].text).toBe('Classify requirements');
  });

  it('makes a context block per understanding dimension and classifies NOTHING as unresolved', () => {
    const { blocks } = buildFactoryDecomposeInput(src);
    expect(blocks.filter((b) => b.kind === 'context').map((b) => b.id)).toEqual(['ctx-desired-outcome', 'ctx-actors']);
    expect(blocks.some((b) => b.kind === 'unresolved')).toBe(false);
  });

  it('is idempotent: two runs are byte-identical', () => {
    expect(buildFactoryDecomposeInput(src)).toEqual(buildFactoryDecomposeInput(src));
  });

  it('mirrors block ids into promptInputs and passes requirements through', () => {
    const { blocks, promptInputs } = buildFactoryDecomposeInput(src);
    expect(promptInputs.sourceBlocks.map((b) => b.id)).toEqual(blocks.map((b) => b.id));
    expect(promptInputs.requirements.map((r) => r.id)).toEqual(['REQ-1', 'REQ-2']);
    expect(promptInputs.context).toMatch(/Desired Outcome: A traceable compliance matrix/);
  });

  it('dedupes a duplicate requirement id into a single block', () => {
    const dup = buildFactoryDecomposeInput({
      requirements: [
        { id: 'REQ-1', statement: 'A', kind: 'technical', priority: 'must' },
        { id: 'REQ-1', statement: 'A again', kind: 'technical', priority: 'must' },
      ],
    });
    expect(dup.blocks.filter((b) => b.id === 'blk-REQ-1')).toHaveLength(1);
  });

  it('handles empty inputs without throwing', () => {
    const empty = buildFactoryDecomposeInput({ requirements: [] });
    expect(empty.blocks).toEqual([]);
    expect(empty.promptInputs.sourceBlocks).toEqual([]);
    expect(empty.promptInputs.context).toBeUndefined();
  });

  it('honours an explicit contextSummary over the derived one', () => {
    const withCtx = buildFactoryDecomposeInput({ ...src, contextSummary: 'Explicit summary.' });
    expect(withCtx.promptInputs.context).toBe('Explicit summary.');
  });
});

describe('the adapter output feeds the T2 prompt and satisfies SOURCE_COVERAGE coverage', () => {
  it('every requirement block is named in the built prompt (coversRequirementBlocks === true)', () => {
    const { promptInputs } = buildFactoryDecomposeInput(src);
    const userPrompt = buildFactoryDecomposeUserPrompt(promptInputs);
    expect(coversRequirementBlocks(userPrompt, promptInputs)).toBe(true);
    expect(userPrompt).toContain('blk-REQ-1');
    expect(userPrompt).toContain('blk-REQ-2');
  });
});
