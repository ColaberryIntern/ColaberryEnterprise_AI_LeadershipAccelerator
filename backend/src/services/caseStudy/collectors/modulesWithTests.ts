import {
  isSourceFile, isTestFile, moduleNameOf, skip,
  type Collector, type CollectorInput, type CollectorResult,
} from './collectorTypes';
import type { CaseStudyMetricMember } from '../../../types/caseStudy';

const MAX_MEMBERS = 40;

/**
 * `modules_with_tests` - named modules that have a test file, out of all of them.
 *
 * THIS COLLECTOR IS THE REASON SHAPES EXIST. The figure it produces used to be
 * typed by hand as the string "4 of 7", with the seven module names buried in a
 * methodology paragraph. A card could not draw a meter, because nothing said
 * there was a denominator, and a reader could not see WHICH four.
 *
 * A ratio carries both halves and the members carry the rest, each with a
 * status a reader can scan: which modules are tested and which are not. That is
 * a stronger claim than the percentage, and an unflattering one when three of
 * seven are bare, which is precisely why it is worth publishing.
 *
 * PAIRING IS BY NAME. `thing.ts` is tested if a test file exists whose module
 * name is `thing`. It is a convention, not a proof, and the limitation says so:
 * a test file named after a module may test almost none of it.
 */
export const modulesWithTestsCollector: Collector = {
  key: 'modules_with_tests',
  shape: 'ratio',
  label: 'Modules with a test file',
  needsCommits: false,

  collect(input: CollectorInput): CollectorResult {
    if (input.tree.paths.length === 0) return skip('empty_tree', 'the tree read returned no paths');
    if (input.tree.truncated) {
      return skip('tree_truncated', 'the tree was truncated, so any count would be a floor');
    }

    const source = input.tree.paths.filter(isSourceFile);
    const tested = new Set(source.filter(isTestFile).map(moduleNameOf));
    const modules = source.filter((path) => !isTestFile(path) && !isBarrel(path));

    if (modules.length === 0) {
      return skip('no_modules', 'the tree contains no non-test source module');
    }

    const seen = new Set<string>();
    const unique: { path: string; name: string }[] = [];
    for (const path of modules.slice().sort()) {
      const name = moduleNameOf(path);
      if (seen.has(name)) continue;
      seen.add(name);
      unique.push({ path, name });
    }

    const withTests = unique.filter((m) => tested.has(m.name));
    // Untested first: the useful half of this figure is what is missing, and a
    // reader who stops after the first few members should see that half.
    const ordered = [
      ...unique.filter((m) => !tested.has(m.name)),
      ...withTests,
    ];
    const members: CaseStudyMetricMember[] = ordered.slice(0, MAX_MEMBERS).map((m) => ({
      name: m.path,
      status: tested.has(m.name) ? 'yes' : 'no',
    }));

    return {
      ok: true,
      output: {
        shape: 'ratio',
        payload: {
          shape: 'ratio',
          numerator: withTests.length,
          denominator: unique.length,
          members,
        },
        valueDisplay: `${withTests.length} of ${unique.length}`,
        unit: unique.length === 1 ? 'module' : 'modules',
        numericValue: withTests.length,
        methodology: `Counted from the repository tree at ${input.sha}. A module is a source `
          + 'file that is not itself a test and is not a re-export barrel. It counts as tested '
          + 'when a test file exists whose name matches the module name.',
        limitations: [
          'Pairing is by filename. A test file named after a module may exercise almost none of it, and a module tested from elsewhere counts as untested here.',
          ...(unique.length > MAX_MEMBERS
            ? [`The list below shows ${MAX_MEMBERS} of ${unique.length} modules, untested ones first.`]
            : []),
        ],
        reproduceCommand: `git ls-tree -r --name-only ${input.sha}`,
      },
    };
  },
};

/** `index.ts` re-exports; counting it as an untested module is noise. */
function isBarrel(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  return base.startsWith('index.') || base.startsWith('__init__.');
}
