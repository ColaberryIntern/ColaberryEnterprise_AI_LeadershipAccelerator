import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import PlacementStudentsPage from '../PlacementStudentsPage';
import { fetchPrepStudents, fetchStudentPrep } from '../../../services/placementApi';

jest.mock('../../../services/placementApi', () => ({ fetchPrepStudents: jest.fn(), fetchStudentPrep: jest.fn() }));
const list = fetchPrepStudents as jest.Mock;
const one = fetchStudentPrep as jest.Mock;

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<PlacementStudentsPage />); });
  await flush();
}

afterEach(() => { act(() => root.unmount()); host.remove(); list.mockReset(); one.mockReset(); });

describe('Placement > Student prep', () => {
  it('lists students and says "Not enough data yet" instead of a zero', async () => {
    list.mockResolvedValue([
      { enrollmentId: 'e1', name: 'Ann Lee', lastObserved: '2026-11-15T16:00:00Z', observations: 12, readiness: 71.5 },
      { enrollmentId: 'e2', name: 'Bo Kim', lastObserved: '2026-11-14T16:00:00Z', observations: 2 },
    ]);
    await mount();
    const text = host.textContent ?? '';
    expect(text).toContain('Ann Lee');
    expect(text).toContain('71.5 / 100');
    expect(text).toContain('Not enough data yet');
    expect(text).not.toContain('0 / 100');
  });

  it('opens one student read-only, with no target when there is none', async () => {
    list.mockResolvedValue([{ enrollmentId: 'e1', name: 'Ann Lee', lastObserved: '2026-11-15T16:00:00Z', observations: 12 }]);
    one.mockResolvedValue({ readiness: { value: 68 }, skills: [
      { key: 'few_fillers', label: 'Few filler words', score: 88, count: 3, sources: ['video'] },
      { key: 'proof_of_work', label: 'Proof of work', count: 0, sources: [] },
    ], sources: {}, streak: 0, thisWeek: 0 });
    await mount();
    const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'View prep') as HTMLButtonElement;
    await act(async () => { button.click(); });
    await flush();
    const card = host.querySelector('[data-testid="placement-student-prep"]')?.textContent ?? '';
    expect(card).toContain('Readiness: 68 / 100');
    expect(card).toContain('Few filler words: 88');
    expect(card).not.toContain('ready at');
    expect(one).toHaveBeenCalledWith('e1');
  });

  it('the desk\'s Prep link (?student=<id>) opens that student, even one with no evidence listed yet (CP11.1b)', async () => {
    window.history.pushState({}, '', '/admin/placement/students?student=e9');
    list.mockResolvedValue([{ enrollmentId: 'e1', name: 'Ann Lee', lastObserved: '2026-11-15T16:00:00Z', observations: 12 }]);
    one.mockResolvedValue({ skills: [], sources: {}, streak: 0, thisWeek: 0 });
    await mount();
    expect(one).toHaveBeenCalledWith('e9');
    expect(host.querySelector('[data-testid="placement-student-prep"]')?.textContent).toContain('Readiness: Not enough data yet');
    window.history.pushState({}, '', '/');
  });

  it('says plainly when the viewer lacks the Placement section', async () => {
    list.mockRejectedValue({ response: { status: 403 } });
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('You do not have access to Placement.');
  });
});
