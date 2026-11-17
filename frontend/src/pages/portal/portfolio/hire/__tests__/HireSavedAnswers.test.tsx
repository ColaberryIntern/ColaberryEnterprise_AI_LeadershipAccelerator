import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { HireSavedAnswers } from '../HireSavedAnswers';

const mockList = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../../../../components/careerPrep/careerPrepApi', () => ({
  fetchSavedAnswersApi: (...a: unknown[]) => mockList(...a),
  deleteAnswerApi: (...a: unknown[]) => mockDelete(...a),
}));

const A = { attemptId: 'a1', question: 'Walk me through a project.', delivery: 89, seconds: 41, savedAt: '2026-11-16T23:00:00Z', streamUrl: '/s', posterUrl: '/p' };
let host: HTMLDivElement | null = null;
let root: Root | null = null;
async function mount(): Promise<HTMLDivElement> {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  await act(async () => { r.render(<HireSavedAnswers />); await Promise.resolve(); });
  return h;
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; mockList.mockReset(); mockDelete.mockReset(); });

describe('Saved practice answers (Career Prep R1.1)', () => {
  it('lists each saved answer to play, private to the student; Delete asks first, then removes it', async () => {
    mockList.mockResolvedValue([A]);
    mockDelete.mockResolvedValue(undefined);
    const h = await mount();
    expect(h.textContent).toContain('Only you can see these');
    expect(h.querySelector('[data-testid="hs-saved-a1"] video source')?.getAttribute('src')).toBe('/s');
    expect(h.textContent).toContain('Delivery 89');
    act(() => (h.querySelector('[data-testid="hs-saved-delete"]') as HTMLButtonElement).click());
    expect(mockDelete).not.toHaveBeenCalled();
    act(() => (h.querySelector('[data-testid="hs-saved-delete-confirm"]') as HTMLButtonElement).click());
    await flush();
    expect(mockDelete).toHaveBeenCalledWith('a1');
    expect(h.querySelector('[data-testid="hs-saved-a1"]')).toBeNull();
    expect(h.querySelector('[data-testid="hs-saved-empty"]')).not.toBeNull();
  });
  it('draws nothing when Career Prep is off for the student (the list is a 404)', async () => {
    mockList.mockRejectedValue({ response: { status: 404 } });
    const h = await mount();
    expect(h.querySelector('[data-testid="hs-saved"]')).toBeNull();
  });
});
