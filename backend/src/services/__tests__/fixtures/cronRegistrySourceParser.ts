/**
 * cronRegistrySourceParser — text→rows. Reads nothing; every function here is pure over a
 * string, so the whole parse is testable without a filesystem or a database.
 *
 * ── Why the lists are parsed and not imported ──────────────────────────────────────
 * AGENT_REGISTRY in agentRegistrySeed.ts is module-private and that module imports the
 * Sequelize AiAgent model, so it cannot be read without editing production code or a live
 * database. SCHEDULE_REGISTRY *is* exported, but a single `require` of aiOpsScheduler.ts pulls
 * in the whole application graph. So both arrays are parsed from source, and every real parser
 * bug found here is pinned by a test in ../cronRegistryReconciliation.test.ts, whose header
 * carries the full history and the mutation table (M1-M10, I1-I4) cited below.
 *
 * ── The cron scan is an accounting of the IDENTIFIER ────────────────────────────────
 * Four times, coverage depended on how a call happened to be WRITTEN. The last two:
 * /instrumentCronJob\(\s*([^,)]+?)\s*,/ excluded ')', so `instrumentCronJob(fn('X'), …)`
 * matched nothing; the accounting that replaced it counted the contiguous substring
 * `instrumentCronJob(`, so a space, an optional call, a type argument or a line break before
 * the paren — what a formatter writes — produced ZERO occurrences: not counted, not
 * classified, not unclassifiable, never in registeredNames.
 *
 * Widening a pattern moves that cliff one syntax out, so the scan is anchored on the one thing
 * a call cannot be written without: the IDENTIFIER. Every occurrence of
 * /\binstrumentCronJob\b/ is counted (CRON_IDENTIFIER_PATTERN) and separately classified into
 * exactly one CronSiteKind — including the kinds that register nothing (importSpecifier,
 * proseMention, declaration), so they are accounted for rather than absent. The suite asserts
 * the two numbers agree and that nothing is 'unclassifiable'. CRON_CALL_SHAPE_TOKEN survives
 * only as the negative control: the old token sees nothing in forms this scan resolves.
 *
 * Measured over backend/src on 2026-10-06 (4,060 files); asserted by no test, because a census
 * is a number a maintainer bumps:
 *
 *     81 identifier occurrences = 68 exactName + 1 namePrefix + 3 dynamicArg
 *                               + 3 importSpecifier + 1 declaration + 5 proseMention
 *     77 occurrences of the old contiguous `instrumentCronJob(` token
 *
 * The 4 the old token could not see: the 3 imports, and agentRegistrySeed.ts's AiNewsRefresh
 * description, which names the wrapper with no paren beside it. The previous pass reported
 * 77 = 68 + 1 + 3 + 4 noArgument + 1 declaration; its 4 "noArgument" were the
 * `instrumentCronJob()` mentions in reeseBehaviourInventory.ts's killSwitch strings, now 4 of 5.
 *
 * An ALIAS is reported, not resolved: `const run = instrumentCronJob; run('X', fn)` is a second
 * name registrations happen through, and following it needs whole-file data-flow analysis — the
 * same trap. A non-call, non-import value reference is 'aliasAssignment', and the suite fails
 * on it by file, line and source text, demanding the parser be taught.
 *
 * ── Comment stripping is a scanner, not a regex ─────────────────────────────────────
 * The regex stripper this replaced cut `//` only after start-of-line or whitespace, so
 * `void 0;//instrumentCronJob('X', fn);` was read as LIVE CODE and reported as a real
 * registration — a guard crying wolf, worse for trust than a miss. It also stripped block
 * comments with /\/\*[\s\S]*?\*\//g before looking at strings, so a `/*` in a string ate real
 * code: measured, four whole `import` lines (data/architectMindsetScenario.ts:429-432).
 *
 * scanSource() is one pass with a context stack — code (with brace depth), template literal,
 * `${}` back in code, single/double quotes, regex literal, block and line comment. It is
 * line-count preserving because every cron diagnostic prints a line number a reader is
 * expected to open, and it reports whether the file ended back in the base code frame; the
 * suite asserts every one of ~4,000 files does, which makes a future desync loud, not silent.
 *
 * Regex literals are tracked for that reason and no other: a `'` or a backtick inside one —
 * `.replace(/'/g, "''")` in routes/admin/openclawRoutes.ts, `/[*_`]/g` in
 * services/career/careerPortfolioPublicProjection.ts — otherwise opens a string that never
 * closes, and the rest of the file is read in the wrong state. That is the failure mode that,
 * on an earlier whole-file string walker, silently reclassified 67 real registrations as
 * prose. Deleting the branch is mutation M3.
 */

