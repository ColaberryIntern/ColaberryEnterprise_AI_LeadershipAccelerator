/**
 * TodayShell.planGate — CAPE Phase 5 (design doc §10, §16 Phase 5) mount-gate
 * race test. This is the load-bearing proof behind the plan-audit's cycle-4
 * fix: `planRefs` starts unconditionally `null`, and only a `[flags]`-keyed
 * effect (never a `useState` initializer reading `flags` directly) ever
 * resolves it — so `<TodayFeedV2>` cannot mount before both the flag and the
 * Today Plan's exclude set are genuinely known.
 *
 * Engineering note (logged): mounting the REAL `TodayShell` here was
 * attempted first and abandoned after extensive debugging — `TodayShell`
 * wraps `PortalShell`, which alone pulls in ~15 further modules (cohort
 * presence, people panel, DMs, chat dock, notifications, entitlements, org/
 * mgmt status) each with their own network/hook dependencies, and this
 * repo's CRA+jest environment proved unable to reliably apply `jest.mock()`
 * to one of the deep relative-path dependencies (`utils/portalApi`) no
 * matter how the mock was structured, while shallower mocks worked
 * correctly — a real, reproducible asymmetry (confirmed via a diagnostic
 * marker that never fired), not a mistake in the mock code.
 *
 * Given that, this test exercises the REAL `useTodayPlanGate` hook directly
 * (extracted from TodayShell.tsx into its own module once that file crossed
 * CLAUDE.md's 500-line hard ceiling — see useTodayPlanGate.ts) via a tiny
 * wrapper component wired to the same two mocked stand-ins
 * (`StubTodayFeedV2`, `StubTodayPlan`) this file uses. Because the hook is
 * imported (not copied), this test can never silently drift from the real
 * gate logic the way a hand-maintained "verbatim copy" could.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { useTodayPlanGate } from '../useTodayPlanGate';
import type { PortalFlags } from '../../../../services/onboardingApi';

const mockTodayFeedV2Mount = jest.fn();
let mockCapturedOnRefs: ((refs: Set<string>) => void) | null = null;

const StubTodayFeedV2: React.FC<{ excludeRefs?: Set<string> }> = (props) => { mockTodayFeedV2Mount(props); return null; };
const StubTodayPlan: React.FC<{ onRefs: (refs: Set<string>) => void }> = (props) => { mockCapturedOnRefs = props.onRefs; return null; };

/** Thin wrapper exercising the REAL `useTodayPlanGate` hook, wired to the
 * same gated-render shape TodayShell.tsx itself uses. */
const PlanRefsGate: React.FC<{ flags: PortalFlags | null }> = ({ flags }) => {
  const { planRefs, setPlanRefs } = useTodayPlanGate(flags);
  return (
    <>
      {flags?.cape_today_plan && <StubTodayPlan onRefs={setPlanRefs} />}
      {planRefs !== null && <StubTodayFeedV2 excludeRefs={planRefs} />}
    </>
  );
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockCapturedOnRefs = null;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
  jest.useRealTimers();
});

async function mount(flags: PortalFlags | null) {
  await act(async () => {
    root = createRoot(container);
    root.render(<PlanRefsGate flags={flags} />);
  });
}
async function rerender(flags: PortalFlags | null) {
  await act(async () => { root.render(<PlanRefsGate flags={flags} />); });
}

describe('useTodayPlanGate — the real mount-order race, reproduced and closed', () => {
  it('flags=null on first render -> TodayFeedV2 is NOT mounted at all yet', async () => {
    await mount(null);
    expect(mockTodayFeedV2Mount).not.toHaveBeenCalled();
  });

  it('flag ON, TodayPlan resolves AFTER the point a race-prone implementation would already have mounted TodayFeedV2 -> TodayFeedV2 still waits, then mounts with the REAL exclude refs', async () => {
    await mount(null);
    expect(mockTodayFeedV2Mount).not.toHaveBeenCalled(); // still null — flags hasn't resolved

    // flags resolves NOW (simulates usePortalFlags's real async resolution,
    // strictly after the first render/commit already happened above).
    await rerender({ today_redesign: true, cape_today_plan: true });
    // TodayPlan is now mounted (flag on), but hasn't called onRefs yet —
    // TodayFeedV2 must STILL not be mounted.
    expect(mockTodayFeedV2Mount).not.toHaveBeenCalled();
    expect(mockCapturedOnRefs).not.toBeNull();

    // TodayPlan's real fetch resolves — supplies the real plan refs.
    await act(async () => { mockCapturedOnRefs!(new Set(['card:a0', 'card:a1'])); });

    expect(mockTodayFeedV2Mount).toHaveBeenCalledTimes(1);
    const props = mockTodayFeedV2Mount.mock.calls[0][0];
    expect(props.excludeRefs).toEqual(new Set(['card:a0', 'card:a1']));
  });

  it('flag ON, TodayPlan never resolves (hung) -> bounded ~1500ms timeout still mounts TodayFeedV2 with an empty exclude set (never stalls the page)', async () => {
    await mount(null);
    await rerender({ today_redesign: true, cape_today_plan: true });
    expect(mockTodayFeedV2Mount).not.toHaveBeenCalled();

    // mockCapturedOnRefs is intentionally never invoked (simulates a hung/failed fetch).
    await act(async () => { jest.advanceTimersByTime(1500); });

    expect(mockTodayFeedV2Mount).toHaveBeenCalledTimes(1);
    expect(mockTodayFeedV2Mount.mock.calls[0][0].excludeRefs).toEqual(new Set());
  });

  it('flag OFF -> planRefs resolves to an empty Set() as soon as flags is known, TodayFeedV2 mounts with NO added latency (no TodayPlan, no timeout)', async () => {
    await mount(null);
    expect(mockTodayFeedV2Mount).not.toHaveBeenCalled();

    await rerender({ today_redesign: true, cape_today_plan: false });

    // No timer advance needed — flag-off resolves synchronously inside the effect.
    expect(mockTodayFeedV2Mount).toHaveBeenCalledTimes(1);
    expect(mockTodayFeedV2Mount.mock.calls[0][0].excludeRefs).toEqual(new Set());
    expect(mockCapturedOnRefs).toBeNull(); // TodayPlan never mounted at all when the flag is off
  });
});
