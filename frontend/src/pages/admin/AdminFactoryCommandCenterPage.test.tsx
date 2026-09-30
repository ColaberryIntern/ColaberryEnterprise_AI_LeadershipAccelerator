import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminFactoryCommandCenterPage from './AdminFactoryCommandCenterPage';
import * as factoryApi from '../../services/factoryApi';
import type { FactoryCommandCenterView } from '../../services/factoryApi';

// This repo has no @testing-library; component tests render via react-dom/client + act and read
// container.textContent (see components/admin/agentDetailV2/__tests__). The page uses useSearchParams,
// so it is wrapped in a MemoryRouter.
jest.mock('../../services/factoryApi');

const sampleView: FactoryCommandCenterView = {
  deliveryProjectId: 'dp-1',
  contractName: 'AI Government Contract Finder',
  isSample: true,
  gate: { ok: true, errorCount: 0, checks: [{ code: 'OVERSIGHT', label: 'Every AI task has an accountable human', ok: true }] },
  process: { id: 'PROC-1', businessOutcome: 'A traceable compliance matrix', successCriterion: 'every req mapped' },
  tracks: [
    { trackType: 'proposal', status: 'in_progress', owner: 'Proposal Lead', requirementIds: ['REQ-3'], linkedStudentProjectId: null },
    { trackType: 'solution_build', status: 'in_progress', owner: 'Compliance Analyst', requirementIds: ['REQ-1'], linkedStudentProjectId: 'sp-123456789' },
  ],
  flow: {
    nodes: [
      { id: 't-start', title: 'Solicitation received', kind: 'START', executorType: null, performerRole: null, accountableRole: null, method: 'EXPLICIT', confidence: null, sourceEvidence: [] },
      { id: 't-1', title: 'Extract requirements', kind: 'TASK', executorType: 'agent', performerRole: 'Extraction Agent', accountableRole: 'Compliance Analyst', method: 'LLM', confidence: 0.72, sourceEvidence: ['blk-1'] },
    ],
    edges: [{ from: 't-classify', to: 't-a', condition: 'administrative', isRework: false }],
  },
  allocation: [
    { taskId: 't-1', taskTitle: 'Extract requirements', executionClass: 'ai_with_approval', performer: 'Extraction Agent', accountable: 'Compliance Analyst', rationale: 'Pattern work the agent drafts.' },
  ],
  roster: [
    { roleId: 'r-agent', name: 'Requirement Extraction Agent', definition: 'Extracts requirements.', executorType: 'agent', isAgent: true, accountableHuman: 'Compliance Analyst' },
  ],
  compliance: [
    { id: 'REQ-1', statement: 'Extract requirements from a solicitation', kind: 'technical', priority: 'must', evidenceState: 'planned', tracks: ['solution_build'], citedBy: ['Extract requirements'] },
  ],
  roleMap: [{ previousFunction: 'Manual compliance reviewer', aiContribution: 'Extracts and classifies', newRole: 'Compliance Analyst', retained: ['approve the matrix'] }],
  workforce: { people: 2, agents: 1 },
  approval: null,
};

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><AdminFactoryCommandCenterPage /></MemoryRouter>);
  });
  // flush the mocked fetch resolution + the setState it triggers
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const realView: FactoryCommandCenterView = {
  ...sampleView,
  isSample: false,
  deliveryProjectId: 'dp-real',
  contractName: 'Demo contract',
  approval: { status: 'draft', level: null, version: 1, trackType: 'solution_build', enrichmentStatus: 'partial', contentHash: 'h' },
};