export interface SeedRow { agentName: string; triggerType: string; schedule: string }
type Registry = 'SCHEDULE_REGISTRY' | 'DYNAMIC_SCHEDULE_REGISTRY';
export interface RegistryRow { agentName: string; hardcodedSchedule: string; registry: Registry }
export interface CronSites {
  /** Names passed to instrumentCronJob() as a plain string literal. */
  exactNames: string[];
  /** Prefixes from template-literal names, e.g. `Intel_${src.slug}` → 'Intel_'. */
  namePrefixes: string[];
  /** Argument expressions that are neither, e.g. 'entry.agentName'. Pinned, not ignored. */
  dynamicArgForms: string[];
  /** Files that contributed at least one registration. Lets a replay re-read exactly them. */
  files: string[];
  /** Every occurrence of the IDENTIFIER, each classified into exactly one kind. */
  callSites: CronCallSite[];
  /** The same occurrences counted by CRON_IDENTIFIER_PATTERN, not by the classifier. */
  identifierOccurrences: number;
  /** Occurrences of the old contiguous token. The negative control; nothing derives from it. */
  callShapeOccurrences: number;
  /** Files whose scan did not end in the base code frame — a desync that could move an
   *  occurrence between prose and a live call, so a failure rather than a note. */
  unbalancedFiles: string[];
}

/** The identifier a call cannot be written without; the accounting is over this. The pattern is
 *  a fresh /g regex per call, because a shared one carries lastIndex between files. */
export const CRON_IDENTIFIER = 'instrumentCronJob';
export const CRON_IDENTIFIER_PATTERN = (): RegExp => /\binstrumentCronJob\b/g;
/** The contiguous shape the scan used to count. Kept ONLY as the negative control. */
export const CRON_CALL_SHAPE_TOKEN = 'instrumentCronJob(';

/**
 * What an occurrence of CRON_IDENTIFIER turned out to be. Exhaustive by construction: every
 * occurrence gets exactly one of these, and 'unclassifiable' is a failure the suite reports
 * by file, line and source text rather than a bucket anything is allowed to sit in.
 *
 *   exactName       instrumentCronJob('Name', …) — a resolved registration
 *   namePrefix      instrumentCronJob(`Prefix${…}`, …) — expanded through real data by
 *                   cronRegistryWorld; a prefix with no expansion rule resolves to NOTHING
 *   dynamicArg      any other first argument. Pinned by EXPECTED_DYNAMIC_ARG_FORMS
 *   noArgument      instrumentCronJob() in live code. Illegal — two required parameters
 *   declaration     `function instrumentCronJob(` — the definition site itself
 *   importSpecifier `import { instrumentCronJob } from …` — a binding; registers nothing
 *   proseMention    the identifier inside a string literal; never a call
 *   aliasAssignment the identifier used as a VALUE: a second name registrations can happen
 *                   through, reported rather than followed
 *   unclassifiable  could not be read. Fails by file and line; never silently dropped
 */
export type CronSiteKind =
  | 'exactName' | 'namePrefix' | 'dynamicArg' | 'noArgument' | 'declaration'
  | 'importSpecifier' | 'proseMention' | 'aliasAssignment' | 'unclassifiable';

