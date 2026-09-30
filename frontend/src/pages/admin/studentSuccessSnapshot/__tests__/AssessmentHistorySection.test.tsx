import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AssessmentHistorySection from '../AssessmentHistorySection';
import { fetchAssessmentHistory, StudentAssessment } from '../../../../services/assessmentHistoryApi';

jest.mock('../../../../services/assessmentHistoryApi', () => ({
  ...jest.requireActual('../../../../services/assessmentHistoryApi'),
  fetchAssessmentHistory: jest.fn(),
}));

const mockFetch = fetchAssessmentHistory as jest.Mock;

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => { root.render(node); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function assessment(overrides: Partial<StudentAssessment> = {}): StudentAssessment {
  return {
    id: 'a1', enrollmentId: 'enrollment-1', status: 'watch', confidenceScore: 60, confidenceBand: 'moderate',
    primaryRootCause: 'time_management_problem', secondaryRootCause: null,
    supportingEvidence: [{ category: 'attendance', summary: '4/10 sessions attended (40%)', sourceSystem: 'attendance', sourceRecordIds: ['r1'], observedAt: null }],
    contradictingEvidence: [], excludedEvidence: [], positiveMomentumSignals: [], unansweredQuestions: [],
    recommendedIntervention: 'Schedule a check-in about pacing.', requiresHumanReview: false,
    reassessmentDate: '2026-09-20T00:00:00.000Z', rulesVersion: 'checkpoint-d-v1', model: 'gpt-4o-mini',
    llmCostUsd: 0.0002, createdAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('AssessmentHistorySection', () => {
  it('honesty boundary: no assessments have ever been run shows an honest empty message, not a fabricated row', async () => {
    mockFetch.mockResolvedValue([]);

    await render(<AssessmentHistorySection enrollmentId="enrollment-1" />);

    expect(container.textContent).toContain('No assessments have been run for this student yet.');
  });

  it('happy path: real assessment rows render with status and confidence', async () => {
    mockFetch.mockResolvedValue([assessment()]);

    await render(<AssessmentHistorySection enrollmentId="enrollment-1" />);

    expect(mockFetch).toHaveBeenCalledWith('enrollment-1');
    expect(container.textContent).toContain('watch');
    expect(container.textContent).toContain('60/100');
    expect(container.textContent).not.toContain('Needs review');
  });

  it('a requires_human_review assessment shows the "Needs review" flag', async () => {
    mockFetch.mockResolvedValue([assessment({ status: 'critical', requiresHumanReview: true })]);

    await render(<AssessmentHistorySection enrollmentId="enrollment-1" />);

    expect(container.textContent).toContain('Needs review');
  });

  it('expanding a row reveals supporting evidence and the recommended intervention, collapsed by default', async () => {
    mockFetch.mockResolvedValue([assessment()]);
    await render(<AssessmentHistorySection enrollmentId="enrollment-1" />);

    expect(container.textContent).not.toContain('Schedule a check-in about pacing.');

    const button = container.querySelector('button') as HTMLButtonElement;
    await act(async () => { button.click(); });

    expect(container.textContent).toContain('Schedule a check-in about pacing.');
    expect(container.textContent).toContain('4/10 sessions attended');
  });

  it('fail-safe: a fetch failure degrades to the honest empty state, never throws or shows stale data', async () => {
    mockFetch.mockRejectedValue(new Error('DB connection lost'));

    await render(<AssessmentHistorySection enrollmentId="enrollment-1" />);

    expect(container.textContent).toContain('No assessments have been run for this student yet.');
  });
});
