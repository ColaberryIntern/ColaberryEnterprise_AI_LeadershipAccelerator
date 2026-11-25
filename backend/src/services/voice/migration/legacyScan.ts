/**
 * Synthflow reference scan (VS5.4), pure: what in this repository still DEPENDS on Synthflow.
 *
 * Counted (operational): an identifier, string or import in code that names it; its environment variables;
 * its hosts; any mention in configuration and deploy files.
 * Not counted: comments, documentation, tests, and a line carrying an archival mark with a reason, such as
 *   provider: 'synthflow', // synthflow-archival: historical rows keep their provider name
 * A mark without a reason does not count, and a mark never excuses a host, a key or a dispatch.
 */
import ts from 'typescript';

export type Kind = 'host' | 'env' | 'identifier' | 'string' | 'config';
export interface Hit { file: string; line: number; kind: Kind }
export interface ScanReport { operational: Hit[]; archival: Hit[]; badMarks: Hit[]; filesScanned: number; byKind: Record<Kind, number>; clean: boolean }

const NAME = /synthe?flow/i;
const HOST = /(?:[a-z0-9-]+\.)*synthflow\.(?:ai|com|io)/i;
const ENV = /\bSYNTHFLOW_[A-Z0-9_]+|\bENABLE_SYNTHFLOW[A-Z0-9_]*/;
const MARK = /synthflow-archival:\s*(.*)$/;
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP = /(?:^|\/)(?:node_modules|dist|build|coverage)\/|(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$|^docs\/|^directives\/|^tests\/|^\.claude\/|^scripts\/artifacts\/|\.(?:md|png|jpe?g|gif|svg|pdf|webp|mp4|lock|map)$|package-lock\.json$/;
/** The scanner and the migration tools name it by design, and are removed with the last of it. */
const TOOLING = /^backend\/src\/(?:scripts\/voice\/(?:scanLegacy|migrationReport|voiceInventory\w*)|services\/voice\/migration\/\w+)\.ts$/;
const CONFIG = /(?:^|\/)(?:\.env[^/]*|Dockerfile[^/]*|docker-compose[^/]*|[^/]*\.(?:ya?ml|json|toml|conf|ini|sh|sql|py|html?))$/;

export const isScanned = (path: string): boolean => !SKIP.test(path) && !TOOLING.test(path) && (CODE.test(path) || CONFIG.test(path));

/** Comment text by line (for marks), and every non-comment token that names it. */
function codeHits(file: string, text: string): { hits: Hit[]; marks: Map<number, string> } {
  const hits: Hit[] = [];
  const marks = new Map<number, string>();
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const add = (pos: number, kind: Kind) => { const line = lineOf(pos); if (!hits.some((h) => h.line === line && h.kind === kind)) hits.push({ file, line, kind }); };
  const look = (pos: number, s: string, kind: Kind) => {
    // a long template can span lines: report the line the name is on
    for (const [i, part] of s.split('\n').entries()) {
      if (!NAME.test(part) && !ENV.test(part)) continue;
      const at = pos + s.split('\n').slice(0, i).join('\n').length + (i ? 1 : 0);
      add(at, HOST.test(part) ? 'host' : ENV.test(part) ? 'env' : kind);
    }
  };
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) look(n.getStart(sf), n.text, 'identifier');
    else if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n) || ts.isRegularExpressionLiteral(n)) look(n.getStart(sf), n.getText(sf), 'string');
    ts.forEachChild(n, walk);
  };
  walk(sf);
  text.split('\n').forEach((l, i) => {
    const m = MARK.exec(l);
    // only in a trailing comment, never inside a string
    if (m && /\/\/|\/\*|\{\/\*/.test(l.slice(0, m.index))) marks.set(i + 1, m[1].replace(/\*\/\}?\s*$/, '').trim());
  });
  return { hits, marks };
}

function configHits(file: string, text: string): { hits: Hit[]; marks: Map<number, string> } {
  const hits: Hit[] = [];
  const marks = new Map<number, string>();
  const hash = /\.(?:ya?ml|toml|conf|ini|sh|py)$|\.env|Dockerfile|docker-compose/.test(file);
  text.split('\n').forEach((raw, i) => {
    const m = MARK.exec(raw);
    if (m) marks.set(i + 1, m[1].trim());
    const l = hash ? raw.replace(/(?:^|\s)#.*$/, '') : /\.sql$/.test(file) ? raw.replace(/--.*$/, '') : raw;
    if (NAME.test(l) || ENV.test(l)) hits.push({ file, line: i + 1, kind: HOST.test(l) ? 'host' : ENV.test(l) ? 'env' : 'config' });
  });
  return { hits, marks };
}

export function scanFile(file: string, text: string): { operational: Hit[]; archival: Hit[]; badMarks: Hit[] } {
  const t = text.replace(/\r\n/g, '\n');
  const { hits, marks } = CODE.test(file) ? codeHits(file, t) : configHits(file, t);
  const out = { operational: [] as Hit[], archival: [] as Hit[], badMarks: [] as Hit[] };
  for (const h of hits) {
    const reason = marks.get(h.line);
    const excusable = h.kind === 'string' || h.kind === 'identifier';
    if (reason && reason.length >= 10 && excusable) out.archival.push(h);
    else {
      out.operational.push(h);
      if (reason !== undefined) out.badMarks.push(h);
    }
  }
  return out;
}

export function scanAll(files: ReadonlyArray<{ path: string; text: string }>): ScanReport {
  const r: ScanReport = { operational: [], archival: [], badMarks: [], filesScanned: 0, byKind: { host: 0, env: 0, identifier: 0, string: 0, config: 0 }, clean: false };
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/');
    if (!isScanned(path)) continue;
    r.filesScanned++;
    if (!NAME.test(f.text)) continue;
    const s = scanFile(path, f.text);
    r.operational.push(...s.operational);
    r.archival.push(...s.archival);
    r.badMarks.push(...s.badMarks);
  }
  for (const h of r.operational) r.byKind[h.kind]++;
  r.clean = r.filesScanned > 0 && r.operational.length === 0; // scanning nothing proves nothing
  return r;
}
