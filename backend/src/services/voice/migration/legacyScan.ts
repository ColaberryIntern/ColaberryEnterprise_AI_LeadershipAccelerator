/**
 * Synthflow reference scan (VS5.4), pure: what in this repository still DEPENDS on Synthflow.
 *
 * Operational: an identifier, string, call or import in code that names it; its environment variables; its
 * hosts; any mention in any other text file. Constant strings are read as the program reads them: escapes
 * decoded, "a" + "b" and `a${'b'}` joined.
 * Tooling: the migration tools (an explicit list). Counted apart, and they block a clean result too: they
 * hold live clients for the vendor, so they go with the rest.
 * Archival: a constant on a line whose real comment says why, such as
 *   const PROVIDER = 'synthflow'; // synthflow-archival: historical rows keep their provider name
 * A mark needs a reason of 10 characters, and never excuses a host, an environment variable, a config line,
 * an import, anything in a call, or a use of a named value (only a declared name or a property name is
 * excusable as an identifier, so a mark cannot hand a live object to an alias).
 *
 * Not seen, by nature: a name assembled at run time from variables, files git does not track, binaries.
 * Not read, by choice: documentation, tests and the ticket artifacts (they describe, they do not run).
 * Comments in code are not counted; in other files only a line that is nothing but a comment is not.
 */
import ts from 'typescript';

export type Kind = 'host' | 'env' | 'dispatch' | 'reference' | 'identifier' | 'string' | 'config';
export interface Hit { file: string; line: number; kind: Kind }
export interface ScanReport { operational: Hit[]; tooling: Hit[]; archival: Hit[]; badMarks: Hit[]; filesScanned: number; byKind: Record<Kind, number>; clean: boolean }

const NAME = /synthe?[_-]?flow/i;
const HOST = /(?:[a-z0-9-]+\.)*synthflow\.(?:ai|com|io)/i;
const ENV = /(?:^|[^A-Za-z0-9_])[A-Z0-9_]*(?:SYNTHE?_?FLOW_[A-Z0-9_]+|ENABLE_SYNTHE?_?FLOW)/;
const MARK = /synthflow-archival:\s*(.*)$/;
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const BINARY = /\.(?:png|jpe?g|gif|svg|ico|pdf|webp|avif|mp[34]|m4a|wav|webm|mov|woff2?|ttf|otf|eot|zip|gz|tgz|xlsx?|docx?|pptx?)$/i;
/** Documentation, tests and the generated ticket PDFs' source; installed packages and their lock files. */
const SKIP = /(?:^|\/)node_modules\/|(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$|^docs\/|^directives\/|^tests\/|^scripts\/artifacts\/|\.md$|(?:^|\/)package-lock\.json$/;
/** Only the scanner itself is left out: it has to name what it looks for. */
const SELF = new Set(['backend/src/services/voice/migration/legacyScan.ts', 'backend/src/scripts/voice/scanLegacy.ts']);
export const TOOLING: ReadonlySet<string> = new Set([
  ...['assistantInventory', 'privateCapture', 'historyExport', 'historyImport', 'matrix'].map((f) => `backend/src/services/voice/migration/${f}.ts`),
  ...['migrationReport', 'history', 'statusCheck', 'voiceInventory', 'voiceInventoryClassifier'].map((f) => `backend/src/scripts/voice/${f}.ts`),
]);

export const isScanned = (path: string): boolean => !SKIP.test(path) && !BINARY.test(path) && !SELF.has(path);

interface Found { hits: Hit[]; marks: Map<number, string> }
const isCallLike = (n: ts.Node): boolean => ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n) || ts.isJsxOpeningLikeElement(n) || ts.isDecorator(n);
const isImportLike = (n: ts.Node): boolean => ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isImportEqualsDeclaration(n) || ts.isImportTypeNode(n);

/** A name being declared or a property name: not a use of a value. */
function isNameSlot(n: ts.Node): boolean {
  const p = n.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) return (ts.isPropertyAccessExpression(p) ? p.name : p.right) === n && !isValueChain(p);
  const named = p as ts.Node & { name?: ts.Node };
  return named.name === n && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isParameter(p) || ts.isEnumMember(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isBindingElement(p) || ts.isJsxAttribute(p));
}
/** obj.synthflowService.x: the property is itself a value being used. */
const isValueChain = (p: ts.Node): boolean => ts.isPropertyAccessExpression(p.parent) || ts.isElementAccessExpression(p.parent);

/** The constant value of an expression, or null. */
function constant(n: ts.Node): string | null {
  if (ts.isStringLiteralLike(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) return constant(n.expression);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = constant(n.left);
    const b = a === null ? null : constant(n.right);
    return b === null ? null : a + b;
  }
  if (ts.isTemplateExpression(n)) {
    let s = n.head.text;
    for (const x of n.templateSpans) {
      const v = constant(x.expression);
      if (v === null) return null;
      s += v + x.literal.text;
    }
    return s;
  }
  return null;
}

const classify = (s: string, kind: Kind, inUse: boolean): Kind => (HOST.test(s) ? 'host' : ENV.test(s) ? 'env' : inUse ? 'dispatch' : kind);

