/**
 * The Projects page renders its stories as the Classroom's cards.
 *
 * Ali, 2026-09-11: "The projects should have points instead of the open
 * button, just like the Classroom … Projects should look more like the
 * Classroom section." So a story goes through TimelineCard — the one universal
 * card — with the "+N pts" badge, the state pip, and a cherry "Build · +N pts"
 * CTA that hands the task to the page (which opens the workspace). The points
 * are paid when the platform verifies the story from the repo, never by a
 * click; the CTA says so on hover.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import ProjectInterior from '../ProjectInterior';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => { root.unmount(); }); document.body.removeChild(container); });
async function mount(ui: React.ReactElement) {
  await act(async () => { root = createRoot(container); root.render(ui); });
}

const task = (id: string, title: string, over: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id, title, storyId: id, state: 'todo', due: 'up', what: `do ${id}`, points: 57, ...over });

const project = (tasks: ProjectTask[]): StudentProject => ({
  id: 'p1', name: 'PropertyPulse AI', slug: 'ppa', descriptor: 'scores properties',
  accent: '#367895', cover: 'linear-gradient(#000,#111)', icon: 'M0 0h1',
  status: 'ready', createdAt: 1, stage: 'Release 0', curStep: 2, size: 'project',
  idea: 'x', reqs: [],
  lists: [{ id: 'L0', step: 2, name: 'Release 0 · Initial Property Analysis', sub: '', tasks }],
  activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
});

const noop = () => { /* */ };
const buttons = () => Array.from(container.querySelectorAll('button'));
const feedText = () => (container.querySelector('.te-grid .tl-de') as HTMLElement | null)?.textContent || '';

describe('a story is the Classroom card', () => {
  it('renders through TimelineCard, inside the .tl-de scope the card styles need', async () => {
    await mount(<ProjectInterior project={project([task('STORY-001', 'User selects location', { due: 'today' })])} onBack={noop} onOpenTask={noop} />);
    const card = container.querySelector('.te-grid .tl-de .fcard');
    expect(card).toBeTruthy();
    expect(container.querySelector('.pjt-card')).toBeNull();           // the old row is gone
  });

  it('wears the price tag and the release chip, and shows the due state instead of a difficulty word', async () => {
    await mount(<ProjectInterior project={project([task('STORY-001', 'User selects location', { due: 'today' })])} onBack={noop} onOpenTask={noop} />);
    const card = container.querySelector('.te-grid .tl-de .fcard') as HTMLElement;
    expect(card.querySelector('.tl-ptbadge')?.textContent).toBe('+57 pts');
    expect(card.textContent).toContain('Release 0 · Initial Property Analysis');
    expect(card.textContent).toContain('Due today');
    expect(card.textContent).not.toContain('core');
  });

  it('says "Build · +N pts" — not Open, not Collect — and hands the task to the page', async () => {
    const opened: string[] = [];
    await mount(<ProjectInterior project={project([task('STORY-001', 'User selects location')])} onBack={noop} onOpenTask={(id) => opened.push(id)} />);
    const cta = container.querySelector('.te-grid .fc-cta') as HTMLButtonElement;
    expect(cta.textContent).toContain('Build · +57 pts');
    expect(cta.textContent).not.toContain('Collect');
    expect(cta.className).toContain('cherry');
    expect(cta.title).toContain('verified work pays +57 pts');
    await act(async () => { cta.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opened).toEqual(['STORY-001']);
  });

  it('keeps Skip, under the card, for an open story only', async () => {
    await mount(<ProjectInterior project={project([
      task('STORY-001', 'Open one'),
      task('STORY-002', 'Done one', { state: 'done', due: 'done' }),
      task('STORY-003', 'Gated one', { blockedBy: ['STORY-001'] }),
    ])} onBack={noop} onOpenTask={noop} />);
    const skips = buttons().filter((b) => /Skip for now/.test(b.textContent || ''));
    expect(skips).toHaveLength(1);
  });

  it('renders a blocked story as a LOCKED card: no CTA, the gate named, nothing opens', async () => {
    const opened: string[] = [];
    await mount(<ProjectInterior project={project([task('STORY-009', 'Optimise performance', { blockedBy: ['STORY-000'] })])} onBack={noop} onOpenTask={(id) => opened.push(id)} />);
    const card = container.querySelector('.te-grid .tl-de .fcard') as HTMLElement;
    expect(card.className).toContain('locked');
    expect(card.querySelector('.fc-cta')).toBeNull();
    expect(card.textContent).toContain('STORY-000');
    for (const b of Array.from(card.querySelectorAll('button'))) {
      await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }
    expect(opened).toEqual([]);
  });

  it('shows a verified story compact with "Completed · +N pts", the Classroom\'s treatment of finished work', async () => {
    await mount(<ProjectInterior project={project([task('STORY-000', 'Command Center', { state: 'done', due: 'done', verifiedAt: '2026-09-11T12:00:00Z' })])} onBack={noop} onOpenTask={noop} />);
    const card = container.querySelector('.te-grid .tl-de .fcard') as HTMLElement;
    expect(card.className).toContain('compact');
    expect(card.textContent).toContain('Completed · +57 pts');
    expect(card.querySelector('.tl-ptbadge')?.className).toContain('earned');
  });

  it('never invents a price: an unpriced story shows no badge and a plain Start', async () => {
    await mount(<ProjectInterior project={project([task('STORY-001', 'Unpriced', { points: undefined })])} onBack={noop} onOpenTask={noop} />);
    expect(feedText()).not.toContain('pts');
    expect((container.querySelector('.te-grid .fc-cta') as HTMLElement).textContent).toMatch(/Start/);
  });
});
