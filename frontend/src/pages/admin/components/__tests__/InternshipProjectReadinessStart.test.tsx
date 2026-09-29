import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import InternshipProjectReadiness from '../InternshipProjectReadiness';
import * as api from '../../../../services/adminInternshipApi';

/**
 * Starting a project straight from the roster.
 *
 * Ali, 2026-09-29: "I want to be able to create a project by clicking on a
 * button in the intern category... so it's easy for me to just click one button
 * and I'm already setting up a project."
 *
 * The row already knows who the intern is, so the button hands the ENROLLMENT
 * up — that is the identity the interview builds for, and getting it wrong
 * would start an interview for the wrong person while showing the right name.
 */

jest.mock('../../../../services/adminInternshipApi');
const mocked = api as jest.Mocked<typeof api>;

const row = (over: Partial<api.ProjectReadinessRow> = {}): api.ProjectReadinessRow => ({
  application_id: 'app-1',
  enrollment_id: 'enr-1',
  full_name: 'Harpreet Kaur',
  email: 'harpreet@example.com',
  weeks_done: 3,
  weeks_total: 3,
  training_ready: true,
  sessions_attended: 4,
  has_project: false,
  project_name: null,
  ready_for_project: true,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (
  rows: api.ProjectReadinessRow[],
  onStartProject?: (r: api.ProjectReadinessRow) => void,
) => {
  mocked.fetchInternshipProjectReadiness.mockResolvedValue({ interns: rows });
  await act(async () => {
    root.render(<InternshipProjectReadiness onSelect={jest.fn()} onStartProject={onStartProject} />);
  });
  await act(async () => { await Promise.resolve(); });
};

const buttons = (text: string): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll('button')).filter(
    (b) => (b.textContent || '').trim().toLowerCase().includes(text.toLowerCase()),
  ) as HTMLButtonElement[];

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the Start a project button', () => {
  it('hands up the ENROLLMENT, which is who the interview builds for', async () => {
    const onStartProject = jest.fn();
    await render([row()], onStartProject);
    act(() => { buttons('Start a project')[0].click(); });
    expect(onStartProject).toHaveBeenCalledWith(expect.objectContaining({
      enrollment_id: 'enr-1', full_name: 'Harpreet Kaur',
    }));
  });

  it('is offered to an intern who is not ready yet, quieter', async () => {
    // Readiness is a prompt, not a lock: Ali starts projects for people the
    // three-week gate has not passed, and the roster is where he sees that.
    const onStartProject = jest.fn();
    await render([row({ ready_for_project: false, training_ready: false, weeks_done: 0 })], onStartProject);
    const b = buttons('Start a project');
    expect(b).toHaveLength(1);
    expect(b[0].className).toContain('btn-outline-primary');
  });

  it('is NOT offered to an intern who already has a project', async () => {
    // A second interview for someone mid-build would mint a second project and
    // move their portal to it. The roster says "assigned" for a reason.
    const onStartProject = jest.fn();
    await render([row({ has_project: true, project_name: 'PropertyPulse AI' })], onStartProject);
    expect(buttons('Start a project')).toHaveLength(0);
  });

  it('leaves Open working, so the row still opens the applicant', async () => {
    const onSelect = jest.fn();
    mocked.fetchInternshipProjectReadiness.mockResolvedValue({ interns: [row()] });
    await act(async () => {
      root.render(<InternshipProjectReadiness onSelect={onSelect} onStartProject={jest.fn()} />);
    });
    await act(async () => { await Promise.resolve(); });
    act(() => { buttons('Open')[0].click(); });
    expect(onSelect).toHaveBeenCalledWith('app-1');
  });

  it('renders nothing new when no handler is wired, so the old page is unchanged', async () => {
    await render([row()]);
    expect(buttons('Start a project')).toHaveLength(0);
    expect(buttons('Open')).toHaveLength(1);
  });
});
