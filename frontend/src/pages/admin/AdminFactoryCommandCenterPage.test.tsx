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

describe('AdminFactoryCommandCenterPage', () => {
  it('renders the sample contract with its key sections and the sample banner', async () => {
    (factoryApi.getFactorySample as jest.Mock).mockResolvedValue(sampleView);
    await renderPage();

    const text = container.textContent ?? '';
    expect(text).toContain('AI Government Contract Finder');
    expect(text).toContain('Sample preview');
    expect(text).toContain('Passed');                 // gate stat card
    expect(text).toContain('Extract requirements');   // allocation + flow
    expect(text).toContain('Compliance Analyst');     // the agent's accountable human (oversight visible)
    expect(text).toContain('AI employee');            // roster badge for the agent

    // the write action is present but DISABLED (Phase 4)
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve process'));
    expect(approve).toBeDefined();
    expect(approve!.disabled).toBe(true);
  });

  it('shows an error message when the sample fails to load', async () => {
    (factoryApi.getFactorySample as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(container.textContent ?? '').toContain('Could not load the factory sample');
  });
});
