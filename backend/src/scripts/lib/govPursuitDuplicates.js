// govPursuitDuplicates.js
//
// PURE. Decide which gov pursuits are the SAME solicitation uploaded more than once.
//
// Nothing stops a solicitation ZIP being uploaded twice. Each upload mints its own
// `gws:<uuid>` workspace and its own qualification thread, and from then on the two
// are unrelated as far as the platform is concerned — they qualify separately, they
// can be approved separately, and they can each materialize their own build for their
// own intern. Audited on production 2026-11-07: four solicitations had been entered
// twice or three times, and two of them had been APPROVED AND BUILT twice.
//
// The Crash Records pursuit is the case that made this worth writing. It went in on
// 2026-10-27 and again on 2026-11-01. The second upload is the one that was approved
// and handed to an intern, and it is also the one whose record carries no title — so
// the funnel showed a titled "Crash Records Information System Service Agreement"
// sitting unworked in Qualifying while the built one appeared as a bare uuid. Two
// rows, neither of which looked like what had actually happened.
//
// THE SIGNALS, AND WHY THERE ARE THREE
//   sha256   — byte-identical uploads. Exact, and it caught three of the four groups.
//   solicitation number — the leading field of the download convention
//              "<solicitation no> - pub - <title>.zip". Two downloads of the same
//              posting can differ byte-wise (archive timestamps) while naming the
//              same solicitation, which is exactly the Crash pair: same 2,850,432
//              bytes, different sha256.
//   normalized filename — the same, minus the browser's "(1)" re-download suffix.
//              Catches a posting whose number is not in the filename at all.
// A pursuit joins a group through ANY shared signal, so the groups are the connected
// components over those keys rather than a grouping by one chosen column.
//
// JUDGEMENT ONLY, NO ACTION. This module names the duplicates and nominates the
// member that looks like the real pursuit. It never says the others should be
// deleted, and nothing here writes: `decision` has no 'duplicate' value, so retiring
// a duplicate is a decision for a person, made with this report in front of them.

/** The browser's "(1)" on a second download of the same file. */
const DUP_SUFFIX = /\s*\(\d+\)\s*$/;
/** The download convention: "<solicitation no> - pub - <title>.zip". */
const PUB_SEPARATOR = / - pub - /i;
const ZIP_EXTENSION = /\.zip$/i;

/** PURE. The solicitation number a bundle filename leads with, or null when it does not follow the convention. */
function solicitationNumberFrom(filename) {
  // Trim BEFORE stripping the extension: `\.zip$` does not match a name with trailing whitespace, and a filename
  // that keeps its extension has no leading field to read.
  const name = String(filename || '').trim().replace(ZIP_EXTENSION, '');
  if (!PUB_SEPARATOR.test(name)) return null;
  const lead = name.split(PUB_SEPARATOR)[0].trim();
  return lead ? lead.toLowerCase() : null;
}

/** PURE. A filename reduced to what two downloads of one document still share. */
function normalizeBundleFilename(filename) {
  // Order is load-bearing: trim, then the extension, then the "(1)" that sits between name and extension.
  const name = String(filename || '')
    .trim()
    .replace(ZIP_EXTENSION, '')
    .replace(DUP_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return name || null;
}

/**
 * PURE. The signals by which one upload can be recognised as another's twin.
 * Namespaced so a sha can never collide with a filename.
 */
function duplicateSignals(bundle) {
  const signals = [];
  const sha = String((bundle && bundle.sha256) || '').trim().toLowerCase();
  if (sha) signals.push(`sha:${sha}`);
  const sol = solicitationNumberFrom(bundle && bundle.filename);
  if (sol) signals.push(`sol:${sol}`);
  const file = normalizeBundleFilename(bundle && bundle.filename);
  if (file) signals.push(`file:${file}`);
  return signals;
}

/** Rank for nominating the member that represents the real pursuit: built > approved > anything else. */
function standing(member) {
  if (member.built) return 2;
  if (member.decision === 'approved_bid_pursuit' || member.decision === 'rfi_response') return 1;
  return 0;
}

/** PURE. Earliest upload first, so a tie between equals is settled by who was there first. */
function byUploadedAt(a, b) {
  const at = Date.parse(String(a.uploadedAt || '')) || 0;
  const bt = Date.parse(String(b.uploadedAt || '')) || 0;
  return at - bt;
}

/**
 * PURE. Group uploads into same-solicitation sets, keeping only the sets with more than one PURSUIT.
 *
 * Two uploads under the SAME qualification key are not a duplicate pursuit — that is a re-upload inside one
 * workspace, which is legitimate (a corrected ZIP, an addendum). Only a set spanning more than one key is
 * reported.
 *
 * @param {Array<{qualificationKey: string, sha256?: string|null, filename?: string|null,
 *                uploadedAt?: string|null, decision?: string|null, status?: string|null,
 *                built?: boolean, deliveryProjectId?: string|null, title?: string|null}>} bundles
 * @returns {Array<{signals: string[], members: object[], primary: object|null, builtCount: number,
 *                  verdict: 'duplicate_built_twice'|'duplicate_one_built'|'duplicate_none_built'}>}
 */
function groupDuplicatePursuits(bundles) {
  const rows = Array.isArray(bundles) ? bundles.filter((b) => b && b.qualificationKey) : [];

  // Union-find over the signals. parent maps a signal to its representative signal.
  const parent = new Map();
  const find = (k) => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression, so a long chain of aliases does not cost a walk per lookup.
    let walk = k;
    while (parent.get(walk) !== root) { const next = parent.get(walk); parent.set(walk, root); walk = next; }
    return root;
  };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const signalsByRow = new Map();
  for (const row of rows) {
    const signals = duplicateSignals(row);
    signalsByRow.set(row, signals);
    signals.forEach(add);
    for (let i = 1; i < signals.length; i += 1) union(signals[0], signals[i]);
  }

  const componentRows = new Map();
  for (const row of rows) {
    const signals = signalsByRow.get(row);
    if (!signals.length) continue; // no sha and no filename: nothing to recognise it by
    const root = find(signals[0]);
    const list = componentRows.get(root) ?? [];
    list.push(row);
    componentRows.set(root, list);
  }

  const groups = [];
  for (const [, members] of componentRows) {
    const keys = new Set(members.map((m) => m.qualificationKey));
    if (keys.size < 2) continue; // one pursuit, however many times its ZIP was uploaded
    const ordered = [...members].sort((a, b) => (standing(b) - standing(a)) || byUploadedAt(a, b));
    const builtCount = new Set(members.filter((m) => m.built).map((m) => m.qualificationKey)).size;
    const signals = [...new Set(members.flatMap((m) => signalsByRow.get(m)))].sort();
    groups.push({
      signals,
      members: ordered,
      primary: ordered[0] ?? null,
      builtCount,
      verdict: builtCount > 1 ? 'duplicate_built_twice'
        : builtCount === 1 ? 'duplicate_one_built'
          : 'duplicate_none_built',
    });
  }
  // Worst first: two builds of one solicitation is a delivery problem, not a tidiness problem.
  const severity = { duplicate_built_twice: 0, duplicate_one_built: 1, duplicate_none_built: 2 };
  return groups.sort((a, b) => (severity[a.verdict] - severity[b.verdict])
    || byUploadedAt(a.members[0] ?? {}, b.members[0] ?? {}));
}

module.exports = {
  groupDuplicatePursuits,
  duplicateSignals,
  solicitationNumberFrom,
  normalizeBundleFilename,
};
