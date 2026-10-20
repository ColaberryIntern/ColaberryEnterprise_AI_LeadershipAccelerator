import fs from 'fs';
import path from 'path';

/**
 * THE TEST THAT WOULD HAVE CAUGHT THE LAST THREE DEFECTS.
 *
 * In one week this subsystem shipped three complete, tested units that nothing called:
 *   - L4.6's heartbeat route: 13 tests, no caller. A real airing recorded zero viewers.
 *   - L7.1's occurrence creation: no provider binding, so the occurrence could not play.
 *   - runProviderEvent itself: exported, tested, called by nothing, which is why L5.5 exists
 *     and why go_live had to be hand-fed during Test 2.
 *
 * Every one was invisible to a passing suite, because unit tests start one layer below the
 * gap. This asserts the WIRING by reading the source, which is the only layer where "nothing
 * calls it" is visible at all.
 *
 * IT COMMENTS OUT THE SOURCE FIRST, AND THAT IS THE WHOLE POINT. The first version of this
 * file matched the raw text and PASSED when the call was commented out — a test written to
 * catch "imported but never called" that accepted exactly that. It was caught by mutating
 * server.ts and watching the test stay green. A commented-out call is not a call.
 */

const SERVER = path.resolve(__dirname, '../../../server.ts');

/**
 * Source with comments removed.
 *
 * The `[^:]` guard keeps `https://` inside a string from being treated as a comment. It is not
 * a parser and does not need to be: it only has to stop a commented-out line counting as code.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const code = (): string => stripComments(fs.readFileSync(SERVER, 'utf8'));
const raw = (): string => fs.readFileSync(SERVER, 'utf8');

describe('the comment stripper itself', () => {
  // Without these, every assertion below rests on an unverified helper.
  it('removes a line comment', () => {
    expect(stripComments('// startBroadcastHealthLoop();\n')).not.toMatch(/startBroadcastHealthLoop\(\)/);
  });

  it('removes a trailing comment but keeps the code before it', () => {
    const out = stripComments('  startBroadcastHealthLoop(); // do it\n');
    expect(out).toMatch(/startBroadcastHealthLoop\(\)/);
    expect(out).not.toMatch(/do it/);
  });

  it('removes a block comment', () => {
    expect(stripComments('/* startBroadcastHealthLoop(); */')).not.toMatch(/startBroadcastHealthLoop\(\)/);
  });

  it('does not mistake a url for a comment', () => {
    expect(stripComments("const u = 'https://example.com/x';")).toMatch(/example\.com\/x/);
  });
});

describe('the provider health loop is actually started by the server', () => {
  it('server.ts imports the loop', () => {
    expect(raw()).toMatch(/import\s*\{\s*startBroadcastHealthLoop\s*\}\s*from\s*'\.\/services\/broadcast\/broadcastHealthLoop'/);
  });

  it('server.ts CALLS it in live code, not in a comment', () => {
    // An import alone, or a commented-out call, is what "shipped but never called" looks like
    // in a diff — and it reads as done to a reviewer skimming the file.
    expect(code()).toMatch(/startBroadcastHealthLoop\(\)/);
  });

  it('the call is guarded so a failure to start cannot take the server down', () => {
    const body = code();
    const at = body.indexOf('startBroadcastHealthLoop()');
    expect(at).toBeGreaterThan(-1);
    // Inspect the surrounding lines, or any try/catch anywhere in the file would satisfy this.
    expect(body.slice(Math.max(0, at - 240), at)).toMatch(/try\s*\{/);
  });
});