export interface CronCallSite {
  file: string;
  /** 1-based line in the comment-stripped text, which is the line number in the file. */
  line: number;
  kind: CronSiteKind;
  /** First-argument source text, trimmed. '' for every kind that is not a call. */
  arg: string;
  /** Resolved name (exactName) or prefix (namePrefix); '' for every other kind. */
  value: string;
  /** The comment-stripped source line the occurrence sits on, so a failure can print it. */
  text: string;
}

/** A comment-stripped source, plus where its string literals are and whether the scan ended
 *  balanced. `quoted` spans are in the coordinates of the text PASSED IN, so a scan of
 *  already-stripped text yields spans into that same text. */
export interface ScannedSource { text: string; quoted: Array<[number, number]>; balanced: boolean }

const WORD = /[A-Za-z0-9_$]/;
/** After these, a '/' opens a regex literal rather than dividing. */
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void',
  'instanceof', 'new', 'do', 'else', 'yield', 'await', 'throw']);

/** Division or regex? The standard heuristic, from the previous significant character: after an
 *  identifier, ')', ']', '.' or a closing quote it divides; otherwise it opens a regex. */
function startsRegexLiteral(text: string, at: number): boolean {
  let k = at - 1;
  while (k >= 0 && /\s/.test(text[k])) k--;
  if (k < 0) return true;
  const c = text[k];
  if (WORD.test(c)) {
    let w = k;
    while (w >= 0 && WORD.test(text[w])) w--;
    return REGEX_KEYWORDS.has(text.slice(w + 1, k + 1));
  }
  return !(c === ')' || c === ']' || c === '.' || c === "'" || c === '"' || c === '`');
}

/** Index just past the regex literal at `at`, or -1 if it does not close on this line — in
 *  which case the '/' was not a regex and is treated as an ordinary character. */
function endOfRegexLiteral(text: string, at: number): number {
  let k = at + 1;
  let inClass = false;
  while (k < text.length && text[k] !== '\n') {
    const c = text[k];
    if (c === '\\') { k += 2; continue; }
    if (inClass) { if (c === ']') inClass = false; k++; continue; }
    if (c === '[') { inClass = true; k++; continue; }
    if (c === '/') { k++; while (k < text.length && /[a-z]/.test(text[k])) k++; return k; }
    k++;
  }
  return -1;
}

/** The single pass. Returns the comment-stripped text, the string-literal spans in the INPUT's
 *  coordinates, and whether the context stack returned to the base code frame. Line-count
 *  preserving: a block comment becomes its own newlines rather than being deleted, so a line
 *  number measured in the stripped text is the line number in the file — and a number a reader
 *  opens to find unrelated code is worse than no number. */
export function scanSource(src: string): ScannedSource {
  const text = src.replace(/\r\n/g, '\n');
  const parts: string[] = [];
  const quoted: Array<[number, number]> = [];
  const stack: Array<{ tpl: boolean; depth: number }> = [{ tpl: false, depth: 0 }];
  let runStart = -1;
  let i = 0;
  const openRun = () => { if (runStart < 0) runStart = i; };
  const closeRun = () => { if (runStart >= 0) { quoted.push([runStart, i]); runStart = -1; } };
  while (i < text.length) {
    const ctx = stack[stack.length - 1];
    const c = text[i];
    if (ctx.tpl) {
      openRun();
      if (c === '\\') { parts.push(text.slice(i, i + 2)); i += 2; continue; }
      if (c === '`') { parts.push(c); i++; closeRun(); stack.pop(); continue; }
      if (c === '$' && text[i + 1] === '{') { closeRun(); parts.push('${'); i += 2; stack.push({ tpl: false, depth: 0 }); continue; }
      parts.push(c); i++; continue;
    }
    closeRun();
    if (c === '`') { openRun(); parts.push(c); i++; stack.push({ tpl: true, depth: 0 }); continue; }
    if (c === '{') { ctx.depth++; parts.push(c); i++; continue; }
    if (c === '}') {
      parts.push(c); i++;
      if (ctx.depth === 0 && stack.length > 1) stack.pop(); // back out to the enclosing `${}`
      else ctx.depth = Math.max(0, ctx.depth - 1);
      continue;
    }
    if (c === "'" || c === '"') {
      // A quoted literal cannot span a line, so an unterminated one is abandoned at the
      // newline instead of swallowing the rest of the file.
      openRun();
      parts.push(c); i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') {
        const n = text[i] === '\\' ? 2 : 1;
        parts.push(text.slice(i, i + n)); i += n;
      }
      if (i < text.length && text[i] === c) { parts.push(c); i++; }
      closeRun();
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      parts.push(text.slice(i, stop).replace(/[^\n]/g, '')); // keep the newlines, drop the rest
      i = stop; continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i); // the newline itself survives, so lines still line up
      i = nl < 0 ? text.length : nl; continue;
    }
    if (c === '/' && startsRegexLiteral(text, i)) {
      const end = endOfRegexLiteral(text, i);
      if (end > 0) { parts.push(text.slice(i, end)); i = end; continue; }
    }
    parts.push(c); i++;
  }
  closeRun();
  return { text: parts.join(''), quoted, balanced: stack.length === 1 && !stack[0].tpl };
}

