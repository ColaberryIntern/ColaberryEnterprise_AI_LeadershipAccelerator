/**
 * AF12.19 - a builder's outline does not list twelve sections that can never fill.
 *
 * Ali, 2026-11-22, looking at a real builder's board: *"Are they not supposed to have any task in
 * the other stories?"* R1 through R9 and a superseded release all read `0/0`, and the reasonable
 * conclusion from that picture is that work went missing.
 *
 * Nothing was missing. An agent-domain board is created with THIRTEEN sections and only R0 can
 * hold anything: a capability story hangs on the rung its `starting_autonomy` names, every
 * capability names `autonomy:R0`, and the three pre-migration releases are kept deliberately as
 * the rollback path. Measured on the ten published v3 plans the same day: 598 stories, all on R0.
 *
 * So the fixture here is not a convenience shape, it is the real one, and the count twelve is the
 * thing being asserted.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';
import ProjectInterior from '../ProjectInterior';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: string): ProjectTask =>
  ({ id, title: id, storyId: id, state: 'todo', due: 'up', what: `do ${id}`, points: 10 } as ProjectTask);

const list = (id: string, name: string, n: number) =>
  ({ id, step: 2, name, sub: '', tasks: Array.from({ length: n }, (_, i) => task(`${id}-${i}`)) });

/** The ten rungs plus the three superseded releases, as `agentDomainReleaseLadder.ts` makes them. */
const AGENT_DOMAIN_LISTS = [
  list('autonomy:R0', 'R0 · Define the workflow, requirements, risks and human decisions (every capability starts here)', 3),
  ...Array.from({ length: 9 }, (_, i) => list(`autonomy:R${i + 1}`, `R${i + 1} · a rung nobody is on yet`, 0)),
  list('r0', 'Discovery and validation (superseded by the ladder)', 0),
  list('r1', 'Legacy migration plan (superseded by the ladder)', 0),
  list('r2', 'Capability development (superseded by the ladder)', 0),
];

const project = (lists = AGENT_DOMAIN_LISTS): StudentProject => ({
  id: 'p1', name: 'Marketing Intelligence & Brand', slug: 'mib', descriptor: 'the marketing domain',
  accent: '#367895', cover: 'linear-gradient(#000,#111)', icon: 'M0 0h1',
  status: 'ready', createdAt: 1, stage: 'R0', curStep: 2, size: 'project',
  idea: 'x', reqs: [], lists, activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
} as unknown as StudentProject);

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => {
  root = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  // Guarded, so a failed mount does not throw a second error on top of the real one.
  if (root) act(() => { root!.unmount(); });
  document.body.removeChild(container);
});

async function mount(p: StudentProject = project()) {
  const noop = () => { /* */ };
  await act(async () => {
    root = createRoot(container);
    root.render(<ProjectInterior project={p} onBack={noop} onOpenTask={noop} />);
  });
}

const rows = () => Array.from(container.querySelectorAll('.pj-outline .pj-olrow'))
  .map((el) => (el.querySelector('.nm')?.textContent ?? '').trim());
const toggle = () => container.querySelector('[data-testid="pj-outline-empty-toggle"]') as HTMLButtonElement | null;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const heading = () => container.querySelector('.te-sec-title')?.textContent ?? '';

describe("a builder's project outline", () => {
  it('lists only the section that holds work, not the twelve that cannot', async () => {
    await mount();
    const names = rows();
    expect(names).toContain('All tasks');
    expect(names.some((n) => n.startsWith('R0 ·'))).toBe(true);
    // The nine rungs above R0 and the three superseded releases are absent.
    expect(names.some((n) => /^R[1-9] ·/.test(n))).toBe(false);
    expect(names.some((n) => n.includes('superseded by the ladder'))).toBe(false);
  });

  it('says how many it is holding back, rather than silently dropping them', async () => {
    await mount();
    expect(toggle()?.textContent).toBe('Show 12 empty sections');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows every one of them on request, so the ladder ahead is still visible', async () => {
    await mount();
    await click(toggle() as HTMLElement);
    const names = rows();
    for (let i = 1; i <= 9; i += 1) expect(names.some((n) => n.startsWith(`R${i} ·`))).toBe(true);
    expect(names.filter((n) => n.includes('superseded by the ladder'))).toHaveLength(3);
    expect(toggle()?.textContent).toBe('Hide 12 empty sections');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses again', async () => {
    await mount();
    await click(toggle() as HTMLElement);
    await click(toggle() as HTMLElement);
    expect(rows().some((n) => /^R[1-9] ·/.test(n))).toBe(false);
    expect(toggle()?.textContent).toBe('Show 12 empty sections');
  });

  it('releases a selection that is about to be hidden, so the feed is not filtered to nothing', async () => {
    await mount();
    await click(toggle() as HTMLElement);
    const r4 = Array.from(container.querySelectorAll('.pj-outline .pj-olrow'))
      .find((el) => (el.querySelector('.nm')?.textContent ?? '').startsWith('R4 ·')) as HTMLElement;
    await click(r4);
    expect(heading()).toContain('R4 ·');
    // Collapsing while R4 is selected must not leave the feed pointed at a row that is gone.
    await click(toggle() as HTMLElement);
    expect(heading()).toBe('This build · next task due first');
  });

  it('leaves an ordinary build alone: every section has work, so there is no disclosure at all', async () => {
    await mount(project([
      list('r0', 'R0', 4), list('r1', 'R1', 4), list('r2', 'R2', 3),
    ]));
    expect(toggle()).toBeNull();
    expect(rows()).toEqual(['All tasks', 'R0', 'R1', 'R2']);
  });
});
