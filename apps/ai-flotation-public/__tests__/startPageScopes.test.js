/**
 * The two forms on /start live in separate IIFEs, and one of them called a function
 * belonging to the other.
 *
 * `startPreview` is declared in the intake IIFE. "Call me now" is deliberately kept in its
 * own, and it called `startPreview` directly - so EVERY call request threw
 * "startPreview is not defined". The throw landed in the `.catch` that exists for a FAILED
 * submission, so a visitor whose call was already being placed by Synthflow was told
 * "please try again", and a second press meant a second lead and a second phone call.
 *
 * Nothing failed. No type checker sees this file, the page has no build step that would
 * catch it, and the server answered a clean 200. It was found by pressing the button on the
 * live site and reading what the page said back.
 *
 * Runs on node's own test runner: this app ships no dependencies and is not going to start
 * for one assertion library.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'src', 'start', 'index.html'), 'utf8');

/** The page's own inline script, which is the last <script> block on it. */
function inlineScript() {
  const open = PAGE.lastIndexOf('<script>');
  const close = PAGE.lastIndexOf('</script>');
  assert.ok(open > -1, 'no inline <script> block found');
  assert.ok(close > open, 'inline script block is not closed');
  return PAGE.slice(open + '<script>'.length, close);
}

/** Offsets of each top-level `(function () { … })();` in the inline script. */
function iifeRanges(script) {
  const opens = [...script.matchAll(/^ {6}\(function \(\) \{$/gm)];
  const closes = [...script.matchAll(/^ {6}\}\)\(\);$/gm)];
  assert.equal(opens.length, closes.length, 'unbalanced top-level IIFEs');
  return opens.map((o, i) => ({ start: o.index, end: closes[i].index }));
}

describe('/start inline script', () => {
  const script = inlineScript();

  test('parses, so a syntax error can never ship silently', () => {
    // If it does not parse, every form on the page is dead and the site still returns 200.
    assert.doesNotThrow(() => new Function(script));
  });

  test('keeps the two forms in separate scopes, as intended', () => {
    assert.ok(iifeRanges(script).length >= 2, 'expected at least two top-level IIFEs');
  });

  test('never calls startPreview from outside the scope that declares it', () => {
    const ranges = iifeRanges(script);
    const declaredIn = ranges.findIndex((r) => script.slice(r.start, r.end).includes('function startPreview('));
    assert.ok(declaredIn > -1, 'startPreview is not declared in any IIFE');

    ranges.forEach((r, i) => {
      if (i === declaredIn) return;
      const body = script.slice(r.start, r.end);
      // The bug, exactly: a bare call from a scope that cannot see the declaration.
      assert.ok(
        !/(^|[^.\w])startPreview\s*\(/.test(body),
        `IIFE ${i} calls startPreview across a scope boundary — it will throw at runtime`,
      );
    });
  });

  test('hands the token across by event instead, in both directions', () => {
    // One listener, one dispatch. If either goes missing the write-up panel stops opening
    // after a call request, which is how it behaved for as long as the bug existed.
    assert.match(script, /addEventListener\('flotation:preview-token'/);
    assert.match(script, /new CustomEvent\('flotation:preview-token'/);
  });

  test('cannot report a successful submission as a failure', () => {
    // The last TOP-LEVEL IIFE, not the last nested `function (` on the page.
    const ranges = iifeRanges(script);
    const last = ranges[ranges.length - 1];
    const callme = script.slice(last.start, last.end);
    const success = callme.indexOf('Your phone should ring shortly');
    const dispatch = callme.indexOf('flotation:preview-token');

    assert.ok(success > -1, 'the call-me-now success message is gone');
    assert.ok(dispatch > success, 'the write-up hand-off should follow the success message');

    // Nothing between the success message and the hand-off may reach the failure path...
    assert.ok(!/\.catch\(/.test(callme.slice(success, dispatch)));
    // ...and the hand-off sits INSIDE a try/catch, so a throw in it cannot travel on to the
    // handler that tells the visitor their request failed.
    assert.match(callme.slice(success), /try \{[\s\S]*flotation:preview-token[\s\S]*?\} catch/);
  });
});
