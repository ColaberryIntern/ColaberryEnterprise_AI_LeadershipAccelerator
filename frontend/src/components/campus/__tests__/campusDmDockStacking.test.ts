import fs from 'fs';
import path from 'path';

/**
 * C121 (Ali, 2026-11-06: "Make sure the screen is not hidden by other things when Maya is up"). Maya now talks in the shared chat
 * dock (.te-dmdock), so nothing the campus draws may paint over it. The rule: the dock out-ranks every campus layer, popover,
 * toast and panel; only a full-screen modal scrim (the booking sheet, the community board, the games cabinet) may sit level with
 * or above it, because a modal is meant to cover the page, the dock included, while it is open.
 *
 * jsdom resolves no stacking, so the stylesheet source is the contract, as in campusLocbarStacking.test.ts.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const CAMPUS_DIR = path.join(__dirname, '..');
const TODAY_CSS = strip(fs.readFileSync(path.join(CAMPUS_DIR, '..', '..', 'pages', 'portal', 'today', 'TodayShell.css'), 'utf8'));

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : cssFiles(p);
    return e.name.endsWith('.css') ? [p] : [];
  });
}

/** Every `selector{... z-index:N ...}` rule in a stylesheet. */
function zRules(css: string): Array<{ selector: string; z: number }> {
  const out: Array<{ selector: string; z: number }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const z = m[2].match(/z-index:\s*(-?\d+)/);
    if (z) out.push({ selector: m[1].trim(), z: Number(z[1]) });
  }
  return out;
}

const MODAL = /scrim/;

describe('the shared chat dock is never covered by a campus layer', () => {
  const dock = zRules(TODAY_CSS).find((r) => r.selector === '.te-dmdock');

  it('the dock declares its z-index', () => {
    expect(dock?.z).toEqual(expect.any(Number));
  });

  it('every non-modal campus rule stacks below the dock', () => {
    const offenders = cssFiles(CAMPUS_DIR)
      .flatMap((f) => zRules(strip(fs.readFileSync(f, 'utf8'))).map((r) => ({ ...r, file: path.basename(f) })))
      .filter((r) => !MODAL.test(r.selector) && r.z >= (dock?.z ?? 0));
    expect(offenders).toEqual([]);
  });

  it('the parser finds the rules it must (a broken parser would pass everything)', () => {
    const all = cssFiles(CAMPUS_DIR).flatMap((f) => zRules(strip(fs.readFileSync(f, 'utf8'))));
    expect(all.some((r) => r.selector === '.cm-layer')).toBe(true);
    expect(all.some((r) => MODAL.test(r.selector))).toBe(true);
  });
});
