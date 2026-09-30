/**
 * Minimal `global.IntersectionObserver` stub for jsdom, which has no native
 * implementation and no existing polyfill in this repo (flagged by the
 * loop-architect plan-audit cycle-4 auditor: `TodayFeedV2.tsx` constructs one
 * as soon as its render leaves the `'loading'` state, which any test that
 * mounts it past that point needs). Import this file for its side effect
 * (`import './testEnv/intersectionObserverMock'`) before mounting
 * `TodayFeedV2`/`TodayShell` in a test.
 */
class MockIntersectionObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
  takeRecords = () => [];
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}

(global as any).IntersectionObserver = MockIntersectionObserver;