describe('AdminFactoryCommandCenterPage', () => {
  it('renders the sample (read-only) when there is no real contract, with Approve DISABLED', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([]); // no real contract → fall back to the sample
    (factoryApi.getFactorySample as jest.Mock).mockResolvedValue(sampleView);
    await renderPage();

    const text = container.textContent ?? '';
    expect(text).toContain('AI Government Contract Finder');
    expect(text).toContain('Sample preview');
    expect(text).toContain('Passed');                 // gate stat card
    expect(text).toContain('Extract requirements');   // allocation + flow
    expect(text).toContain('Compliance Analyst');     // the agent's accountable human (oversight visible)
    expect(text).toContain('AI employee');            // roster badge for the agent

    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve'));
    expect(approve).toBeDefined();
    expect(approve!.disabled).toBe(true);             // the sample is read-only
  });

  it('enables Approve for a real contract and approves it (level defaults to documented for a draft)', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    (factoryApi.approveFactoryContract as jest.Mock).mockResolvedValue({ id: 'd2', version: 2, status: 'documented' });
    await renderPage();

    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve'));
    expect(approve).toBeDefined();
    expect(approve!.disabled).toBe(false);            // enabled for a real contract

    await act(async () => { approve!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    expect(factoryApi.approveFactoryContract).toHaveBeenCalledWith('dp-real', expect.objectContaining({
      trackType: 'solution_build', expectedVersion: 1, level: 'documented',
    }));
  });

  it('shows an error message when loading fails', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([]);
    (factoryApi.getFactorySample as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(container.textContent ?? '').toContain('Could not load the factory command center');
  });

  it('shows the proposal-upload control for a real contract but NOT on the sample', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    await renderPage();
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(container.textContent ?? '').toContain('Upload proposal');
  });

  it('does not show the upload control on the read-only sample', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([]);
    (factoryApi.getFactorySample as jest.Mock).mockResolvedValue(sampleView);
    await renderPage();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('uploading a proposal calls ingestProposal and reloads the contract', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    (factoryApi.ingestProposal as jest.Mock).mockResolvedValue({ requirements: 3, blocks: 5, fileName: 'RFP.zip' });
    await renderPage();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['zip'], 'RFP.zip', { type: 'application/zip' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    expect(factoryApi.ingestProposal).toHaveBeenCalledWith('dp-real', file);
    expect((factoryApi.getFactoryContract as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2); // reloaded
    expect(container.textContent ?? '').toContain('Extracted 3 source-cited requirements');
  });

  it('shows the Generate decomposition control for a real contract but NOT on the sample', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    await renderPage();
    const generate = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate decomposition'));
    expect(generate).toBeDefined();
  });

  it('does not show the Generate decomposition control on the read-only sample', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([]);
    (factoryApi.getFactorySample as jest.Mock).mockResolvedValue(sampleView);
    await renderPage();
    const generate = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate decomposition'));
    expect(generate).toBeUndefined();
  });

  it('clicking Generate decomposition calls generateDecomposition and reloads the contract', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    (factoryApi.generateDecomposition as jest.Mock).mockResolvedValue({ accepted: true, errorCount: 0 });
    await renderPage();

    const generate = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate decomposition'))!;
    await act(async () => { generate.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    expect(factoryApi.generateDecomposition).toHaveBeenCalledWith('dp-real');
    expect((factoryApi.getFactoryContract as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2); // reloaded
    expect(container.textContent ?? '').toContain('Generated a task graph');
  });

  it('surfaces the gate-dirty (422) message honestly and reports nothing was saved', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    (factoryApi.generateDecomposition as jest.Mock).mockRejectedValue({ response: { status: 422, data: { errorCount: 4 } } });
    await renderPage();

    const generate = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate decomposition'))!;
    await act(async () => { generate.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    const text = container.textContent ?? '';
    expect(text).toContain('Generated 4 gate issues');
    expect(text).toContain('Nothing was saved');
  });

  it('surfaces the engine-off (409) message when generation is disabled', async () => {
    (factoryApi.listFactoryContracts as jest.Mock).mockResolvedValue([{ deliveryProjectId: 'dp-real', name: 'Demo', trackType: 'solution_build', status: 'draft', version: 1 }]);
    (factoryApi.getFactoryContract as jest.Mock).mockResolvedValue(realView);
    (factoryApi.generateDecomposition as jest.Mock).mockRejectedValue({ response: { status: 409, data: { generationDisabled: true } } });
    await renderPage();

    const generate = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Generate decomposition'))!;
    await act(async () => { generate.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent ?? '').toContain('The generation engine is off');
  });
});
