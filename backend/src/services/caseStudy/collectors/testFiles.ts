import {
  isSourceFile, isTestFile, skip,
  type Collector, type CollectorInput, type CollectorResult,
} from './collectorTypes';

/**
 * `test_files` - test files as a SHARE of source files.
 *
 * WHY A SHARE AND NOT A COUNT. "46 test files" flatters a large repository and
 * punishes a small one, and a reader cannot tell which they are looking at. A
 * share carries its own denominator, so the number means the same thing in a
 * six-file project and a six-hundred-file one.
 *
 * THE DENOMINATOR IS SOURCE FILES, NOT ALL FILES. Counting markdown, lockfiles
 * and images in the denominator would make a well-documented repository look
 * under-tested, which is the opposite of true. The note travels with the figure
 * so nobody has to guess what the bottom half was.
 *
 * WHAT THIS IS NOT. It is not coverage, and the limitation is generated rather
 * than left to an author to remember. One test file can assert nothing and a
 * hundred can miss the path that matters.
 */
export const testFilesCollector: Collector = {
  key: 'test_files',
  shape: 'share',
  label: 'Test files as a share of source files',
  needsCommits: false,

  collect(input: CollectorInput): CollectorResult {
    if (input.tree.paths.length === 0) return skip('empty_tree', 'the tree read returned no paths');
    if (input.tree.truncated) {
      // A count from a truncated tree is a floor. Publishing it as a count
      // would be wrong in a way nobody downstream could detect.
      return skip('tree_truncated', 'the tree was truncated, so any count would be a floor');
    }

    const source = input.tree.paths.filter(isSourceFile);
    if (source.length === 0) {
      return skip('no_source_files', 'no file in the tree has a recognised source extension');
    }
    const tests = source.filter(isTestFile);
    const percent = Math.round((tests.length / source.length) * 1000) / 10;

    return {
      ok: true,
      output: {
        shape: 'share',
        payload: {
          shape: 'share',
          numerator: tests.length,
          denominator: source.length,
          denominatorNote: 'Source files only. Documentation, configuration, lockfiles and '
            + 'vendored dependencies are excluded from both halves.',
        },
        valueDisplay: `${percent}%`,
        unit: null,
        numericValue: percent,
        methodology: `Counted from the repository tree at ${input.sha}. A file counts as source `
          + 'if it carries a recognised source extension and does not sit under a vendored, '
          + 'generated or dependency directory. It counts as a test if its path or filename '
          + 'follows a test convention.',
        limitations: [
          'A share of test files is not coverage. One test file can assert nothing, and many can miss the path that matters.',
          'Test files are identified by name and location, never by reading what they assert.',
        ],
        reproduceCommand: `git ls-tree -r --name-only ${input.sha}`,
      },
    };
  },
};
