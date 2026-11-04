/**
 * reviseProposalDocumentAI — OpenAI mocked. No key → error; no failing findings → returns the sanitized current
 * content without a call; a happy revision returns sanitized HTML + structured gaps; an upstream error fails soft.
 */
const createMock = jest.fn();
jest.mock('../../../openaiInstrumented', () => ({ getInstrumentedOpenAI: () => ({ chat: { completions: { create: (...a: any[]) => createMock(...a) } } }) }));

import { reviseDocument } from '../reviseProposalDocumentAI';
import type { Grounding } from '../proposalGrounding';
import type { CheckFinding } from '../proposalReviewTypes';

const g: Grounding = { title: 't', scoringFactors: [], rules: [], pageBudget: null, requirements: [], sections: [], artifacts: [], facts: ['Years: 8'] };
const failing: CheckFinding[] = [{ check: 'coverage', severity: 'major', message: 'R1 not answered', sectionKey: 'R1' }];
const reply = (obj: any) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

beforeEach(() => { jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'k'; });
afterAll(() => { delete process.env.OPENAI_API_KEY; });

describe('reviseDocument', () => {
  it('returns an error without a key (fail-soft, never throws)', async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await reviseDocument('<p>x</p>', failing, g)).error).toBeTruthy();
  });

  it('with no failing findings, returns the sanitized current content and makes no call', async () => {
    const r = await reviseDocument('<p>fine</p>', [{ check: 'clarity', severity: 'minor', message: 'nit' }], g);
    expect(r.html).toContain('fine');
    expect(r.gaps).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('revises failing sections: sanitized HTML + structured gaps', async () => {
    createMock.mockResolvedValue(reply({ html: '<p>Revised with <script>evil()</script> figure.</p>', gaps: [{ question: 'Who is the PM?', suggestions: ['Jane'] }], changeSummary: 'Fixed coverage.' }));
    const r = await reviseDocument('<p>old</p>', failing, g);
    expect(r.html).toContain('Revised');
    expect(r.html).not.toContain('<script'); // sanitized
    expect(r.gaps).toEqual([{ question: 'Who is the PM?', suggestions: ['Jane'] }]);
    expect(r.changeSummary).toBe('Fixed coverage.');
  });

  it('fails soft on an upstream error', async () => {
    createMock.mockRejectedValue(new Error('429'));
    expect((await reviseDocument('<p>x</p>', failing, g)).error).toBeTruthy();
  });
});
