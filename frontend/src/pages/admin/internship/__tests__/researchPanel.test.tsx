import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ResearchPanel from '../researchPanel';

/**
 * The research panel.
 *
 * It is evidence, not an answer, so the things worth asserting are: that it costs nothing until
 * asked, that every lead carries where it came from, and that a question nothing could evidence is
 * shown loudly rather than quietly dropped. That last one is the whole value of the panel: it is
 * the only place the screen admits what it does not know.
 */

const mockFetch = jest.fn();
jest.mock('../../../../services/internNudgeApi', () => ({
  fetchResearchPacket: (...a: unknown[]) => mockFetch(...a),
  LEAD_LABEL: {
    source: 'In the shipped code',
    agent: 'In the agent registry',
    person: 'In the access records',
    domain: 'Domain ownership',
  },
}));

const packet = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1',
  generatedAt: new Date().toISOString(),
  questions: [{ receivedAt: '2026-11-10T16:00:00Z', subject: 'The Apollo agent and Roselyn', text: 'Is ApolloWeeklyEnrollmentAgent running? '.repeat(20) }],
  leads: [
    { kind: 'agent', term: 'ApolloWeeklyEnrollmentAgent', finding: 'Apollo Weekly Enrollment is DISABLED in the registry. Schedule 0 14 * * 1-5.', evidence: 'ai_agents row in the production database' },
    { kind: 'person', term: 'Roselyn', finding: 'Roselyn holds the management role "revenue" with extra section grants: none.', evidence: 'community_members.mgmt_role and mgmt_extra_sections' },
  ],
  needsHuman: ['"What did DA mean?" has nothing in it that resolves to a record.'],
  notes: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const mount = async (node: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(node); });
};
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
const button = (text: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

beforeEach(() => { jest.clearAllMocks(); mockFetch.mockResolvedValue(packet()); });
afterEach(async () => { await act(async () => { root?.unmount(); }); container?.remove(); });

describe('it costs nothing until asked', () => {
  it('fetches no packet on mount', async () => {
    await mount(<ResearchPanel enrollmentId="e1" />);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(button('Research their questions')).toBeTruthy();
  });

  it('fetches for that intern when asked', async () => {
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    expect(mockFetch).toHaveBeenCalledWith('e1');
  });
});

describe('evidence, not an answer', () => {
  it('shows every lead with where it came from', async () => {
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    const text = container.textContent ?? '';
    expect(text).toContain('DISABLED in the registry');
    expect(text).toContain('ai_agents row in the production database');
    expect(text).toContain('community_members.mgmt_role');
  });

  it('labels the kind of record each lead came from', async () => {
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    expect(container.textContent).toContain('In the agent registry');
    expect(container.textContent).toContain('In the access records');
  });

  /** The one thing on the panel only a person can act on. Hiding it makes a known gap a silent one. */
  it('says loudly which questions only a human can answer', async () => {
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    expect(container.textContent).toContain('Only you can answer these');
    expect(container.textContent).toContain('What did DA mean?');
  });

  it('shows the full question, not a snippet', async () => {
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    expect(container.textContent).toContain('characters');
    expect(container.querySelector('.aint-rq-text')?.textContent?.length ?? 0).toBeGreaterThan(400);
  });
});

describe('failure', () => {
  it('says what went wrong and leaves the button usable', async () => {
    mockFetch.mockRejectedValue({ response: { data: { error: 'The source tree was unreadable.' } } });
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    expect(container.textContent).toContain('The source tree was unreadable.');
    expect(button('Research their questions')).toBeTruthy();
  });

  it('renders nothing alarming when a packet resolves to no leads at all', async () => {
    mockFetch.mockResolvedValue(packet({ leads: [], needsHuman: [], notes: ['No unanswered question was found.'] }));
    await mount(<ResearchPanel enrollmentId="e1" />);
    await click(button('Research their questions'));
    expect(container.textContent).toContain('No unanswered question was found.');
    expect(container.textContent).not.toContain('Only you can answer these');
  });
});
