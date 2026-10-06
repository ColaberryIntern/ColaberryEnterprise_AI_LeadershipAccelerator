import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import LiveMiniPlayer from '../LiveMiniPlayer';
import { BroadcastPlayerProvider, useBroadcastPlayer, BroadcastSession } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { GrantResponse } from '../../../services/broadcastPlaybackAdapter';

/**
 * axe-core sweep of the player subtree: zero `wcag2a` / `wcag2aa` violations, in both themes.
 *
 * WHAT THIS CATCHES THAT THE HAND-WRITTEN CHECKS CANNOT. The sibling presentation suite
 * asserts the obligations I thought of — names, roles, pressed state, tab order, the live
 * region. The value of a sweep is the rules nobody thought of, which is why it runs over the
 * whole subtree in several states rather than over a list of selectors.
 *
 * WHAT IT DOES NOT CATCH, STATED RATHER THAN IMPLIED. jsdom has no layout and no paint, so
 * axe cannot compute colour contrast here: `color-contrast` comes back INCOMPLETE, not
 * passed. The last test in this file pins that fact, so nobody later reads a green run as
 * contrast coverage. Contrast needs a browser-based run, which belongs with the Playwright
 * work that P3-04 unblocks.
 *
 * WHY `incomplete` IS ASSERTED AND NOT JUST `violations` — this is the whole reason the sweep
 * is worth anything here. A mutation that put `aria-hidden="true"` on the focusable `<video>`
 * SURVIVED the first version of this file. `aria-hidden-focus` is tagged `wcag2a`, so it was
 * in scope; but without layout axe cannot decide whether the hidden subtree is focusable, so
 * it reported INCOMPLETE rather than a violation — and a sweep that only reads `violations`
 * files a real defect under "could not check" and goes green. So the incomplete set is pinned
 * to a known baseline: anything NEW appearing there is a rule that stopped being verifiable,
 * which is a finding, not a pass.
 *
 * axe-core is a declared devDependency (added 2026-10-06 with Ali's approval) rather than a
 * transitive one reached into, so an unrelated react-scripts upgrade cannot silently delete
 * this suite's only tool.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OCC = '11111111-2222-4333-8444-555555555555';
const WCAG: string[] = ['wcag2a', 'wcag2aa'];

const grant = (asset: string): GrantResponse => ({
  url: `/bm/broadcast/${OCC}/${asset}?e=${Date.now() + 120_000}&s=sig`,
  expires_at: Date.now() + 120_000,
  ttl_seconds: 120,
  grant: 'full',
  preview_seconds_remaining: 600,
});

const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();

let container: HTMLDivElement;
let root: Root;

function Opener({ session }: { session: BroadcastSession }) {
  const { open } = useBroadcastPlayer();
  return <button type="button" data-testid="open" onClick={() => open(session)}>open</button>;
}

const SESSION: BroadcastSession = {
  occurrenceId: OCC, asset: 'replay.mp4', title: 'Week 9 class', captionsAsset: 'captions.vtt',
};

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ParticipantAuthProvider>
        <BroadcastPlayerProvider>
          <Opener session={SESSION} />
          <LiveMiniPlayer fetchGrant={fetchGrant} />
        </BroadcastPlayerProvider>
      </ParticipantAuthProvider>,
    );
  });
  await click('open');
}

const find = (testid: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testid}"]`);

async function click(testid: string): Promise<void> {
  const el = find(testid);
  if (!el) throw new Error(`nothing to click: ${testid}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** The player subtree only: the surrounding test harness is not under audit. */
function player(): HTMLElement {
  const el = find('live-mini-player');
  if (!el) throw new Error('the player is not rendered');
  return el;
}

async function sweep(): Promise<axe.AxeResults> {
  return axe.run(player(), { runOnly: { type: 'tag', values: WCAG } });
}

/** A readable failure: rule id, impact, and the node that triggered it. */
function describeViolations(results: axe.AxeResults): string[] {
  return results.violations.map(
    (v) => `${v.id} [${v.impact ?? 'n/a'}] ${v.help} — ${v.nodes.map((n) => n.html).join(' | ')}`,
  );
}

/**
 * A TOOLING limit: needs layout or paint, which jsdom has neither of. Verified against axe
 * 4.11.1 rather than assumed — axe even throws on `getContext` here, because the optional
 * `canvas` package is absent. Covering this needs a browser-based run.
 */
