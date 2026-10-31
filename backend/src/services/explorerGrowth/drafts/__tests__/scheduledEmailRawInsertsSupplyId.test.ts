import * as fs from 'fs';
import * as path from 'path';

/**
 * EVERY RAW INSERT INTO `scheduled_emails` MUST SUPPLY `id`.
 *
 * ── THE DEFECT THIS EXISTS TO PREVENT ──────────────────────────────────────
 *
 * `scheduled_emails.id` is `uuid NOT NULL` with **no database default**. The default
 * lives on the Sequelize model (`defaultValue: DataTypes.UUIDV4`) and is generated
 * client-side, so every writer that goes through the model is fine and every raw-SQL
 * writer must generate its own id. A raw insert that omits the column fails 100% of its
 * rows with `null value in column "id" of relation "scheduled_emails" violates not-null
 * constraint`.
 *
 * On 2026-10-31 both raw writers into this table omitted it:
 *
 *   drafts/draftRepository.ts        → a live render of 142 Explorer decisions drafted 0
 *   agents/tools/agentEmailTool.ts   → production held 0 `agent_draft` rows, ever
 *
 * Neither had ever written a single row. `explorerSignalWriter.ts` already carried a
 * comment warning about this exact trap for a different table; the warning existed and
 * was simply never applied to these two.
 *
 * ── WHY A SOURCE SCAN RATHER THAN A UNIT TEST ──────────────────────────────
 *
 * Both writers had unit tests, and both were green, because those tests mock
 * `sequelize.query`. A mock accepts any SQL, so a statement that cannot execute against
 * the real schema looks identical to one that can. No amount of mocked coverage can catch
 * a missing NOT NULL column; only the database or the SQL text can. There is no test
 * database in CI, so the SQL text is what is checkable here.
 *
 * ── THE CONTROLS ───────────────────────────────────────────────────────────
 *
 * A scan that finds nothing passes vacuously, which is how a probe aimed at the wrong
 * directory reads as a clean bill of health. So this asserts the scan actually worked:
 * the file sweep must see a plausible number of sources, and it must find at least the
 * two known inserts. If a future refactor moves this table's writers behind the model
 * entirely, `MIN_RAW_INSERTS` is the line to revisit deliberately — lowering it to 0 to
 * make a red test green would delete the guard.
 */

const BACKEND_SRC = path.join(__dirname, '..', '..', '..', '..');

/** Lower bound on files swept, so a mis-aimed walk cannot pass as "nothing wrong". */
const MIN_FILES_SCANNED = 500;

/** The two known raw writers. A find of fewer than this means the regex stopped matching. */
const MIN_RAW_INSERTS = 2;

/** Source with comments stripped, so prose cannot trip or satisfy an assertion. */
function codeOf(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every .ts source file under backend/src, tests and declarations excluded. */
function sourceFiles(dir: string = BACKEND_SRC): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface RawInsert {
  file: string;
  columns: string[];
}

interface Sweep {
  filesScanned: number;
  inserts: RawInsert[];
  /** Inserts with no column list at all, which cannot be checked for `id`. */
  bare: string[];
}

/**
 * ONE pass over the tree, collecting everything the assertions need.
 *
 * Deliberately not two walks. The first version of this file read and comment-stripped
 * every source file twice, once per assertion, and took 175s — most of a CI minute spent
 * re-reading files it had already read. Each file is read once here and both findings are
 * derived from the same string.
 *
 * The column list is captured up to the first `)` after the table name. A writer that
 * omits the list entirely (`INSERT INTO scheduled_emails VALUES (...)`) cannot be checked
 * positionally, so it is collected separately and rejected outright.
 */
function sweep(): Sweep {
  const files = sourceFiles();
  const inserts: RawInsert[] = [];
  const bare: string[] = [];

  for (const file of files) {
    const code = codeOf(file);
    if (!/INSERT\s+INTO\s+scheduled_emails/i.test(code)) continue;
    const rel = path.relative(BACKEND_SRC, file).replace(/\\/g, '/');

    for (const m of code.matchAll(/INSERT\s+INTO\s+scheduled_emails\s*\(([^)]*)\)/gi)) {
      inserts.push({
        file: rel,
        columns: m[1]
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean),
      });
    }
    if (/INSERT\s+INTO\s+scheduled_emails\s+VALUES/i.test(code)) bare.push(rel);
  }

  return { filesScanned: files.length, inserts, bare };
}

describe('raw inserts into scheduled_emails', () => {
  const { filesScanned, inserts, bare } = sweep();

  it('swept a plausible number of source files', () => {
    expect(filesScanned).toBeGreaterThan(MIN_FILES_SCANNED);
  });

  it('found the known raw writers, so the pattern still matches', () => {
    expect(inserts.length).toBeGreaterThanOrEqual(MIN_RAW_INSERTS);
  });

  it('has no raw insert that omits the column list', () => {
    expect(bare).toEqual([]);
  });

  it.each(inserts.map((i) => [i.file, i.columns] as const))(
    'supplies id explicitly: %s',
    (_file, columns) => {
      expect(columns).toContain('id');
    },
  );
});
