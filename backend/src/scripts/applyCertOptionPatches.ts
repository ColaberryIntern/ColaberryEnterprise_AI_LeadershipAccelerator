/**
 * applyCertOptionPatches — write the patches from `planAuthoredOptionLengths`
 * into the authored item files.
 *
 * Each patch names a question and the exact old option text; the file that
 * holds that text gets the new text in its place. The authored files write
 * every option as a single-quoted TypeScript string, so the match is on the
 * quoted, escaped literal, not on the bare words — a bare-text match could hit
 * a stem or a rationale that happens to quote an option.
 *
 * REFUSES ANYTHING AMBIGUOUS. A literal that appears zero times or more than
 * once across the item files is reported and skipped, and the run exits
 * non-zero, because a patch applied to the wrong place is worse than no
 * patch. Nothing is written until every patch has been checked.
 *
 * IDEMPOTENT. A second run finds no old text (it is now the new text) and
 * changes nothing; it exits non-zero to say so, which is the honest answer to
 * "apply these patches" when they are already applied.
 *
 * Runs locally, against the source tree. The second argument is the
 * certBlueprints source directory, so a build compiled anywhere can point at
 * the checkout it should edit:
 *   node dist/scripts/applyCertOptionPatches.js patches.ndjson src/data/certBlueprints
 */
import fs from 'fs';
import path from 'path';

interface Patch {
  question_key: string;
  old_text: string;
  new_text: string;
}

/** The TypeScript literal the authored files use for option text. */
export const literal = (text: string): string => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/**
 * Apply one patch to one file's source. Pure. Returns how many occurrences
 * the old literal had, so the caller can refuse anything but exactly one.
 */
export function applyPatch(source: string, patch: Patch): { source: string; occurrences: number } {
  const from = literal(patch.old_text);
  const occurrences = countOf(source, from);
  if (occurrences !== 1) return { source, occurrences };
  // A function replacement: a string replacement would expand `$&` and friends
  // inside option text that mentions money.
  return { source: source.replace(from, () => literal(patch.new_text)), occurrences };
}

/**
 * The planner streams one patch per line so a killed run keeps what it made;
 * a resumed run appended to the same file can repeat a patch. Exact repeats
 * are collapsed here; two different rewrites of the same option are refused
 * by the exactly-once rule below, because the second would not find its text.
 */
export function readPatches(raw: string): Patch[] {
  const text = raw.trim();
  const list: Patch[] = text.startsWith('[')
    ? JSON.parse(text)
    : text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const seen = new Set<string>();
  return list.filter((p) => {
    const id = JSON.stringify([p.question_key, p.old_text, p.new_text]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: applyCertOptionPatches <patches.ndjson> [certBlueprints dir]');
    process.exitCode = 2;
    return;
  }
  const patches = readPatches(fs.readFileSync(file, 'utf8'));
  const dir = path.resolve(process.argv[3] ?? path.join(__dirname, '..', 'data', 'certBlueprints'));
  const files = [
    ...fs.readdirSync(path.join(dir, 'items')).filter((f) => /^d\d.*\.ts$/.test(f)).map((f) => path.join(dir, 'items', f)),
    path.join(dir, 'ccarFoundationsItems.ts'),
  ];
  const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

  const problems: string[] = [];
  const applied: { file: string; key: string }[] = [];
  for (const p of patches) {
    const hits = files.filter((f) => countOf(sources.get(f)!, literal(p.old_text)) > 0);
    if (hits.length !== 1) {
      problems.push(`${p.question_key}: old text found in ${hits.length} file(s)`);
      continue;
    }
    const f = hits[0];
    if (!sources.get(f)!.includes(`'${p.question_key}'`)) {
      problems.push(`${p.question_key}: old text is in ${path.basename(f)} but the key is not`);
      continue;
    }
    const out = applyPatch(sources.get(f)!, p);
    if (out.occurrences !== 1) {
      problems.push(`${p.question_key}: old text occurs ${out.occurrences} times in ${path.basename(f)}`);
      continue;
    }
    sources.set(f, out.source);
    applied.push({ file: path.basename(f), key: p.question_key });
  }

  if (problems.length > 0) {
    console.error(`REFUSING to write: ${problems.length} patch(es) could not be placed unambiguously`);
    for (const line of problems) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }
  for (const [f, src] of sources) fs.writeFileSync(f, src, 'utf8');
  const byFile: Record<string, number> = {};
  for (const a of applied) byFile[a.file] = (byFile[a.file] ?? 0) + 1;
  console.log(`applied ${applied.length} patch(es): ${JSON.stringify(byFile)}`);
}

if (require.main === module) main();
