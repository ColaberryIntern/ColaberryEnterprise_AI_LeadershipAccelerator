#!/usr/bin/env node
/**
 * checkTokenContrast — WCAG 2.1 contrast ratios for the design-system token pairs.
 *
 * Run from the repo root:
 *   node scripts/checkTokenContrast.js
 *
 * Why this exists as a script rather than a number in a document: the `/baseline-ui` skill's
 * summary table carried the wrong brand colours until 2026-08-25 and says so in its own text. A
 * summary can go stale; the token file cannot. So this parses the hex values straight out of
 * `frontend/src/styles/tokens.css` and computes the ratios, which makes every contrast figure in
 * `docs/project-lifecycle/ux-review-phase4.md` reproducible by anyone who runs one command.
 *
 * POSITIVE CONTROL, checked before anything else is reported: the ratio function must return
 * 21.00 for black-on-white and 1.00 for white-on-white. A contrast function that cannot produce
 * those two is not measuring contrast, and every number it prints would be decoration.
 *
 * Exit code is 0 even when pairs fail. The failures are a FINDING about the design system, not a
 * regression introduced by a commit, so this is a reporting tool and not a gate. Whoever owns the
 * token file decides what to change; see the register entry.
 */
const fs = require('fs');
const path = require('path');

const TOKENS = path.join(__dirname, '..', 'frontend', 'src', 'styles', 'tokens.css');

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const control = [
  ['black on white', ratio('#000000', '#ffffff'), 21],
  ['white on white', ratio('#ffffff', '#ffffff'), 1],
];
for (const [what, got, want] of control) {
  if (Math.abs(got - want) > 0.01) {
    console.error(`[contrast] CONTROL FAILED: ${what} = ${got.toFixed(2)}, expected ${want}`);
    process.exit(1);
  }
}
console.log(`[contrast] control OK — black/white ${control[0][1].toFixed(2)}:1, `
  + `white/white ${control[1][1].toFixed(2)}:1`);

const css = fs.readFileSync(TOKENS, 'utf8');
const values = {};
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) values[m[1]] = m[2];
const parsed = Object.keys(values).length;
if (parsed < 20) {
  console.error(`[contrast] parsed only ${parsed} hex tokens from tokens.css — the regex is wrong`);
  process.exit(1);
}
console.log(`[contrast] ${parsed} hex-valued tokens parsed from frontend/src/styles/tokens.css`);

/** The pairs a lifecycle workspace contract would actually use. */
const PAIRS = [
  ['--color-text', '--color-bg', 'body text on the page'],
  ['--n900', '--n50', 'neutral 900 on neutral 50'],
  ['--n700', '--n100', 'neutral 700 on neutral 100'],
  ['--status-matched-text', '--status-matched-bg', 'status: matched'],
  ['--status-unmapped-text', '--status-unmapped-bg', 'status: unmapped'],
  ['--color-text-light', '--color-bg', 'muted/secondary text on the page'],
  ['--status-verified-text', '--status-verified-bg', 'status: verified'],
  ['--color-primary', '--color-bg', 'brand/heading colour on the page'],
  ['--color-danger', '--color-bg', 'danger text on the page'],
  ['--status-partial-text', '--status-partial-bg', 'status: partial'],
  ['--color-muted', '--color-bg', 'the muted token on the page'],
  ['--color-primary-light', '--color-bg', 'the focus ring against the page'],
];

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const rows = [];
for (const [fg, bg, what] of PAIRS) {
  if (!values[fg] || !values[bg]) {
    console.error(`[contrast] MISSING TOKEN for "${what}": ${fg} or ${bg}`);
    process.exit(1);
  }
  rows.push({ what, fg, bg, r: ratio(values[fg], values[bg]) });
}
rows.sort((a, b) => b.r - a.r);

console.log('');
console.log('pair                                            ratio  AA 4.5:1  large/non-text 3:1');
for (const { what, r } of rows) {
  console.log(`${what.padEnd(44)} ${r.toFixed(2).padStart(6)}:1  `
    + `${(r >= AA_NORMAL ? 'PASS' : 'FAIL').padEnd(8)}  ${r >= AA_LARGE ? 'PASS' : 'FAIL'}`);
}

const belowAA = rows.filter((x) => x.r < AA_NORMAL);
const belowLarge = rows.filter((x) => x.r < AA_LARGE);
console.log('');
console.log(`[contrast] below AA 4.5:1 for normal text: ${belowAA.length} of ${rows.length}`);
for (const x of belowAA) console.log(`  ${x.r.toFixed(2)}:1  ${x.fg} on ${x.bg}  (${x.what})`);
if (belowLarge.length > 0) {
  console.log(`[contrast] below even the 3:1 non-text bar — must not carry text or a boundary:`);
  for (const x of belowLarge) console.log(`  ${x.r.toFixed(2)}:1  ${x.fg} on ${x.bg}`);
}

/** The allow-list P4-T5's status-label check is derived from. Printed so the test can be read
 *  against this output rather than against a hand-kept list. */
console.log('');
console.log('[contrast] AA-passing pairs, which is the status-label allow-list:');
for (const x of rows.filter((y) => y.r >= AA_NORMAL)) console.log(`  ${x.fg} on ${x.bg}`);
