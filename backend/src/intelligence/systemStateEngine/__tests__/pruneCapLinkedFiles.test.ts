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

// Test trees need ≥ PRUNE_MIN_TREE_SIZE (100) files to clear the safety
// gate. Pad with filler that doesn't collide with the test paths.
const FILLER = Array.from({ length: 120 }, (_, i) => `__filler/file${i}.ts`);

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
    const tree = ['src/a.ts', 'src/b.ts', 'ui/Live.tsx', 'agents/active.ts', ...FILLER];
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
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toMatch(/empty/);
  });

  it('aborts when file tree is too small (likely partial fetch)', () => {
    const caps = [{ linked_backend_services: ['src/a.ts'] }];
    const original = [...caps[0].linked_backend_services!];
    // Less than PRUNE_MIN_TREE_SIZE (100) files
    const tinyTree = Array.from({ length: 50 }, (_, i) => `f${i}.ts`);
    const summary = pruneCapLinkedFiles(caps, tinyTree);
    expect(caps[0].linked_backend_services).toEqual(original);
    expect(summary.totalPruned).toBe(0);
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toMatch(/below min|partial fetch/);
  });

  it('aborts when pruning would wipe > 50% of refs (probable wrong-repo file tree)', () => {
    // Simulate the prod bug: file tree from a DIFFERENT repo. Every
    // ref is "stale" because the tree's path format doesn't match the
    // caps. Pruning should ABORT rather than wipe the caps' real data.
    const caps = [{
      linked_backend_services: [
        'backend/src/services/a.ts', 'backend/src/services/b.ts',
        'backend/src/services/c.ts', 'backend/src/services/d.ts',
      ],
    }];
    // Tree is large enough (>100 files) but represents a different
    // repo structure — none of the caps' refs are in it.
    const wrongRepoTree = Array.from({ length: 200 }, (_, i) => `src/components/Other${i}.tsx`);
    const summary = pruneCapLinkedFiles(caps, wrongRepoTree);
    expect(caps[0].linked_backend_services).toHaveLength(4); // unchanged
    expect(summary.totalPruned).toBe(0);
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toMatch(/100% of refs|different repo/);
  });

  it('does NOT abort when pruning would wipe a small fraction (normal stale-file case)', () => {
    // 1 stale ref out of 4 total = 25%, well below the 50% abort threshold.
    const caps = [{
      linked_backend_services: ['live1.ts', 'live2.ts', 'stale.ts', 'live3.ts'],
    }];
    const tree = ['live1.ts', 'live2.ts', 'live3.ts', ...Array.from({ length: 100 }, (_, i) => `other${i}.ts`)];
    const summary = pruneCapLinkedFiles(caps, tree);
    expect(caps[0].linked_backend_services).toEqual(['live1.ts', 'live2.ts', 'live3.ts']);
    expect(summary.totalPruned).toBe(1);
    expect(summary.aborted).toBe(false);
  });

  it('handles caps with no linked arrays gracefully', () => {
    const caps = [{}, { linked_backend_services: null as any }];
    const summary = pruneCapLinkedFiles(caps, ['anything.ts', ...FILLER]);
    expect(summary.totalPruned).toBe(0);
    expect(summary.capsWithStaleRefs).toBe(0);
  });

  it('counts capsWithStaleRefs at cap level — small per-cap stale fraction stays under abort threshold', () => {
    // Build many caps so total stale ratio stays under 50%.
    const caps: any[] = [
      {
        linked_backend_services: ['x.ts', 'y.ts'], // 2 stale
        linked_agents: ['ag.ts'],                  // 1 stale (3 stale this cap)
      },
    ];
    // Pad with 10 caps each holding 1 present ref — 10 present vs 3 stale = 23% stale, below 50% abort.
    for (let i = 0; i < 10; i++) caps.push({ linked_backend_services: [`present${i}.ts`] });
    const tree = [
      ...Array.from({ length: 10 }, (_, i) => `present${i}.ts`),
      ...FILLER,
    ];
    const summary = pruneCapLinkedFiles(caps, tree);
    expect(summary.aborted).toBe(false);
    expect(summary.totalPruned).toBe(3);
    expect(summary.capsWithStaleRefs).toBe(1);
  });

  it('preserves order of kept files', () => {
    const caps = [{ linked_backend_services: ['z.ts', 'a.ts', 'm.ts', 'b.ts'] }];
    const summary = pruneCapLinkedFiles(caps, ['z.ts', 'a.ts', 'm.ts', 'b.ts', ...FILLER]);
    expect(caps[0].linked_backend_services).toEqual(['z.ts', 'a.ts', 'm.ts', 'b.ts']);
    expect(summary.totalPruned).toBe(0);
    expect(summary.aborted).toBe(false);
  });

  it('cap with mostly stale linked files keeps the live ones — empty array possible when all stale', () => {
    // Cap with 1 live + 2 stale = 33% stale across this cap, but spread
    // across enough live caps to keep global ratio < 50%.
    const caps: any[] = [
      {
        linked_backend_services: ['live.ts', 'gone1.ts'],
        linked_frontend_components: ['gone2.tsx'],
        linked_agents: [],
      },
    ];
    // Add many live-only caps so the global ratio doesn't trip the abort.
    for (let i = 0; i < 10; i++) caps.push({ linked_backend_services: [`live${i}.ts`] });
    const tree = ['live.ts', ...Array.from({ length: 10 }, (_, i) => `live${i}.ts`), ...FILLER];
    const summary = pruneCapLinkedFiles(caps, tree);
    expect(summary.aborted).toBe(false);
    expect(caps[0].linked_backend_services).toEqual(['live.ts']);
    expect(caps[0].linked_frontend_components).toEqual([]);
    expect(summary.totalPruned).toBe(2);
  });
});