/** Strips block and line comments. See scanSource() for the mechanism and the two bug classes
 *  (a `//` after a non-space character; a `/*` inside a string literal) it fixes. */
export const stripComments = (src: string): string => scanSource(src).text;

/** Returns the bracket-balanced array literal following `marker`. Searches for the opening
 *  bracket after the `=`, because every marker here contains a `T[]` type annotation whose own
 *  `[` would otherwise be taken as the array. Throws if absent. */
export function sliceArrayLiteral(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`sliceArrayLiteral: marker not found: ${marker}`);
  const open = src.indexOf('[', src.indexOf('=', at));
  if (open < 0) throw new Error(`sliceArrayLiteral: no array literal after: ${marker}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`sliceArrayLiteral: unterminated array after: ${marker}`);
}

/** Every depth-1 `{...}` of an array literal, as source text. A brace walker that skips
 *  quoted strings, so it shares no regex with parseSeedRows/parseRegistryRows and is a
 *  genuinely independent count of the same entries — the replacement for the hardcoded entry
 *  censuses this suite used to assert. A maintainer cannot bump it, and a parser that
 *  over-matches (phantom nested entries) or under-matches (anchor miss) disagrees at once. */
export function topLevelObjectLiterals(arraySrc: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let i = 0;
  while (i < arraySrc.length) {
    const c = arraySrc[i];
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < arraySrc.length && arraySrc[i] !== c) i += arraySrc[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && --depth === 0 && start >= 0) {
      out.push(arraySrc.slice(start, i + 1));
      start = -1;
    }
    i++;
  }
  return out;
}

/** Splits an array literal into one segment per occurrence of `anchor`. */
function segmentsBy(arraySrc: string, anchor: RegExp): Array<{ name: string; body: string }> {
  const hits: Array<[number, string]> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(anchor.source, anchor.flags.includes('g') ? anchor.flags : `${anchor.flags}g`);
  while ((m = re.exec(arraySrc)) !== null) hits.push([m.index, m[1]]);
  return hits.map(([start, name], i) => ({ name, body: arraySrc.slice(start, i + 1 < hits.length ? hits[i + 1][0] : arraySrc.length) }));
}

/** Parses SCHEDULE_REGISTRY / DYNAMIC_SCHEDULE_REGISTRY entries. */
export function parseRegistryRows(arraySrc: string, registry: Registry): RegistryRow[] {
  return segmentsBy(arraySrc, /agentName:\s*'([^']+)'/).map(({ name, body }) => {
    const s = /hardcodedSchedule:\s*'([^']+)'/.exec(body);
    return { agentName: name, hardcodedSchedule: s ? s[1] : '', registry };
  });
}

/** Parses AgentSeedEntry rows. `agent_name` is anchored to four-space indentation so the nested
 *  `config: { department_slug: '…', agent_name: '…' }` of the 16 dept-architect rows is not read
 *  as a new entry; trigger_type/schedule accept own-line or several-props-per-line formatting
 *  (the nine Intel_* rows use the latter). */
export function parseSeedRows(arraySrc: string): SeedRow[] {
  return segmentsBy(arraySrc, /^ {4}agent_name:\s*'([^']+)'/m).map(({ name, body }) => {
    const t = /(?:^ {4}|,\s+)trigger_type:\s*'([^']+)'/m.exec(body);
    const s = /(?:^ {4}|,\s+)schedule:\s*'([^']*)'/m.exec(body);
    return { agentName: name, triggerType: t ? t[1] : '', schedule: s ? s[1] : '' };
  });
}

/** `terminator`: ',' a second argument follows (every real call has two); ')' the call ends
 *  here; 'eof' the scan ran off the end, which is never a readable call. */
export interface FirstArgument { text: string; terminator: ',' | ')' | 'eof' }

/** Reads the first argument of the call whose '(' is at `openParen`, and nothing more.
 *  Bracket-depth aware so a call, array or object in that position is read whole, and
 *  quote-aware so a ',' or ')' inside a string does not end it. Deliberately ANCHORED: it
 *  starts at the call's own paren and stops at the first depth-1 ',', always before the
 *  callback body, so nothing earlier in the file can shift it — which is what a whole-file
 *  string walker could not promise (see the header). */
export function readFirstArgument(src: string, openParen: number): FirstArgument {
  if (src[openParen] !== '(') throw new Error(`readFirstArgument: expected '(' at ${openParen}, got ${JSON.stringify(src[openParen])}`);
  let depth = 0;
  let i = openParen;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      if (i >= src.length) return { text: src.slice(openParen + 1), terminator: 'eof' };
      i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth === 0) return { text: src.slice(openParen + 1, i), terminator: ')' };
    } else if (c === ',' && depth === 1) {
      return { text: src.slice(openParen + 1, i), terminator: ',' };
    }
    i++;
  }
  return { text: src.slice(openParen + 1), terminator: 'eof' };
}

const skipSpace = (text: string, i: number): number => { while (i < text.length && /\s/.test(text[i])) i++; return i; };

/** Index just past a balanced `<…>` type-argument list, or -1 when it is not one. Bounded so a
 *  stray '<' cannot run to the file's end; an unreadable one is a failure, not a guess. */
function endOfTypeArguments(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length && i < open + 200; i++) {
    const c = text[i];
    if (c === '<') depth++;
    else if (c === '>') { depth--; if (depth === 0) return i + 1; }
    else if (c === ';' || c === '(' || c === '{' || c === "'" || c === '"' || c === '`') return -1;
  }
  return -1;
}

