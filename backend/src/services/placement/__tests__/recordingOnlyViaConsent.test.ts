import fs from 'fs';
import path from 'path';

/**
 * CP9.1 (execution contract: "The only code path that turns recording on is roomService.applyConsent() at n of n"):
 * a source scan. In every non-test file under services/placement and routes, the recording-ON value ('cloud', in any
 * quote) appears ONLY inside roomService.applyConsent, and setRecording is called only from roomService. Comments are
 * stripped first, so prose can name the value; code cannot.
 */
const SRC = path.join(__dirname, '..', '..', '..');
const DIRS = [path.join(SRC, 'services', 'placement'), path.join(SRC, 'routes')];
const ON_VALUE = new RegExp(`(['"\`])${'cl' + 'oud'}\\1`, 'g');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : files(p);
    return /\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name) ? [p] : [];
  });
}
/** Block and line comments out, string contents kept (a // inside a string, such as a URL, is not a comment). */
export function stripComments(src: string): string {
  return src.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => (m.startsWith('/') ? ' '.repeat(m.length) : m));
}
/** The [start, end) span of `export async function applyConsent ... }` (to the first line that is exactly "}"). */
function applyConsentSpan(code: string): [number, number] {
  const start = code.indexOf('export async function applyConsent(');
  const end = code.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error('roomService.applyConsent not found');
  return [start, end];
}

describe('recording turns on only through roomService.applyConsent', () => {
  const scanned = DIRS.flatMap(files);
  it('scans the room code and the routes (a moved file cannot dodge the scan)', () => {
    expect(scanned.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['roomService.ts', 'roomProvider.ts', 'bookingConfirm.ts', 'placementRoomRoutes.ts']));
  });
  it("the recording-ON value appears in no file but roomService.ts, and there only inside applyConsent", () => {
    const hits: string[] = [];
    for (const f of scanned) {
      const code = stripComments(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
      const span = path.basename(f) === 'roomService.ts' ? applyConsentSpan(code) : null;
      for (const m of code.matchAll(ON_VALUE)) {
        const inside = span && (m.index as number) > span[0] && (m.index as number) < span[1];
        if (!inside) hits.push(`${path.relative(SRC, f)}:${code.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(hits).toEqual([]);
    const room = stripComments(fs.readFileSync(path.join(SRC, 'services', 'placement', 'roomService.ts'), 'utf8').replace(/\r\n/g, '\n'));
    const [a, b] = applyConsentSpan(room);
    expect(room.slice(a, b).match(ON_VALUE)).toHaveLength(1);
  });
  it('setRecording is called from roomService.ts alone', () => {
    const callers = scanned.filter((f) => /\.setRecording\(/.test(stripComments(fs.readFileSync(f, 'utf8'))));
    expect(callers.map((f) => path.basename(f))).toEqual(['roomService.ts']);
  });
  it('the comment stripper keeps strings and drops comments (its own check)', () => {
    expect(stripComments("a('x // y'); // z\n/* 'q' */ b")).toBe("a('x // y');     \n          b");
  });
});
