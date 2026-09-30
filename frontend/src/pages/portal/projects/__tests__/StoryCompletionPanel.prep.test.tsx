/**
 * StoryCompletionPanel — Demo Prep tasks are not verifiable, and must not
 * pretend to be.
 *
 * PREP-1..PREP-6 are the student's own work: rehearse, record, present. They
 * are generated with `acceptance: []` and never enter the published plan, so
 * the verifier's spec list has no entry for them and `verified_at` is never
 * stamped. Gating them on repo verification left the button dead forever while
 * the panel told students to push a commit that nothing would ever read.
 * Fleet-wide that was 150 of 150 prep tasks stuck, across every student who
 * reached Demo Prep.
 *
 * These tests assert on the WORDS, like the sibling panel tests: the copy is
 * the defect here, not the plumbing.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

import StoryCompletionPanel from '../StoryCompletionPanel';
import { StoryVerificationState } from '../useStoryVerification';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

/**
 * The exact state the live API returns for a task the platform has never
 * checked: no verdict, no criteria, no latch. Captured from production for
 * PREP-2 on 2026-08-24 (verified_at null, verification null, acceptance []).
 */
const unverified = (over: Partial<StoryVerificationState> = {}): StoryVerificationState => ({
  view: null,
  loaded: true,
  acceptance: [],
  isConfirmed: () => false,
  isJustConfirmed: () => false,
  verifiedAt: null,
  missing: [],
  blockedReason: null,
  readError: null,
  phase: 'idle',
  xpAwarded: 0,
  ...over,
} as StoryVerificationState);

function mount(storyKey: string, verif = unverified()) {
  root = createRoot(container);
  act(() => {
    root.render(
      <StoryCompletionPanel
        verif={verif}
        storyKey={storyKey}
        locallyDone={false}
        onMarkDone={() => undefined}
        onSkip={() => undefined}
      />,
    );
  });
}

const cta = () => Array.from(container.querySelectorAll('button'))
  .find((b) => /mark done/i.test(b.textContent || '')) as HTMLButtonElement | undefined;

describe('StoryCompletionPanel — Demo Prep', () => {
  it('does not tell a prep task to push a commit, because no commit can confirm it', () => {
    mount('PREP-2');
    expect(container.textContent).not.toMatch(/push a commit naming/i);
    expect(container.textContent).not.toMatch(/progress\.json/i);
  });

  it('says plainly that the student confirms this one', () => {
    mount('PREP-2');
    expect(container.textContent).toMatch(/You confirm this one yourself/i);
  });

  it('gives a prep task a live Mark done instead of a permanently dead button', () => {
    mount('PREP-2');
    const btn = cta();
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBe(false);
    expect(btn!.textContent).not.toMatch(/waiting on GitHub/i);
  });

  // CONTROL: a real story keeps the GitHub gate exactly as it was. If this ever
  // goes green alongside a broken prep case, the matcher has gone too wide.
  it('leaves a normal story gated on GitHub (control)', () => {
    // A real verifiable story HAS criteria; the old fixture gave it none,
    // which is exactly the state that now means 'nothing can verify this'.
    mount('STORY-001', unverified({ acceptance: ['The roster endpoint returns 200'] }));
    expect(container.textContent).toMatch(/push a commit naming STORY-001/i);
    const btn = cta();
    expect(btn!.disabled).toBe(true);
    expect(btn!.textContent).toMatch(/waiting on GitHub/i);
  });

  // CONTROL: the id shape matters. A story that merely mentions prep is not one.
  it('does not treat a lookalike id as self-directed (control)', () => {
    mount('STORY-PREP', unverified({ acceptance: ['An unauthenticated caller gets 401'] }));
    const btn = cta();
    expect(btn!.disabled).toBe(true);
  });
});

describe('StoryCompletionPanel — a story with no criteria at all', () => {
  /**
   * Reported by a learner: I have completed the steps but the story still
   * will not mark as complete. Her task was created outside the plan pipeline
   * and carried zero acceptance criteria, so the verifier had nothing to match
   * and the button could never unlock. Her GitHub side was healthy throughout.
   */
  it('lets the student close a task the verifier can never confirm', () => {
    mount('p1789142215938-t2');
    expect(container.textContent).not.toMatch(/Waiting on GitHub/i);
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => /mark done/i.test(b.textContent || ''));
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('still gates that same id once it DOES carry criteria', () => {
    // The rule is the criteria, not the id shape. A client-side id that later
    // gains real criteria goes back to being verified from the repo.
    mount('p1789142215938-t2', unverified({ acceptance: ['Given a roster, then it loads'], missing: ['Given a roster, then it loads'] }));
    expect(container.textContent).toMatch(/Waiting on GitHub/i);
  });

  it('does not unlock before the verdict has loaded', () => {
    // `acceptance` is empty while loading too. Unlocking then would hand every
    // story a live Mark done for the moment before its verdict arrives.
    mount('STORY-001', unverified({ loaded: false, acceptance: [] }));
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => /mark done/i.test(b.textContent || ''));
    expect(btn ? (btn as HTMLButtonElement).disabled : true).toBe(true);
  });
});
