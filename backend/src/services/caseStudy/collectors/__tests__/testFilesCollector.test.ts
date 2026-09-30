import { testFilesCollector } from '../testFiles';
import { SHA, SMALL_SERVICE, treeInput } from './fixtureTree';

describe('test_files collector', () => {
  it('reports a share whose denominator is source files only', () => {
    const result = testFilesCollector.collect(treeInput(SMALL_SERVICE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Six source files: index, abacEvaluator, auditLog, transportSelector,
    // demoUnsafeAction, plus the two tests. README, package.json and the
    // lockfile are not source, and node_modules is somebody else's work -
    // counting a dependency's tests as this team's would be a lie.
    expect(result.output.payload).toEqual({
      shape: 'share',
      numerator: 2,
      denominator: 7,
      denominatorNote: expect.stringContaining('Source files only'),
    });
    expect(result.output.valueDisplay).toBe('28.6%');
    expect(result.output.reproduceCommand).toContain(SHA);
  });

  it('says what a share of test files is not', () => {
    const result = testFilesCollector.collect(treeInput(SMALL_SERVICE));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.limitations.join(' ')).toContain('not coverage');
  });

  it('refuses a truncated tree rather than publishing a floor as a count', () => {
    // This is the failure nobody downstream could detect: a truncated tree
    // still returns paths, and a count taken from it looks entirely normal.
    const result = testFilesCollector.collect(treeInput(SMALL_SERVICE, true));
    expect(result).toEqual({ ok: false, reason: 'tree_truncated', detail: expect.any(String) });
  });

  it('returns nothing at all for a tree with no source files', () => {
    const result = testFilesCollector.collect(treeInput(['README.md', 'LICENSE']));
    expect(result).toEqual({ ok: false, reason: 'no_source_files', detail: expect.any(String) });
  });

  it('returns nothing for an empty tree, rather than zero percent', () => {
    expect(testFilesCollector.collect(treeInput([]))).toMatchObject({ ok: false, reason: 'empty_tree' });
  });
});
