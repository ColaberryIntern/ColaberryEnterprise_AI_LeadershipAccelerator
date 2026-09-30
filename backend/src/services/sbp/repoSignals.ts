/**
 * repoSignals — what a repository's file tree can honestly say about itself. PURE.
 *
 * Step 3 of the portfolio plan: deepen the repo read so a narrative can be written from
 * evidence rather than from a form. `capabilityRepoReader` answers "did they build the
 * things the labs asked for". This answers "what IS this repository" — languages, shape,
 * and the practices whose presence is visible in a path listing.
 *
 * ── THE ONE CONSTRAINT THAT SHAPES EVERYTHING HERE ──────────────────────────
 *
 * `file_tree_json` carries PATHS, not CONTENT. So this module can report STRUCTURE and it
 * can never report QUALITY. A `Dockerfile` means a Dockerfile exists; it does not mean the
 * image builds, deploys, or is any good. A `__tests__` directory means test files were
 * committed; it says nothing about whether they pass or cover anything.
 *
 * Every field below is therefore phrased as an observation, and the narrative layer that
 * consumes it must not upgrade an observation into a claim. This is the same discipline
 * the compiler already holds: a portfolio that overstates once is discounted entirely, and
 * a student has to defend every line of it in a room.
 *
 * ── WHY COUNTS AND NOT PERCENTAGES ──────────────────────────────────────────
 *
 * "310 TypeScript files" is checkable by anyone who opens the repo. "78% TypeScript" is a
 * derived figure that invites argument about the denominator — vendored code, generated
 * files, images. Counts are defensible; ratios are a debate.
 *
 * PURE. No I/O, no clock, no randomness. Same tree in, identical signals out, which is
 * what lets the compiler stay deterministic and skip an unchanged write.
 */

export interface TreeEntry {
  path: string;
  type?: string;
}

export interface LanguageSignal {
  /** Display name, e.g. "TypeScript". */
  name: string;
  /** Files carrying this language's extension. A count, never a percentage. */
  files: number;
}

export interface RepoSignals {
  /** Languages present, most files first. Only those clearing the noise floor. */
  languages: LanguageSignal[];
  /** Top-level directories, which is how a reader recognises the shape of a project. */
  structure: string[];
  /**
   * Practices whose PRESENCE is visible in a path listing. Presence only — never a
   * judgement about whether the practice is done well.
   */
  practices: {
    containerised: boolean;
    tested: boolean;
    documented: boolean;
    continuous_integration: boolean;
    typed: boolean;
    /** Both a server and a client surface exist in one repository. */
    full_stack: boolean;
  };
  /** Committed files, excluding directory entries. Scale, stated plainly. */
  file_count: number;
}

/**
 * Extension to language. Deliberately small: a language is listed when it is unambiguous
 * from the extension alone. `.h` could be C or C++, `.m` could be Objective-C or MATLAB —
 * both are omitted rather than guessed, because a wrong language on a portfolio is the
 * kind of error a reader notices immediately and never forgives.
 */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  cs: 'C#', php: 'PHP', swift: 'Swift', scala: 'Scala', sql: 'SQL',
  sh: 'Shell', css: 'CSS', scss: 'CSS', html: 'HTML',
};

/**
 * A language needs at least this many files to be listed.
 *
 * One stray `.sh` in a repo of 600 TypeScript files does not make somebody a shell
 * programmer, and listing it would dilute the true signal beside it. Three is the same
 * floor the capability reader uses for a collection, for the same reason.
 */
const LANGUAGE_FLOOR = 3;

/** Directory noise nobody wants to read on a portfolio. */
const IGNORED_TOP_LEVEL = new Set([
  'node_modules', 'dist', 'build', 'coverage', 'vendor', '.git', '.github',
  '.vscode', '.idea', 'tmp', '__pycache__', '.venv', 'venv',
]);

const isFile = (e: TreeEntry) => e.type !== 'tree';

function extensionOf(path: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}

const has = (paths: string[], predicate: (p: string) => boolean) => paths.some(predicate);

/**
 * Read a tree into signals.
 *
 * Defensive throughout: a malformed entry is skipped rather than throwing, because one bad
 * row in a 600-entry tree must degrade to a slightly shorter description and never take
 * a student's whole page down.
 */
export function readRepoSignals(tree: unknown): RepoSignals {
  const entries: TreeEntry[] = Array.isArray(tree)
    ? (tree as any[]).filter((e) => e && typeof e === 'object' && typeof e.path === 'string')
    : [];

  const files = entries.filter(isFile);
  const paths = files.map((e) => e.path);
  const lower = paths.map((p) => p.toLowerCase());

  // ── languages ────────────────────────────────────────────────────────────
  const counts = new Map<string, number>();
  for (const p of paths) {
    const ext = extensionOf(p);
    const lang = ext ? LANGUAGE_BY_EXT[ext] : null;
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const languages: LanguageSignal[] = [...counts.entries()]
    .filter(([, n]) => n >= LANGUAGE_FLOOR)
    .map(([name, n]) => ({ name, files: n }))
    .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));

  // ── structure ────────────────────────────────────────────────────────────
  const structure = [...new Set(
    entries
      .map((e) => e.path.split('/')[0])
      .filter((d) => d && !d.startsWith('.') && !IGNORED_TOP_LEVEL.has(d) && !d.includes('.')),
  )].sort();

  // ── practices, by PRESENCE only ──────────────────────────────────────────
  const containerised = has(lower, (p) => p === 'dockerfile' || p.endsWith('/dockerfile')
    || p.startsWith('docker-compose') || p.includes('/docker-compose'));

  const tested = has(lower, (p) => p.includes('__tests__/') || p.includes('/tests/')
    || p.startsWith('tests/') || /\.(test|spec)\.[a-z0-9]+$/.test(p));

  const documented = has(lower, (p) => p === 'readme.md' || p.startsWith('docs/')
    || p.startsWith('directives/') || p === 'claude.md' || p.startsWith('spec/'));

  const continuous_integration = has(paths, (p) => p.startsWith('.github/workflows/'))
    || has(lower, (p) => p === '.gitlab-ci.yml' || p.startsWith('.circleci/'));

  const typed = has(lower, (p) => p === 'tsconfig.json' || p.endsWith('/tsconfig.json'))
    || has(lower, (p) => p.endsWith('.pyi') || p === 'mypy.ini');

  // A server directory AND a client directory, in one repository.
  const server = has(lower, (p) => p.startsWith('backend/') || p.startsWith('server/')
    || p.startsWith('api/'));
  const client = has(lower, (p) => p.startsWith('frontend/') || p.startsWith('client/')
    || p.startsWith('web/') || p.startsWith('ui/'));

  return {
    languages,
    structure,
    practices: {
      containerised,
      tested,
      documented,
      continuous_integration,
      typed,
      full_stack: server && client,
    },
    file_count: files.length,
  };
}

/**
 * True when there is enough here to say anything at all.
 *
 * A repository with two files and no recognised language should produce no description
 * rather than a thin one. "Nothing to say yet" is an honest state; a padded sentence is
 * the thing that costs the reader's belief in the rest of the page.
 */
export function hasEnoughSignal(s: RepoSignals): boolean {
  return s.file_count >= 5 && (s.languages.length > 0 || s.structure.length >= 2);
}
