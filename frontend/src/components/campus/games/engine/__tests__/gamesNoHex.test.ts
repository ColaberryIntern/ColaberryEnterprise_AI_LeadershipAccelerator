/** C10: no hard-coded hex colors anywhere in the Game Room (games folder and page); colors come from shell tokens at run time. */
import fs from 'fs';
import path from 'path';

const GAMES = path.join(__dirname, '..', '..');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const FILES = [...walk(GAMES), path.join(GAMES, '..', '..', '..', 'pages', 'portal', 'campus', 'GameRoomPage.tsx')].filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('__tests__'));
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

it('scans the real files', () => { expect(FILES.length).toBeGreaterThanOrEqual(8); });
it.each(FILES.map((f) => [path.basename(f), f]))('%s', (_n, f) => {
  // the Byte Chase maze uses '#' for walls inside string literals; those are not colors (no hex digits follow in a 3/6/8 run at a word end)
  expect(strip(fs.readFileSync(f, 'utf8')).match(HEX) ?? []).toEqual([]);
});
