import * as ts from 'typescript';

/**
 * bannedCopyScanner — find a banned WORD in user-facing copy inside TypeScript/TSX source,
 * and account for every other occurrence of it by name. Pure: source comes in as a string.
 *
 * WHY THIS EXISTS AT ALL. `brandGovernance` can only judge content that passes through the
 * composer - a row in `content_items` carrying a `brand_id`. The word "free" is banned by
 * 40 TAC 807.172(d) on EVERY surface, and the largest surface in this repo is React source
 * that no composer ever sees. A rules engine with no reach over `frontend/src` is not
 * enforcement of that rule; this module is the other half.
 *
 * WHY THE TYPESCRIPT PARSER AND NOT A REGEX. A regex over whole files flags this very header,
 * flags `claimKey="pricing.free"`, and flags `/api/.../free-access`, so whoever runs it learns
 * to ignore it. The obvious repair - a cleverer regex that "skips comments and identifiers" -
 * fails in the opposite and much worse direction: it is a parser with holes, and a hole is a
 * silent pass. The sibling failure is on record in this programme: a cron-registry lint whose
 * regex excluded `)` reported 23/23 green while a live job written as `instrument(name('X'))`
 * matched nothing at all.
 *
 * So the real parser does the tokenising, and the design principle is COMPLETENESS rather than
 * a better pattern:
 *
 *   Every raw occurrence of the word in the file is classified. Each one is either inside a
 *   token (the parser says which kind) or inside a comment range (leading trivia of some
 *   token, including the end-of-file token). Those two sets cover every character position in
 *   a source file, so there is no third case - and if a position ever turns up in neither,
 *   this module reports it as `unclassified` rather than passing over it. `unclassified` is
 *   wired to FAIL the lint by file and line, so a hole in this reasoning becomes loud instead
 *   of becoming coverage that is not there.
 *
 * WHICH WAY THIS ERRS. Toward over-flagging. A lone `'free'` used as a plan-tier value is
 * reported as copy, because telling a tier value from a one-word badge needs intent that is
 * not in the source. Over-flagging is absorbed by the frozen baseline in the lint test, where
 * it stays visible and auditable; under-flagging would be a legal exposure wearing a green
 * tick. The exclusions below are therefore STRUCTURAL - this is a comment, this is an import
 * path, this is an attribute no human reads - and never about what a string means.
 */

/** A banned word and the authority that bans it. */
export interface BannedWordRule {
  id: string;
  /** Matched case-insensitively on word boundaries, so "freedom" and "freely" do not match. */
  word: string;
  reason: string;
  /** What to write instead. */
  approvedAlternatives: readonly string[];
}

export const FREE_WORD_RULE: BannedWordRule = {
  id: 'tac-807-172-d-free',
  word: 'free',
  reason: '40 TAC 807.172(d) (Texas Workforce Commission): training must not be advertised as "free".',
  approvedAlternatives: ['$0 to start', 'No card needed'],
};

/**
 * Why an occurrence is NOT user-facing copy. A CLOSED set: `scanSource` records one of these
 * or null (meaning it IS copy). `unclassified` is the one value meaning "this scanner did not
 * understand", which the lint treats as a failure rather than a pass.
 */
export type ExclusionReason =
  | 'comment'
  | 'identifier'
  | 'regex-literal'
  | 'import-specifier'
  | 'object-key'
  | 'jsx-attribute'
  | 'claim-key'
  | 'url-or-path'
  | 'dotted-key'
  | 'unclassified';

export const EXCLUSION_REASONS: readonly ExclusionReason[] = [
  'comment', 'identifier', 'regex-literal', 'import-specifier', 'object-key',
  'jsx-attribute', 'claim-key', 'url-or-path', 'dotted-key', 'unclassified',
];

/**
 * JSX attributes whose value is machinery, not prose. `alt`, `title`, `placeholder`,
 * `aria-label` and `label` are deliberately ABSENT: a screen-reader user hears those, so they
 * are copy and must be checked.
 */
const NON_COPY_ATTRIBUTES: readonly string[] = [
  'className', 'id', 'key', 'htmlFor', 'name', 'type', 'role', 'style', 'src', 'to', 'href',
  'claimKey', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'data-testid', 'testId',
];

/** Functions whose string argument is a registry key, not a sentence. */
const KEY_ARGUMENT_FUNCTIONS: readonly string[] = ['canShow', 'publicClaim', 'claimFor'];

