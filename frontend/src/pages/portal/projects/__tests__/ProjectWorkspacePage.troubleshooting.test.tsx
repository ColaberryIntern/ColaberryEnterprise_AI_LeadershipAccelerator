/**
 * ProjectWorkspacePage — the two ways a stuck student gets unstuck, and the
 * layout bug that hid the first one.
 *
 * Swati Raman asked for a way to paste an error or a screenshot instead of
 * typing the problem out. It already existed: Cory's rail greets every story
 * with "Stuck on an error? Paste or drag a screenshot straight in", and paste,
 * drag-drop and an attach button are all wired. She never saw it, and the CSS
 * says why.
 *
 *  1. THE STACKED RAIL HAD NO CEILING (761-900px). `.rt` is
 *     `position:fixed;inset:0`, so the page cannot scroll; `.rt-body` holds the
 *     two columns and declares no overflow. Below 900px `.rt-body` turns into a
 *     column and the rail stacks under the story. The rail is `flex:none`, so
 *     with no height cap its height is its CONTENT height — and `.rt-thread`
 *     grows with the conversation. The rail therefore expands without bound,
 *     squeezes `.rt-mid` toward zero (it is `overflow-y:auto`, so its automatic
 *     minimum size is zero and it will happily shrink away), and pushes the ask
 *     box off a viewport that offers no scrollbar to chase it with. The cap
 *     that fixes this — `min-height:250px;max-height:48vh` — existed, but only
 *     inside `@media(max-width:760px)`, leaving 761-900px unguarded. The cap
 *     belongs to the whole stacked range, which starts at 900px.
 *
 *     Note the source-order trap this test also pins: the `@media(max-width:900px)`
 *     block near the top of the sheet sits ABOVE the base `.rt-mentor` rule, so
 *     at equal specificity the base rule wins any property it also sets — which
 *     is why that block needs `!important` for `width`, and why a `min-height`
 *     written there would lose to the base rule's `min-height:0` and silently do
 *     nothing. The cap must be declared AFTER the base rule.
 *
 *  2. TWO CLEARLY LABELLED DOORS. Cory knows the platform — the enrollment, the
 *     story, what the portal thinks. Claude Code knows the student's code and
 *     can actually fix it, but knows nothing about the portal. A student who
 *     pastes "the portal says 0 of 3" into Claude Code gets a confident wrong
 *     answer; that is how Million Abate spent a day pushing code at a problem
 *     that was a missing criteria block. The page must say which door is which,
 *     in language a non-technical student can act on — Chukwuemeka Eneh wrote in
 *     saying he could not understand our instructions at all, and he is not the
 *     only one.
 *
 * Uses the `createRoot` + `act` pattern already proven in this repo — there is
 * no `@testing-library/*` dependency here and adding one for a test would be a
 * drive-by install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

// Swapped per test. `mock`-prefixed so babel-plugin-jest-hoist allows the
// factory below to close over it.
let mockProject: StudentProject | null = null;

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ projectId: 'p1', taskId: 'STORY-004' }),
  useNavigate: () => () => { /* the page never navigates in these tests */ },
  useLocation: () => ({ state: null }),
}));
jest.mock('../projectSync', () => ({
  __esModule: true,
  refreshProjectsFromBackend: () => Promise.resolve(),
  syncProjectsWithBackend: () => Promise.resolve(),
}));
// Plain functions, not jest.fn(): CRA sets `resetMocks: true`, which strips the
// implementation off every jest.fn before each test and would leave these
// returning undefined where the page expects a promise.
jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { post: () => Promise.resolve({ data: { reply: 'ok' } }) },
}));
jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  // No repo on day one is the normal state, not an error — same as production.
  getWorkspaceRepo: () => Promise.resolve(null),
  provisionWorkspaceRepo: () => Promise.resolve(null),
  syncWorkspaceRepo: () => Promise.resolve(null),
  startRepoConnect: () => Promise.resolve(null),
  confirmRepoConnect: () => Promise.resolve(null),
  downloadDocsBundle: () => Promise.resolve({ blob: new Blob(), filename: 'x.zip' }),
  connectErrorOf: (_e: unknown, fallback: string) => ({ error: fallback, error_class: null }),
  // A story the platform has never looked at answers 404.
  getStoryVerification: () => Promise.reject(new Error('404')),
}));
jest.mock('../projectsStore', () => ({
  ...jest.requireActual('../projectsStore'),
  getProject: () => mockProject,
}));

import ProjectWorkspacePage from '../ProjectWorkspacePage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout, so the mentor rail's auto-scroll would throw.
(Element.prototype as any).scrollIntoView = () => { /* no layout in jsdom */ };

let container: HTMLDivElement;
let root: Root;

const TASK: ProjectTask = {
  id: 'p1-STORY-004', storyId: 'STORY-004', title: 'STORY-004 · Take a deposit',
  what: 'A client pays a deposit when they book, so no-shows cost the salon nothing.',
  req: 'R2', prompt: 'Build the deposit-taking slice end to end.', state: 'todo', due: 'today',
  acceptance: ['Given a booking, when the client pays, then the slot is held'],
};

