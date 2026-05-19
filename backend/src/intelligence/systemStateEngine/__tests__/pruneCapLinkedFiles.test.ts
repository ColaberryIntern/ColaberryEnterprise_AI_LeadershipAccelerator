/**
 * Linked-file validation tests (2026-05-19, Tier-1 #3).
 *
 * pruneCapLinkedFiles mutates each cap's linked_* arrays in place,
 * dropping references to files that don't exist in the current repo
 * file tree. Verifies:
 *   - Stale refs are dropped, valid refs are kept
 *   - Empty file tree is a no-op (safety: don't wipe everything when
 *     ground truth is unavailable)
 *   - Per-layer pruning (backend/frontend/agents) independent
 *   - Summary counts are accurate
 */
import { pruneCapLinkedFiles } from '../systemStateEngine';

describe('pruneCapLinkedFiles', () => {
  it('drops linked file refs that are not present in the repo tree', () => {
    const caps: Array<{
      linked_backend_services?: string[];
      linked_frontend_components?: string[];
      linked_agents?: string[];
    }> = [
      {
        linked_backend_services: ['src/a.ts', 'src/old.ts', 'src/b.ts'],
        linked_frontend_components: ['ui/Live.tsx', 'ui/Dead.tsx'],
        linked_agents: ['agents/active.ts'],
      },
    ];
    const tree = ['src/a.ts', 'src/b.ts', 'ui/Live.tsx', 'agents/active.ts'];
    const summary = pruneCapLinkedFiles(caps, tree);
    expect(caps[0].linked_backend_services).toEqual(['src/a.ts', 'src/b.ts']);
    expect(caps[0].linked_frontend_components).toEqual(['ui/Live.tsx']);
    expect(caps[0].linked_agents).toEqual(['agents/active.ts']);
    expect(summary.totalPruned).toBe(2); // old.ts, Dead.tsx
    expect(summary.capsWithStaleRefs).toBe(1);
  });

  it('is a no-op when file tree is empty (safety against false ground truth)', () => {
    const caps = [{ linked_backend_services: ['src/a.ts', 'src/b.ts'] }];
    const original = [...caps[0].linked_backend_services!];
    const summary = pruneCapLinkedFiles(caps, []);
    expect(caps[0].linked_backend_services).toEqual(original);
    expect(summary.totalPruned).toBe(0);
    expect(summary.fileTreeSize).toBe(0);
  });

  it('handles caps with no linked arrays gracefully', () => {
    const caps = [{}, { linked_backend_services: null as any }];
    const summary = pruneCapLinkedFiles(caps, ['anything.ts']);
    expect(summary.totalPruned).toBe(0);
    expect(summary.capsWithStaleRefs).toBe(0);
  });

  it('counts capsWithStaleRefs at cap level (1 cap, multiple stale refs = 1)', () => {
    const caps = [
      {
        linked_backend_services: ['x.ts', 'y.ts', 'z.ts'], // all stale
        linked_frontend_components: ['a.tsx', 'b.tsx'],    // all stale
        linked_agents: ['ag.ts'],                          // stale
      },
      {
        linked_backend_services: ['present.ts'],  // present
        linked_frontend_components: [],           // empty
      },
    ];
    const summary = pruneCapLinkedFiles(caps, ['present.ts']);
    expect(summary.totalPruned).toBe(6);
    expect(summary.capsWithStaleRefs).toBe(1);
  });

  it('preserves order of kept files', () => {
    const caps = [{ linked_backend_services: ['z.ts', 'a.ts', 'm.ts', 'b.ts'] }];
    const summary = pruneCapLinkedFiles(caps, ['z.ts', 'a.ts', 'm.ts', 'b.ts']);
    expect(caps[0].linked_backend_services).toEqual(['z.ts', 'a.ts', 'm.ts', 'b.ts']);
    expect(summary.totalPruned).toBe(0);
  });

  it('cap with all linked files stale ends up with empty arrays (not removed from input)', () => {
    // Cap remains; downstream code can decide whether to mark inactive.
    // Pruning intentionally doesn't escalate to "delete the cap."
    const caps = [{
      linked_backend_services: ['gone1.ts', 'gone2.ts'],
      linked_frontend_components: ['gone3.tsx'],
      linked_agents: [],
    }];
    const summary = pruneCapLinkedFiles(caps, ['unrelated.ts']);
    expect(caps[0].linked_backend_services).toEqual([]);
    expect(caps[0].linked_frontend_components).toEqual([]);
    expect(summary.totalPruned).toBe(3);
  });
});
