import fs from 'fs';
import path from 'path';

/**
 * Zoom's `start_url` starts the meeting AS THE HOST. Whoever holds it can mute
 * anyone, remove anyone and end the session for everybody. It must never reach a
 * student, and the strongest way to guarantee that is for this backend never to
 * fetch or store it at all.
 *
 * Today it genuinely does not exist anywhere in product source. This test keeps it
 * that way: a future change that starts reading `start_url` from a Zoom response
 * fails here, at the moment it is introduced, rather than on the day one appears in
 * a payload.
 *
 * Source-text scan, deliberately. A runtime assertion could only check the payloads
 * a test happens to build; this checks every line that ships.
 */

const SRC = path.join(__dirname, '..', '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests are excluded: this very file names the forbidden string, and so does
      // the leak-check in presentationSessionService.test.ts.
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = sourceFiles(SRC);

describe('the provider host URL cannot reach a student, because it is never read', () => {
  it('scans a real and substantial set of source files', () => {
    // POSITIVE CONTROL. Without it, a scanner that silently walked nothing would
    // report a clean sweep and this whole suite would be decoration.
    expect(FILES.length).toBeGreaterThan(500);
    const withJoinUrl = FILES.filter((f) => fs.readFileSync(f, 'utf8').includes('join_url'));
    // `join_url` IS present in product code — if the scanner cannot find that, it is
    // not reading files properly and the absence of `start_url` proves nothing.
    expect(withJoinUrl.length).toBeGreaterThan(0);
  });

  it.each(['start_url', 'startUrl'])('no product source file mentions %s', (needle) => {
    const offenders = FILES
      .filter((f) => fs.readFileSync(f, 'utf8').includes(needle))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