/** True when the occurrence at `at` is an import/export clause binding or a default import: it
 *  introduces the name and registers nothing. Any OTHER binding form (a `require` destructure,
 *  say) is deliberately not matched, so it surfaces as an aliasAssignment failure naming its
 *  file and line rather than being waved through. */
function isBindingSpecifier(text: string, at: number): boolean {
  let k = at - 1;
  while (k >= 0 && /[A-Za-z0-9_$,\s]/.test(text[k])) k--;
  if (k >= 0 && text[k] === '{') {
    return /\b(import|export)\s*(type\s*)?$/.test(text.slice(Math.max(0, k - 40), k));
  }
  return /\bimport\s+(type\s+)?$/.test(text.slice(Math.max(0, at - 40), at));
}

/** True when an import/export specifier RENAMES the binding: `instrumentCronJob as runCron`.
 *
 *  This is the one alias form `import` can express, and it has to be told apart from a plain
 *  specifier. A plain `import { instrumentCronJob }` introduces only the canonical name, which
 *  every call rule below already covers. A renamed one introduces a SECOND name that
 *  registrations can happen through, and this scan cannot predict it — which is precisely the
 *  hazard the file refuses to chase, so it is reported as an alias rather than waved through.
 *  An adversarial grader registered a live cron this way with the whole suite green. */