export interface Occurrence {
  /** 1-indexed. */
  line: number;
  /** 1-indexed. */
  column: number;
  /** The word exactly as written, so case stays auditable. */
  text: string;
  /** The parser's name for the token this sits in, or 'Trivia' for a comment. */
  tokenKind: string;
  /** null means this IS user-facing copy, i.e. a violation. */
  excluded: ExclusionReason | null;
  /** The line it appeared on, trimmed and capped, for the failure message. */
  snippet: string;
}

export interface ScanResult {
  /** Every raw occurrence, each classified. Its length always equals the raw match count. */
  occurrences: Occurrence[];
  /** The subset that is user-facing copy. */
  violations: Occurrence[];
  /** What the scanner could not place. Non-empty means the SCANNER is wrong, not that the file is clean. */
  unclassified: Occurrence[];
}

function wordRegex(word: string): RegExp {
  // Word boundaries are what keep "freedom", "freely", "freelance" and "freeTier" out: in
  // "freeTier" there is no boundary between "free" and "T", both being word characters.
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
}

/**
 * Every leaf token, in source order, with the half-open range it covers.
 *
 * `getChildren`, NOT `forEachChild`. This is the difference between total coverage and a
 * scanner with holes, and the completeness invariant is what found it: `forEachChild` visits
 * only semantic children and skips every punctuation and keyword token, so braces, `const`
 * and `}` were absent from the leaf set - and with them the comments that hang off those
 * tokens as leading trivia. The first draft of this file reported 96 occurrences as
 * `unclassified` for exactly that reason, 93 of them ordinary JSDoc. Three were `{/* ... *\/}`
 * JSX comments, which `forEachChild` reported as a childless `JsxExpression` and so as a leaf
 * of an unknown kind. With `getChildren` both classes land where they belong.
 */
