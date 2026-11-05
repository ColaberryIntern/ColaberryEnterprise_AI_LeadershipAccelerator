import { buildFactoryDecomposeInput, type FactoryDecomposeRequirementInput } from '../factoryDecomposeInput';
import {
  isExplicitlyNonBinding, readTriageClass, TRIAGE_PREFIX,
} from '../proposal/requirementTriage';
import { coversRequirementBlocks } from '../factoryDecomposePrompt';

/**
 * A row that obliges us to nothing must not force a task to cite it.
 *
 * SOURCE_COVERAGE demands that every block of kind 'requirement' be cited by some task. On
 * Herriman that meant 20 of 56 rows — the City's own procedure, Q&A rows and notes — each
 * pulling a task into existence. The decomposition generated on 5 Nov 2026 produced eight
 * tasks, FOUR of which (Review Proposals, Select Proposer, Negotiate Contract, Handle
 * Rejection) are the City's job, not ours.
 *
 * The fix demotes those rows to 'context' rather than dropping them, because their text is
 * often the most useful content in the set.
 */

const req = (over: Partial<FactoryDecomposeRequirementInput> = {}): FactoryDecomposeRequirementInput => ({
  id: 'REQ-001',
  statement: 'System must support bidirectional GIS integration.',
  kind: 'technical',
  priority: 'must',
  ...over,
});

const binding = `${TRIAGE_PREFIX} obligation - obligation on the bidder ("must")`;
const cityProcess = `${TRIAGE_PREFIX} city_process - describes the buyer's own process`;

describe('readTriageClass', () => {
  it('reads a stored verdict back', () => {
    expect(readTriageClass(cityProcess)).toBe('city_process');
    expect(readTriageClass(binding)).toBe('obligation');
  });

  it('returns null for a row that was never triaged', () => {
    // NULL IS NOT "non-binding". A project nobody triaged keeps every obligation it had.
    expect(readTriageClass(null)).toBeNull();
    expect(readTriageClass('')).toBeNull();
    expect(readTriageClass('Counsel reviewed this and it binds us.')).toBeNull();
  });
});

describe('isExplicitlyNonBinding fails safe', () => {
  it.each([
    ['no interpretation at all', null],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a human note with no verdict', 'Reviewed by counsel.'],
    ['an explicit obligation verdict', binding],
  ])('includes a row with %s', (_label, interpretation) => {
    expect(isExplicitlyNonBinding(interpretation)).toBe(false);
  });

  it.each([['city_process'], ['question'], ['note']])('excludes an explicit %s verdict', (cls) => {
    expect(isExplicitlyNonBinding(`${TRIAGE_PREFIX} ${cls} - reason`)).toBe(true);
  });
});

describe('buildFactoryDecomposeInput demotes rather than drops', () => {
  it('keeps a non-binding row in the prompt, as context', () => {
    const prepared = buildFactoryDecomposeInput({
      requirements: [req({ id: 'REQ-002', interpretation: cityProcess })],
    });
    const block = prepared.blocks.find((b) => b.id === 'blk-REQ-002');
    expect(block).toBeDefined();
    expect(block!.kind).toBe('context');
    // The text survives. Dropping it would lose scope detail no requirement states.
    expect(block!.text).toContain('GIS');
  });

  it('leaves a binding row citable', () => {
    const prepared = buildFactoryDecomposeInput({
      requirements: [req({ interpretation: binding })],
    });
    expect(prepared.blocks.find((b) => b.id === 'blk-REQ-001')!.kind).toBe('requirement');
  });

  it('leaves an UNTRIAGED row citable, so an untriaged project loses no coverage', () => {
    const prepared = buildFactoryDecomposeInput({ requirements: [req()] });
    expect(prepared.blocks.find((b) => b.id === 'blk-REQ-001')!.kind).toBe('requirement');
  });

  it('removes the coverage obligation for the demoted row and keeps it for the others', () => {
    // The end-to-end point: coversRequirementBlocks only demands 'requirement' blocks, so a
    // demoted row no longer forces a task into existence.
    const prepared = buildFactoryDecomposeInput({
      requirements: [
        req({ id: 'REQ-001', interpretation: binding }),
        req({ id: 'REQ-002', interpretation: cityProcess, statement: 'All Proposals will be reviewed by a Review Panel.' }),
      ],
    });
    const mandatory = prepared.promptInputs.sourceBlocks.filter((b) => b.kind === 'requirement');
    expect(mandatory.map((b) => b.id)).toEqual(['blk-REQ-001']);
  });

  it('the assembled prompt demands citations only for the binding rows', () => {
    const prepared = buildFactoryDecomposeInput({
      requirements: [
        req({ id: 'REQ-001', interpretation: binding }),
        req({ id: 'REQ-002', interpretation: cityProcess }),
      ],
    });
    const { buildFactoryDecomposeUserPrompt } = require('../factoryDecomposePrompt');
    const prompt = buildFactoryDecomposeUserPrompt(prepared.promptInputs);
    expect(prompt).toContain('blk-REQ-001');
    // coversRequirementBlocks is the real gate's own check; it must be satisfied.
    expect(coversRequirementBlocks(prompt, prepared.promptInputs)).toBe(true);
  });

  it('an all-non-binding set yields no mandatory citations at all, rather than silently none', () => {
    const prepared = buildFactoryDecomposeInput({
      requirements: [req({ id: 'REQ-001', interpretation: cityProcess })],
    });
    expect(prepared.promptInputs.sourceBlocks.filter((b) => b.kind === 'requirement')).toEqual([]);
    // The block is still present - the model sees it, nothing is hidden from it.
    expect(prepared.promptInputs.sourceBlocks).toHaveLength(1);
  });
});
