#!/usr/bin/env node
/**
 * Generate `backend/src/services/sbp/demoKitAssets.generated.ts` from the readable asset files
 * in `backend/src/services/sbp/demoKitAssets/`.
 *
 * ## Why this exists rather than a runtime readFileSync
 *
 * The backend builds with plain `tsc` (`backend/package.json` -> `"build": "tsc"`), which does
 * NOT copy non-TS files into `dist/`. The repo already learned this the hard way: `Dockerfile:63`
 * carries the comment "tsc does not copy .json, so without this the files are simply absent from
 * the image", and line 69 is the explicit `COPY --from=builder ... capabilities` that fixes it
 * for agent-domain capabilities.
 *
 * Taking that route for the demo kit would mean editing the Dockerfile, which this run's
 * execution contract classes as ESCALATE-tier. Inlining the bytes as TypeScript needs no
 * infrastructure change and is what `capabilitySkillFiles()` already does for its constant files.
 *
 * ## Why a generator rather than hand-pasted strings
 *
 * The engine is ~37KB of HTML containing backticks and `${`, so hand-maintaining it as a
 * template literal is how two copies drift. The `.html`/`.mjs`/`.md` files stay the readable
 * source of truth; this emits the shipped constant; and `demoKit.drift.test.ts` asserts the two
 * are byte-identical, so a stale generated file fails CI instead of shipping.
 *
 * Usage: node scripts/generateDemoKitAssets.js [--check]
 *   --check exits non-zero if the generated file is stale, without rewriting it.
 */
const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.resolve(__dirname, '../backend/src/services/sbp/demoKitAssets');
const OUT = path.resolve(__dirname, '../backend/src/services/sbp/demoKitAssets.generated.ts');

/** The four files, and the constant each becomes. Order is fixed so output is deterministic. */
const ASSETS = [
  { file: 'index.html', konst: 'DEMO_KIT_ENGINE_HTML' },
  { file: 'scaffold-demo-spec.mjs', konst: 'DEMO_KIT_SCAFFOLD_MJS' },
  { file: 'build-standalone.mjs', konst: 'DEMO_KIT_STANDALONE_MJS' },
  { file: 'DEMO_SPEC_CONTRACT.md', konst: 'DEMO_KIT_CONTRACT_MD' },
];

/**
 * Escape for a TypeScript template literal. Backslash FIRST, or the escapes we add below get
 * escaped again. `${` must be broken or the literal starts interpolating the file's own text.
 */
function escapeForTemplate(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function build() {
  const parts = [
    '/* GENERATED FILE - DO NOT EDIT BY HAND.',
    ' *',
    ' * Source of truth: backend/src/services/sbp/demoKitAssets/',
    ' * Regenerate:      node scripts/generateDemoKitAssets.js',
    ' * Verified by:     demoKit.drift.test.ts (fails CI if this file is stale)',
    ' *',
    ' * Inlined rather than read at runtime because `tsc` does not copy non-TS files into dist/',
    ' * and adding a Dockerfile COPY is ESCALATE-tier in this run\'s execution contract.',
    ' */',
    '',
  ];
  for (const { file, konst } of ASSETS) {
    const raw = fs.readFileSync(path.join(ASSET_DIR, file), 'utf8');
    parts.push(`/** Byte-for-byte \`demoKitAssets/${file}\`. */`);
    parts.push(`export const ${konst} = \`${escapeForTemplate(raw)}\`;`);
    parts.push('');
  }
  return parts.join('\n');
}

const next = build();
const check = process.argv.includes('--check');
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

/**
 * Compare ignoring line endings.
 *
 * This checkout stores CRLF (core.autocrlf) while build() joins with a bare LF, so a raw
 * comparison reported STALE on a clean tree. A check that cries wolf is worse than no check:
 * the first few false alarms teach everyone to ignore the real one. The VALUES are unaffected
 * either way, because ECMAScript normalizes CRLF to LF inside template literals, which is
 * exactly why the drift test passed while --check failed.
 */
const normalizeEndings = (s) => s.split('\r\n').join('\n');
const sameIgnoringEndings = (a, b) => a !== null && normalizeEndings(a) === normalizeEndings(b);

if (check) {
  if (!sameIgnoringEndings(current, next)) {
    console.error('[demo-kit-assets] STALE: run `node scripts/generateDemoKitAssets.js`');
    process.exit(1);
  }
  console.log('[demo-kit-assets] up to date');
} else {
  fs.writeFileSync(OUT, next);
  console.log(`[demo-kit-assets] wrote ${OUT} (${(next.length / 1024).toFixed(1)} KB)`);
}