function leafTokens(sf: ts.SourceFile): Array<{ start: number; end: number; node: ts.Node }> {
  const out: Array<{ start: number; end: number; node: ts.Node }> = [];
  const walk = (n: ts.Node): void => {
    const children = n.getChildren(sf);
    if (children.length === 0) out.push({ start: n.getStart(sf), end: n.getEnd(), node: n });
    else for (const c of children) walk(c);
  };
  walk(sf);
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The TRIVIA gaps: everything between consecutive tokens, plus the run before the first token.
 *
 * Together with the leaf ranges these cover every character position in the file, with no
 * third case - which is the property the whole completeness argument rests on. Trivia is
 * whitespace and comments and nothing else, so a WORD character inside a gap is necessarily
 * inside a comment; the classification needs no comment parser and cannot disagree with one.
 *
 * (The one other thing the grammar allows in trivia is a `#!` shebang on line 1, which would
 * be reported as `comment` too. No file in scope has one, and a banned word in a shebang is
 * not copy either way.)
 *
 * This replaced `ts.getLeadingCommentRanges` over each token, which missed the trivia of JSX
 * `{/* ... *\/}` comments and left three real occurrences unplaced.
 */
function triviaGaps(sf: ts.SourceFile, leaves: Array<{ start: number; end: number }>): Array<{ pos: number; end: number }> {
  const out: Array<{ pos: number; end: number }> = [];
  let cursor = 0;
  for (const l of leaves) {
    if (l.start > cursor) out.push({ pos: cursor, end: l.start });
    cursor = Math.max(cursor, l.end);
  }
  const total = sf.getFullText().length;
  if (cursor < total) out.push({ pos: cursor, end: total });
  return out;
}

function jsxAttributeNameOf(node: ts.Node): string | null {
  // The literal may be the initializer directly (attr="x") or wrapped in braces (attr={'x'}).
  let n: ts.Node | undefined = node.parent;
  if (n && ts.isJsxExpression(n)) n = n.parent;
  if (n && ts.isJsxAttribute(n)) return n.name.getText();
  return null;
}

function calleeNameOf(node: ts.Node): string | null {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return null;
  if (!p.arguments.some((a) => a === node)) return null;
  const e = p.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** Structural exclusions for a string or template token. Returns null when it is prose. */
function classifyTextToken(node: ts.Node, source: string, matchStart: number, matchEnd: number): ExclusionReason | null {
  const p = node.parent;

  if (p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node) {
    return 'import-specifier';
  }
  if (calleeNameOf(node) === 'require') return 'import-specifier';

  // An object KEY is a name. Its VALUE is prose, which is why only `name === node` excludes.
  if (p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isEnumMember(p)) && p.name === node) return 'object-key';
  // A literal TYPE (`type Tier = 'free' | 'paid'`) is a type name, never rendered.
  if (p && ts.isLiteralTypeNode(p)) return 'object-key';

  const attr = jsxAttributeNameOf(node);
  if (attr && NON_COPY_ATTRIBUTES.includes(attr)) return 'jsx-attribute';

  const callee = calleeNameOf(node);
  if (callee && KEY_ARGUMENT_FUNCTIONS.includes(callee)) return 'claim-key';

  // Shape of the surrounding token. `/api/accelerator/free-access` is a path;
  // `surface.free.workspace` and `pricing.free` are registry keys. A hyphen ALONE is not a
  // signal, because "Free-trial signups" is prose.
  const left = source.slice(Math.max(0, matchStart - 80), matchStart);
  const right = source.slice(matchEnd, matchEnd + 80);
  const tokenLeft = /[A-Za-z0-9_$./-]*$/.exec(left)?.[0] ?? '';
  const tokenRight = /^[A-Za-z0-9_$./-]*/.exec(right)?.[0] ?? '';
  const token = tokenLeft + source.slice(matchStart, matchEnd) + tokenRight;

  // A PATH, not merely a token containing a slash. The looser test ("contains /") would
  // swallow prose like "free/low-cost training", so the token must actually look like a path
  // or a URL: leading `/`, `./`, `../`, or a scheme.
  if (/^(\.{0,2}\/|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/.test(token)) return 'url-or-path';

  // A dot only means "key" when it JOINS two name parts. The first draft tested
  // `tokenRight.startsWith('.')` and so excluded "The Open House is free." and "...invite
  // your team free. Activate licenses" - two genuine violations lost to a full stop. A
  // sentence-ending period is followed by a space, a quote or a line end, never by a letter.
  if (/[A-Za-z0-9]\.$/.test(tokenLeft)) return 'dotted-key';
  if (/^\.[A-Za-z0-9]/.test(tokenRight)) return 'dotted-key';
  // snake_case is a name in every language in this repo, and prose does not use underscores.
  if (token.includes('_')) return 'dotted-key';

  return null;
}

const TEXT_TOKEN_KINDS: readonly ts.SyntaxKind[] = [
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
];

/**
 * Scan one file. `fileName` decides the parse mode, so a `.tsx` file is parsed as TSX and its
 * JSX text becomes `JsxText` tokens instead of a parse error.
 */
export function scanSource(fileName: string, source: string, rule: BannedWordRule = FREE_WORD_RULE): ScanResult {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const leaves = leafTokens(sf);
  const trivia = triviaGaps(sf, leaves);
  const lines = source.split('\n');

  const occurrences: Occurrence[] = [];
  const re = wordRegex(rule.word);
  let m: RegExpExecArray | null = re.exec(source);
  while (m !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const { line, character } = sf.getLineAndCharacterOfPosition(start);

    const leaf = leaves.find((l) => start >= l.start && end <= l.end);
    let tokenKind: string;
    let excluded: ExclusionReason | null;

    if (leaf) {
      tokenKind = ts.SyntaxKind[leaf.node.kind];
      if (leaf.node.kind === ts.SyntaxKind.JsxText) {
        excluded = null; // JSX text is on the page by definition.
      } else if (TEXT_TOKEN_KINDS.includes(leaf.node.kind)) {
        excluded = classifyTextToken(leaf.node, source, start, end);
      } else if (leaf.node.kind === ts.SyntaxKind.Identifier || leaf.node.kind === ts.SyntaxKind.PrivateIdentifier) {
        excluded = 'identifier';
      } else if (leaf.node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        excluded = 'regex-literal';
      } else if (tokenKind.startsWith('JSDoc')) {
        // `getChildren` surfaces doc comments as real nodes (`JSDocComment`, `JSDocText`, …)
        // rather than as trivia, so a banned word in JSDoc arrives here and not in a gap.
        excluded = 'comment';
      } else {
        // A keyword or punctuation token cannot contain the word, so arriving here means the
        // taxonomy above is incomplete. Named, not swallowed.
        excluded = 'unclassified';
      }
    } else if (trivia.some((c) => start >= c.pos && end <= c.end)) {
      tokenKind = 'Trivia';
      excluded = 'comment';
    } else {
      tokenKind = 'None';
      excluded = 'unclassified';
    }

    occurrences.push({
      line: line + 1,
      column: character + 1,
      text: m[0],
      tokenKind,
      excluded,
      snippet: (lines[line] ?? '').trim().slice(0, 160),
    });
    m = re.exec(source);
  }

  return {
    occurrences,
    violations: occurrences.filter((o) => o.excluded === null),
    unclassified: occurrences.filter((o) => o.excluded === 'unclassified'),
  };
}

/** The raw count, computed WITHOUT the parser, so the completeness invariant has a second opinion. */
export function rawMatchCount(source: string, rule: BannedWordRule = FREE_WORD_RULE): number {
  return source.match(wordRegex(rule.word))?.length ?? 0;
}