const project = (over: Partial<StudentProject> = {}): StudentProject => ({
  id: 'p1', name: 'Hair Salon Booking', slug: 'salon', descriptor: '',
  accent: '#367895', cover: '', icon: 'M0 0h1', status: 'ready', createdAt: 1,
  stage: 'Release 1', curStep: 3, size: 'project', idea: '', reqs: [],
  lists: [{ id: 'L1', step: 2, name: 'Release 1 · Payments', sub: '', tasks: [TASK] }],
  activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  mockProject = project();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount() {
  await act(async () => { root = createRoot(container); root.render(<ProjectWorkspacePage />); });
}

/**
 * The injected stylesheet with all whitespace stripped, so an assertion pins
 * the RULE rather than the indentation it happens to be written with. jsdom has
 * no layout engine, so — exactly as `ProjectWorkspacePage.halfwidth.test.tsx`
 * does — the CSS text itself is the thing under test.
 */
const cssCompact = (): string =>
  (container.querySelector('style')!.textContent || '').replace(/\s+/g, '');

const textOf = (): string => (container.textContent || '').replace(/\s+/g, ' ');

const buttonSaying = (text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').trim() === text);

describe('the stacked mentor rail keeps a reachable paste box', () => {
  it('caps the rail across the WHOLE stacked range, not just at half screen', async () => {
    await mount();
    const css = cssCompact();

    const cap = css.indexOf('max-height:48vh');
    const halfScreen = css.indexOf('@media(max-width:760px)');

    expect(cap).toBeGreaterThan(-1);
    expect(halfScreen).toBeGreaterThan(-1);
    // The cap must be declared BEFORE the half-screen block, i.e. it belongs to
    // a wider media query. If it only lives inside `@media(max-width:760px)`,
    // the 761-900px band has an unbounded rail and the ask box escapes.
    expect(cap).toBeLessThan(halfScreen);
  });

  it('declares the cap after the base .rt-mentor rule, or min-height:0 wins', async () => {
    await mount();
    const css = cssCompact();

    // The base rule sets `min-height:0`. A cap written in the 900px block that
    // sits ABOVE this rule loses to it on source order at equal specificity.
    const baseRule = css.indexOf('.rt-mentor{width:340px');
    const cap = css.indexOf('min-height:250px');

    expect(baseRule).toBeGreaterThan(-1);
    expect(cap).toBeGreaterThan(-1);
    expect(cap).toBeGreaterThan(baseRule);
  });

  it('gives the stacked body an overflow so nothing escapes the fixed viewport', async () => {
    await mount();
    // `.rt` is position:fixed;inset:0 — there is no page scroll to recover
    // anything that overflows `.rt-body`.
    expect(cssCompact()).toContain('@media(max-width:900px){.rt-body{overflow:hidden}.rt-mentor{min-height:250px;max-height:48vh}}');
  });
});

describe('two clearly labelled troubleshooting doors', () => {
  it('names both helpers and what each one can actually see', async () => {
    await mount();
    const text = textOf();

    expect(text).toContain('Cory');
    expect(text).toContain('Claude Code');
    // The distinction that decides which door a student should pick.
    expect(text).toMatch(/Cory[^.]*this page/i);
    expect(text).toMatch(/Claude Code[^.]*code on your computer/i);
  });

  it('offers either Cory or Claude, and names Claude Code the more direct route inside the project', async () => {
    await mount();
    const text = textOf();
    // Swati Raman reviewed the earlier, stricter routing copy and asked for
    // this framing instead: help is available from either helper, and Claude
    // Code is the more direct one when the student is troubleshooting inside
    // the project they are actively building.
    expect(text).toMatch(/either Cory or Claude/i);
    expect(text).toMatch(/Claude Code[^.]*more direct/i);
  });

  it('keeps the portal caveat as a short note, without the confident-wrong-answer warning', async () => {
    await mount();
    const text = textOf();
    // The caveat still earns its place: a portal question belongs with Cory.
    expect(text).toMatch(/cannot see the portal/i);
    expect(text).toContain('Cory');
    // But it must not read as a reason to avoid Claude Code, which is what the
    // previous wording did.
    expect(text).not.toMatch(/confidently/i);
    expect(text).not.toMatch(/will be wrong/i);
  });

  it('says a screenshot can be pasted instead of typing the problem out', async () => {
    await mount();
    expect(textOf()).toMatch(/screenshot/i);
  });

  it('offers a copyable Claude Code troubleshooting prompt, distinct from the build prompt', async () => {
    await mount();
    // A second button labelled plain "Copy" would be ambiguous next to the
    // build prompt's Copy, so the troubleshooting one names itself.
    expect(buttonSaying('Copy the troubleshooting prompt')).toBeTruthy();
    expect(buttonSaying('Copy')).toBeTruthy();
  });

  it('keeps the prompt collapsed on arrival, so it cannot swallow a half-screen column', async () => {
    await mount();
    // Same invariant the build prompt is held to — see
    // ProjectWorkspacePage.halfwidth.test.tsx. Copy stays reachable regardless.
    expect(container.querySelector('#rt-troubleshoot-prompt')).toBeNull();
    expect(buttonSaying('Copy the troubleshooting prompt')).toBeTruthy();
    const toggle = buttonSaying('Show the prompt');
    expect(toggle).toBeTruthy();
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');
  });

  it('the troubleshooting prompt tells Claude Code to stop if the problem is the portal', async () => {
    await mount();
    await act(async () => { buttonSaying('Show the prompt')!.click(); });
    const pre = container.querySelector('#rt-troubleshoot-prompt');
    expect(pre).toBeTruthy();
    const body = (pre!.textContent || '').replace(/\s+/g, ' ');
    // The guard that stops Claude Code guessing about a page it cannot see.
    expect(body).toMatch(/cannot see/i);
    expect(body).toMatch(/Cory/);
    // It must carry the story the student actually has open.
    expect(body).toContain('STORY-004');
  });
});
