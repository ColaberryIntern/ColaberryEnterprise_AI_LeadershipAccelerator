import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { FitProofLine, INTAKE_HREF } from './FitProofLine';
import type { CapabilityItem } from '../../../services/factoryApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
async function render(cap: CapabilityItem): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<FitProofLine cap={cap} />); });
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const cap = (over: Partial<CapabilityItem>): CapabilityItem => ({ id: 'CAP-01', name: 'Capability One', why: '', assessment: 'have', matchedServiceId: 's1', rationale: '', ...over });

describe('FitProofLine', () => {
  it('"We have it" shows its confirmed case studies as chips', async () => {
    await render(cap({ evidence: [{ caseStudyId: 'c1', title: 'Case Study 1', sourceKind: 'inside' }, { caseStudyId: 'c2', title: 'Case Study 2', sourceKind: 'outside' }] }));
    expect(container.textContent).toContain('Inside · Case Study 1');
    expect(container.textContent).toContain('Drive · Case Study 2');
  });
  it('"We have it" with no linked case study says so', async () => {
    await render(cap({ evidence: [] }));
    expect(container.textContent).toContain('No confirmed case study is linked');
  });
  it('Partly/New shows possible unlinked proof with a link into Intake', async () => {
    await render(cap({ assessment: 'partial', possibleProof: [{ caseStudyId: 'c9', title: 'Case Study 9', sourceKind: 'outside', matchedTerms: ['monitoring'], linkedElsewhere: false }] }));
    expect(container.textContent).toContain('Possible unlinked proof');
    expect(container.textContent).toContain('waiting in Intake');
    expect(container.querySelector('a')?.getAttribute('href')).toBe(INTAKE_HREF);
  });
  it('an older saved Fit without the SV2 fields renders nothing', async () => {
    await render(cap({ assessment: 'new' }));
    expect(container.innerHTML).toBe('');
  });
});