function isRenamedSpecifier(text: string, at: number): boolean {
  const after = text.slice(at + CRON_IDENTIFIER.length, at + CRON_IDENTIFIER.length + 64);
  return /^\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*/.test(after);
}

/** Classifies the single occurrence of CRON_IDENTIFIER at `at`. Total: every occurrence gets
 *  exactly one kind, and what cannot be read gets 'unclassifiable' so the suite fails on it by
 *  file, line and source text.
 *
 *  `inString` comes from scanSource()'s quoted spans and is checked FIRST: nothing inside a
 *  string literal can declare, import or call anything, so a call-shaped doc string must not
 *  be read as a registration — pretending to resolve one would clear a seed row out of
 *  invariant (i) just as thoroughly as dropping a real one. */
export function classifyCronCallSite(text: string, at: number, inString = false): { kind: CronSiteKind; arg: string; value: string } {
  const none = (kind: CronSiteKind) => ({ kind, arg: '', value: '' });
  if (inString) return none('proseMention');
  if (/\bfunction\s+$/.test(text.slice(Math.max(0, at - 32), at))) return none('declaration');
  if (isBindingSpecifier(text, at)) {
    return none(isRenamedSpecifier(text, at) ? 'aliasAssignment' : 'importSpecifier');
  }

  // The call, however it is spaced: optional whitespace (including a line break), an optional
  // `?.`, optional `<T>` type arguments, then '('. Anything else is the identifier as a value.
  let j = skipSpace(text, at + CRON_IDENTIFIER.length);
  if (text.startsWith('?.', j)) j = skipSpace(text, j + 2);
  if (text[j] === '<') {
    const close = endOfTypeArguments(text, j);
    if (close < 0) return { kind: 'unclassifiable', arg: text.slice(j, j + 48).trim(), value: '' };
    j = skipSpace(text, close);
  }
  if (text[j] !== '(') return none('aliasAssignment');

  const first = readFirstArgument(text, j);
  const arg = first.text.trim();
  if (first.terminator === 'eof') return { kind: 'unclassifiable', arg, value: '' };
  if (first.terminator === ')') {
    // Two required parameters (cronInstrumentation.ts) and CI typechecks every production file,
    // so a zero-argument call is not legal code — the suite asserts there are none outside a
    // string. One argument is neither prose nor legal, so it fails rather than being tolerated.
    return arg === '' ? { kind: 'noArgument', arg, value: '' } : { kind: 'unclassifiable', arg, value: '' };
  }
  const lit = /^(['"])([A-Za-z0-9_]+)\1$/.exec(arg);
  if (lit) return { kind: 'exactName', arg, value: lit[2] };
  const tpl = /^`([A-Za-z0-9_]+)\$\{/.exec(arg);
  if (tpl) return { kind: 'namePrefix', arg, value: tpl[1] };
  return { kind: 'dynamicArg', arg, value: '' };
}

/** The kinds that put a name into the registered set, and so make a file a cron site. NOT
 *  exported: the suite restates this list as its own literal, so promoting a kind here (prose
 *  counted as a registration, say) disagrees with `files` and fails. */
const REGISTERING_KINDS: ReadonlyArray<CronSiteKind> = ['exactName', 'namePrefix', 'dynamicArg'];

/** Accounts for every instrumentCronJob IDENTIFIER occurrence in already-comment-stripped
 *  sources. `identifierOccurrences` is counted by CRON_IDENTIFIER_PATTERN; `callSites` holds
 *  one classified entry per occurrence, found by an independent indexOf walk with its own
 *  word-boundary check. The suite asserts the two agree — the invariant that makes a form this
 *  parser has never seen a failure instead of a silent zero. */
export function scanCronSites(sources: Array<{ file: string; text: string }>): CronSites {
  const callSites: CronCallSite[] = [];
  const unbalancedFiles: string[] = [];
  let identifierOccurrences = 0;
  let callShapeOccurrences = 0;
  for (const { file, text } of sources) {
    const occurrences = (text.match(CRON_IDENTIFIER_PATTERN()) || []).length;
    if (occurrences === 0) continue;
    identifierOccurrences += occurrences;
    callShapeOccurrences += text.split(CRON_CALL_SHAPE_TOKEN).length - 1;
    const scanned = scanSource(text);
    if (!scanned.balanced) unbalancedFiles.push(file);
    const lines = text.split('\n');
    const isWord = (c: string | undefined) => c !== undefined && WORD.test(c);
    for (let at = text.indexOf(CRON_IDENTIFIER); at >= 0; at = text.indexOf(CRON_IDENTIFIER, at + CRON_IDENTIFIER.length)) {
      if (isWord(text[at - 1]) || isWord(text[at + CRON_IDENTIFIER.length])) continue; // e.g. instrumentCronJobSafe
      const line = text.slice(0, at).split('\n').length;
      const inString = scanned.quoted.some(([s, e]) => at >= s && at < e);
      callSites.push({ file, line, text: (lines[line - 1] ?? '').trim(), ...classifyCronCallSite(text, at, inString) });
    }
  }
  const of = (kind: CronSiteKind) => callSites.filter((s) => s.kind === kind);
  return {
    exactNames: [...new Set(of('exactName').map((s) => s.value))].sort(),
    namePrefixes: [...new Set(of('namePrefix').map((s) => s.value))].sort(),
    dynamicArgForms: [...new Set(of('dynamicArg').map((s) => s.arg))].sort(),
    files: [...new Set(callSites.filter((s) => REGISTERING_KINDS.includes(s.kind)).map((s) => s.file))].sort(),
    callSites,
    identifierOccurrences,
    callShapeOccurrences,
    unbalancedFiles: unbalancedFiles.sort(),
  };
}

/** Resolves `const NAME = 'Value'` for the UPPER_SNAKE identifiers handed to
 *  instrumentCronJob() (today: HANDOFF_DIGEST_AGENT → 'GrowthJourneyHandoffDigest'). */
export function resolveNameConstants(identifiers: string[], sources: Array<{ file: string; text: string }>): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const id of identifiers) {
    for (const { text } of sources) {
      const hit = new RegExp(`\\b${id}\\s*=\\s*'([A-Za-z0-9_]+)'`).exec(text);
      if (hit) { resolved.set(id, hit[1]); break; }
    }
  }
  return resolved;
}

/** The real slugs behind the `Intel_${src.slug}` cron site, which is what makes the `Intel_`
 *  prefix expandable into concrete names instead of a bare `startsWith` that would clear any
 *  seed row beginning with those six characters.
 *
 *  Only barrel-imported modules count: `listIntelSources()` returns the adapters that
 *  registered themselves at import of services/intel/sources, so a source file that exists but
 *  is not in the barrel never registers and never fires. A barrel module that calls
 *  registerIntelSource() but whose slug cannot be read THROWS rather than being skipped — a
 *  silently dropped slug is exactly the false all-clear this module exists to prevent. */
export function parseIntelSourceSlugs(barrelText: string, readModule: (base: string) => string): string[] {
  const bases = [...barrelText.matchAll(/import\s+'\.\/([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  const slugs: string[] = [];
  for (const base of bases) {
    const text = readModule(base);
    if (!/registerIntelSource\s*\(/.test(text)) continue; // a helper, not an adapter
    const hit = /\bSLUG\s*=\s*'([A-Za-z0-9_]+)'/.exec(text);
    if (!hit) {
      throw new Error(`parseIntelSourceSlugs: ${base} calls registerIntelSource() but declares no readable ` +
        `SLUG constant. Teach this parser how to read its slug — do not let it be skipped.`);
    }
    slugs.push(hit[1]);
  }
  return [...new Set(slugs)].sort();
}
