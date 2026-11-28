/**
 * Inline the visual rules into the demo engine, from the TypeScript that is their one source.
 *
 * ## The problem this solves
 *
 * `demoVisual/visualPlan.ts` decides what a demo draws, is unit tested against six fixtures, and
 * runs in Node. The engine is one self-contained HTML file that runs in a browser, is served
 * under a nonce CSP in a sandbox, and is also copied into a student's repository where there is
 * no server at all. The rules have to exist in both places.
 *
 * Writing them twice is the failure this repo keeps naming: two copies of the same logic, free to
 * drift, with the drift invisible until a demo renders differently from what the tests prove. So
 * the TypeScript stays the only source and this composes the engine from it.
 *
 * ## Why this is safe to do mechanically
 *
 * The three rule modules import nothing but each other and types. Types vanish at transpile, so
 * after stripping the sibling imports the remaining code is plain declarations that concatenate
 * in dependency order. Everything is then wrapped in one IIFE, which matters: the engine already
 * has globals called `text`, `title`, `table`, `nav` and `strip`, and the rules export `str` and
 * `num`. Sharing a scope would be a collision waiting to be discovered by a blank screen.
 *
 * ## It refuses rather than emitting something broken
 *
 * Four checks run before anything is returned, and each throws: an import that is not a sibling,
 * leftover module syntax, a bundle that does not evaluate, and a bundle that evaluates without
 * producing `visualPlan`. A generator that can emit a broken engine is a generator that will.
 */
const fs = require('fs');
const path = require('path');

const RULES_DIR = path.resolve(__dirname, '../../backend/src/services/sbp/demoVisual');
const ENGINE_FILE = path.resolve(__dirname, '../../backend/src/services/sbp/demoKitAssets/index.html');

/** Dependency order. `visualPlan` reads both of the others, so it comes last. */
const RULE_MODULES = ['visualRules.ts', 'specReaders.ts', 'visualPlan.ts'];

/** What the composed bundle exposes to the engine. */
const EXPORTS = ['visualPlan', 'primaryWorkEntity'];

/** The one line in `index.html` this replaces. */
const VISUAL_RULES_MARKER = '/* __VISUAL_RULES__ */';

/** Imports that are allowed to appear in a rule module: siblings, and types from the contract. */
const ALLOWED_IMPORT = /^(\.\/(visualRules|specReaders|visualPlan)|\.\.\/demoSpec\/contract)$/;

function assertImportsAreLocal(source, file) {
  const re = /^import\s[\s\S]*?from\s+['"]([^'"]+)['"];?\s*$/gm;
  let m = re.exec(source);
  while (m) {
    if (!ALLOWED_IMPORT.test(m[1])) {
      throw new Error(
        `[visual-rules] ${file} imports ${m[1]}, which cannot be inlined into a browser engine. `
        + 'The rule modules may import only each other and types from the demo-spec contract.',
      );
    }
    m = re.exec(source);
  }
}

/** Remove module syntax, leaving plain declarations. Runs AFTER transpile, so types are gone. */
function stripModuleSyntax(code) {
  return code
    // `import { a } from './x';`, including the multi-line form the rule modules use.
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    // `export { a, b };`
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    // `export const`, `export function`, `export class` -> the declaration alone.
    .replace(/^export\s+(?=(const|let|var|function|class|async))/gm, '');
}

function transpile(file) {
  // Resolved from the repo root's node_modules, the same install the rest of the build uses.
  // eslint-disable-next-line global-require
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(RULES_DIR, file), 'utf8');
  assertImportsAreLocal(source, file);
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      // The engine is served to real browsers and copied into student repositories. ES2017 is
      // old enough to be universal and new enough that nothing here needs a polyfill.
      target: ts.ScriptTarget.ES2017,
      removeComments: false,
    },
    fileName: file,
  });
  return stripModuleSyntax(out.outputText).trim();
}

/**
 * The rules, as one browser-ready IIFE assigned to a single global.
 */
function inlineRules() {
  const chunks = RULE_MODULES.map(transpile);
  const body = chunks.join('\n\n');

  if (/^\s*(import|export)\s/m.test(body)) {
    throw new Error('[visual-rules] module syntax survived the strip; the engine would not parse');
  }

  const bundle = [
    '  /* GENERATED from backend/src/services/sbp/demoVisual/*.ts by',
    '   * scripts/lib/inlineVisualRules.js. Do not edit here: edit the TypeScript, which is unit',
    '   * tested, and regenerate with `node scripts/generateDemoKitAssets.js`. */',
    '  var VISUAL = (function () {',
    body.split('\n').map((l) => (l ? `    ${l}` : '')).join('\n'),
    `    return { ${EXPORTS.map((n) => `${n}: ${n}`).join(', ')} };`,
    '  })();',
  ].join('\n');

  // It must actually run. A bundle that throws on load takes the whole demo with it, and the
  // cheapest place to find that out is here rather than in a browser.
  let made;
  try {
    // eslint-disable-next-line no-new-func
    made = new Function(`${bundle}\nreturn VISUAL;`)();
  } catch (err) {
    throw new Error(`[visual-rules] the composed bundle does not evaluate: ${err.message}`);
  }
  for (const name of EXPORTS) {
    if (typeof made[name] !== 'function') {
      throw new Error(`[visual-rules] the composed bundle does not expose ${name}()`);
    }
  }
  return bundle;
}

/** The engine as it ships: `index.html` with the marker replaced by the rules. */
function composeEngineHtml(rawHtml) {
  const html = rawHtml === undefined ? fs.readFileSync(ENGINE_FILE, 'utf8') : rawHtml;
  const marker = html.includes(VISUAL_RULES_MARKER);
  if (!marker) {
    throw new Error(
      `[visual-rules] index.html has no ${VISUAL_RULES_MARKER} line, so the rules have nowhere `
      + 'to go. The engine would silently render without them.',
    );
  }
  // A function replacement, so `$&` or `$1` inside the rules is not read as a substitution.
  const once = html.split(VISUAL_RULES_MARKER);
  if (once.length !== 2) {
    throw new Error('[visual-rules] the marker appears more than once in index.html');
  }
  return `${once[0]}${inlineRules()}${once[1]}`;
}

module.exports = {
  RULE_MODULES,
  VISUAL_RULES_MARKER,
  EXPORTS,
  inlineRules,
  composeEngineHtml,
};
