/**
 * Operational Onboarding + Guided Comprehension Sprint, 2026-05-16.
 *
 * Covers the pure render-gate that powers FirstVisitFramingCard:
 *   - First-visit + not-dismissed → show
 *   - Not first-visit → don't show (even if not dismissed)
 *   - Dismissed for this surface → don't show (even on first visit)
 *   - Per-surface independence (home dismissal doesn't affect systemBps)
 *
 * Pure-logic tests against the exported helper. The component itself is
 * a thin gate around this function; render behavior is not under test
 * (this frontend has no @testing-library/react), but the render gate IS.
 */
import { shouldShowFirstVisitFraming, type WorkspaceMemory } from '../hooks/useWorkspaceMemory';

describe('shouldShowFirstVisitFraming', () => {
  test('first-visit + no seenIntros → show', () => {
    const mem: WorkspaceMemory = {};
    expect(shouldShowFirstVisitFraming(mem, 'home', true)).toBe(true);
    expect(shouldShowFirstVisitFraming(mem, 'systemBps', true)).toBe(true);
  });

  test('not first-visit → never show, regardless of dismissal state', () => {
    const empty: WorkspaceMemory = {};
    const dismissedHome: WorkspaceMemory = { seenIntros: { home: true } };
    expect(shouldShowFirstVisitFraming(empty, 'home', false)).toBe(false);
    expect(shouldShowFirstVisitFraming(dismissedHome, 'home', false)).toBe(false);
  });

  test('first-visit + already dismissed for this surface → do not show', () => {
    const mem: WorkspaceMemory = { seenIntros: { home: true } };
    expect(shouldShowFirstVisitFraming(mem, 'home', true)).toBe(false);
  });

  test('per-surface independence — home dismissal does not silence systemBps', () => {
    const homeDismissed: WorkspaceMemory = { seenIntros: { home: true } };
    expect(shouldShowFirstVisitFraming(homeDismissed, 'home', true)).toBe(false);
    expect(shouldShowFirstVisitFraming(homeDismissed, 'systemBps', true)).toBe(true);
  });

  test('per-surface independence — systemBps dismissal does not silence home', () => {
    const sysDismissed: WorkspaceMemory = { seenIntros: { systemBps: true } };
    expect(shouldShowFirstVisitFraming(sysDismissed, 'systemBps', true)).toBe(false);
    expect(shouldShowFirstVisitFraming(sysDismissed, 'home', true)).toBe(true);
  });

  test('both dismissed → both silent on first visit', () => {
    const mem: WorkspaceMemory = { seenIntros: { home: true, systemBps: true } };
    expect(shouldShowFirstVisitFraming(mem, 'home', true)).toBe(false);
    expect(shouldShowFirstVisitFraming(mem, 'systemBps', true)).toBe(false);
  });

  test('seenIntros explicitly false (vs undefined) → still show', () => {
    // Defensive: false is the "not dismissed" semantic, same as missing.
    const mem: WorkspaceMemory = { seenIntros: { home: false } };
    expect(shouldShowFirstVisitFraming(mem, 'home', true)).toBe(true);
  });
});