function codeHits(file: string, text: string): Found {
  const hits: Hit[] = [];
  const marks = new Map<number, string>();
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) || /\.[cm]?js$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const add = (line: number, kind: Kind) => { if (!hits.some((h) => h.line === line && h.kind === kind)) hits.push({ file, line, kind }); };
  const look = (n: ts.Node, value: string, kind: Kind, inUse: boolean) => {
    const start = lineOf(n.getStart(sf));
    let found = false;
    // a long template spans lines: report the line the name is on
    n.getText(sf).split('\n').forEach((part, i) => { if (NAME.test(part)) { found = true; add(start + i, classify(part, kind, inUse)); } });
    if (!found && NAME.test(value)) add(start, classify(value, kind, inUse));
  };
  const walk = (n: ts.Node, inUse: boolean): void => {
    // a call covers its callee and arguments, but not the body of a function passed to it
    const use = isCallLike(n) || isImportLike(n) || (inUse && !ts.isFunctionLike(n) && !ts.isBlock(n));
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) look(n, n.text, isNameSlot(n) ? 'identifier' : 'reference', use);
    else if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n) || ts.isRegularExpressionLiteral(n)) look(n, n.text, 'string', use);
    else if (ts.isBinaryExpression(n) || ts.isTemplateExpression(n)) {
      const v = constant(n);
      if (v !== null && NAME.test(v)) add(lineOf(n.getStart(sf)), classify(v, 'string', use));
    }
    ts.forEachChild(n, (c) => walk(c, use));
  };
  walk(sf, false);
  if (hits.length) {
    for (const c of comments(sf, text)) {
      const m = MARK.exec(text.slice(c.pos, c.end).replace(/\*\/$/, ''));
      if (m) marks.set(lineOf(c.pos), m[1].trim());
    }
  }
  return { hits, marks };
}

/** Real comments only: what TypeScript itself treats as trivia around tokens. */
function comments(sf: ts.SourceFile, text: string): ts.CommentRange[] {
  const seen = new Map<number, ts.CommentRange>();
  const jsx: Array<[number, number]> = [];
  const findJsx = (n: ts.Node): void => { if (ts.isJsxText(n)) jsx.push([n.pos, n.end]); ts.forEachChild(n, findJsx); };
  findJsx(sf);
  const visit = (n: ts.Node): void => {
    const children = n.getChildren(sf);
    if (!children.length && n.kind !== ts.SyntaxKind.JsxText) {
      for (const c of [...(ts.getLeadingCommentRanges(text, n.pos) ?? []), ...(ts.getTrailingCommentRanges(text, n.end) ?? [])]) seen.set(c.pos, c);
    }
    children.forEach(visit);
  };
  visit(sf);
  // text between JSX tags is shown to people, not a comment, even when it starts with //
  return [...seen.values()].filter((c) => !jsx.some(([a, b]) => c.pos >= a && c.pos < b));
}

function textHits(file: string, text: string): Found {
  const hits: Hit[] = [];
  const marks = new Map<number, string>();
  const comment = /\.sql$/i.test(file) ? /^\s*--/ : /\.(?:json|html?|css|xml|csv|txt|vtt|snap)$/i.test(file) ? /^(?!)/ : /^\s*#/;
  text.split('\n').forEach((l, i) => {
    const m = MARK.exec(l);
    if (m) marks.set(i + 1, m[1].trim());
    if (!comment.test(l) && NAME.test(l)) hits.push({ file, line: i + 1, kind: classify(l, 'config', false) });
  });
  return { hits, marks };
}

export function scanFile(file: string, text: string): { operational: Hit[]; archival: Hit[]; badMarks: Hit[] } {
  const t = text.replace(/\r\n?/g, '\n');
  const { hits, marks } = CODE.test(file) ? codeHits(file, t) : textHits(file, t);
  const out = { operational: [] as Hit[], archival: [] as Hit[], badMarks: [] as Hit[] };
  for (const h of hits) {
    const reason = marks.get(h.line);
    if (reason && reason.length >= 10 && (h.kind === 'string' || h.kind === 'identifier')) out.archival.push(h);
    else {
      out.operational.push(h);
      if (reason !== undefined) out.badMarks.push(h);
    }
  }
  return out;
}

export function scanAll(files: ReadonlyArray<{ path: string; text: string }>): ScanReport {
  const r: ScanReport = { operational: [], tooling: [], archival: [], badMarks: [], filesScanned: 0, byKind: { host: 0, env: 0, dispatch: 0, reference: 0, identifier: 0, string: 0, config: 0 }, clean: false };
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/');
    if (!isScanned(path)) continue;
    r.filesScanned++;
    const s = scanFile(path, f.text);
    if (TOOLING.has(path)) { r.tooling.push(...s.operational, ...s.archival); continue; }
    r.operational.push(...s.operational);
    r.archival.push(...s.archival);
    r.badMarks.push(...s.badMarks);
  }
  for (const h of r.operational) r.byKind[h.kind]++;
  r.clean = r.filesScanned > 0 && r.operational.length === 0 && r.tooling.length === 0; // scanning nothing proves nothing
  return r;
}
