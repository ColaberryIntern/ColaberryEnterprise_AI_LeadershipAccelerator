/**
 * pruneRuns — pure helper: given the filenames in the worker's runs/ dir and a
 * keep count, return which run files to delete (oldest first). Run filenames are
 * `TPW_TPW-YYYYMMDDHHMM.html`, so a lexical sort is chronological. Never throws.
 */
function selectOldRuns(files, keep) {
  const runs = (Array.isArray(files) ? files : []).filter((f) => /^TPW_.*\.html$/.test(f)).sort();
  return runs.length > keep ? runs.slice(0, runs.length - keep) : [];
}

module.exports = { selectOldRuns };