const NEEDS_A_REAL_BROWSER: ReadonlyArray<string> = ['color-contrast'];

/**
 * A REAL, OPEN PRODUCT GAP — not a tooling limit, and deliberately not suppressed.
 *
 * WCAG 1.2.2 (AA) requires captions for prerecorded video. axe reports `video-caption` as
 * incomplete for any `<video>` with no `<track>`, and for a class replay that is the correct
 * answer: an uncaptioned recording is not accessible. This player can only offer captions
 * when the occurrence reports a `captionsAsset`, and nothing supplies one until P6-02b lands
 * the replay captions status.
 *
 * The gap is therefore in the pipeline, not in the player — and that claim is bounded by a
 * test below: with a captions asset enabled, the rule RESOLVES rather than staying unchecked.
 * This entry comes off the list when P6-02b supplies captions for real replays.
 */
const OPEN_PENDING_CAPTIONS_PIPELINE: ReadonlyArray<string> = ['video-caption'];

const KNOWN_UNCHECKED = [...NEEDS_A_REAL_BROWSER, ...OPEN_PENDING_CAPTIONS_PIPELINE];

function unexpectedlyUnchecked(results: axe.AxeResults): string[] {
  return results.incomplete
    .map((r) => r.id)
    .filter((id) => !KNOWN_UNCHECKED.includes(id))
    .sort();
}

/** Both halves of the audit: nothing failed, and nothing quietly went unchecked. */
function auditFindings(results: axe.AxeResults): { violations: string[]; unchecked: string[] } {
  return { violations: describeViolations(results), unchecked: unexpectedlyUnchecked(results) };
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
});

beforeEach(() => {
  fetchGrant.mockImplementation((_occ: string, asset: string) => Promise.resolve(grant(asset)));
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('the sweep is really running', () => {
  // A green axe run over nothing looks identical to a green axe run over a clean subtree.
  it('audits the player subtree and evaluates a non-trivial number of rules', async () => {
    await mount();
    const results = await sweep();
    const evaluated = results.passes.length + results.violations.length + results.incomplete.length;
    expect(evaluated).toBeGreaterThan(5);
    expect(results.testEngine.name).toBe('axe-core');
  }, 30_000);
});

describe.each([
  ['light', null],
  ['dark', 'dark'],
])('zero wcag2a/wcag2aa violations in the %s theme', (_label, theme) => {
  beforeEach(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  });

  it('with the full control set showing', async () => {
    await mount();
    expect(auditFindings(await sweep())).toEqual({ violations: [], unchecked: [] });
  }, 30_000);

  it('in theater mode', async () => {
    await mount();
    await click('lmp-theater');
    expect(auditFindings(await sweep())).toEqual({ violations: [], unchecked: [] });
  }, 30_000);

  it('with captions enabled', async () => {
    await mount();
    await click('lmp-captions');
    expect(auditFindings(await sweep())).toEqual({ violations: [], unchecked: [] });
  }, 30_000);

  it('RESOLVES video-caption once a track is present — the gap is the pipeline, not the player', async () => {
    await mount();
    const before = await sweep();
    expect(before.incomplete.map((r) => r.id)).toContain('video-caption');

    await click('lmp-captions');

    const after = await sweep();
    expect(after.passes.map((r) => r.id)).toContain('video-caption');
    expect(after.incomplete.map((r) => r.id)).not.toContain('video-caption');
  }, 30_000);

  it('in the denied state, where the status text and the upgrade link appear', async () => {
    fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'not_entitled', offer_upgrade: true } } });
    await mount();
    expect(auditFindings(await sweep())).toEqual({ violations: [], unchecked: [] });
  }, 30_000);
});

describe('the limits of a jsdom sweep, stated so a green run is not over-read', () => {
  it('does NOT evaluate colour contrast — jsdom has no paint, so axe cannot compute it', async () => {
    await mount();
    const results = await sweep();
    const evaluated = new Set([...results.passes, ...results.violations].map((r) => r.id));
    // If this ever starts failing, contrast has become computable here and the note in this
    // file's header — and in the session log — needs correcting rather than deleting.
    expect(evaluated.has('color-contrast')).toBe(false);
  }, 30_000);
});
