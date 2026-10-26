/**
 * EVERY OUTBOUND `fetch` MUST CARRY A TIMEOUT, ratcheted from where the tree actually is.
 *
 * Session CC-20261021-h9v3. CLAUDE.md, Security Enforcement Layer: "Every outbound call to an
 * external API MUST include explicit timeout (5-30s default, never unbounded)."
 *
 * ## Why a ratchet and not a clean assertion
 *
 * 43 call sites across 17 files are unbounded today, spread over GitHub, Apollo, Basecamp, Zoom,
 * PaySimple, Slack and the architect proxy. Retiming all of them in one change would be a
 * behaviour change to seventeen production integrations on one person's guess at the right
 * number — and a 15 s ceiling on a call that legitimately takes 60 s breaks it in a way no test
 * here would catch.
 *
 * So this freezes the current count per file and fails on anything NEW. The bleeding stops
 * immediately at zero behavioural risk, and the baseline burns down as each integration gets a
 * timeout chosen by someone who knows what that call does.
 *
 * ## Why the scanner tokenizes instead of grepping
 *
 * This was measured three times and the first two were wrong:
 *
 *   - a file-level grep ("does this file mention AbortSignal?") said 39 sites in 13 files. It
 *     cannot see a file that bounds one call and not another, and SEVEN files do exactly that.
 *   - a raw-source scan said 68 sites in 29 files. It matched `fetch(` inside STRING LITERALS:
 *     `data/weeks/week2.ts` and `classTeachWeeks.ts` carry curriculum prompt text containing
 *     "no ES modules and no fetch() of local files". A sweep driven by that number would have
 *     "fixed" lesson content.
 *   - tokenizing, so strings, templates and comments are skipped: 43 sites in 17 files, and
 *     ZERO in `data/`.
 *
 * The `data/` count is kept as a live control below, because it is the assertion that would have
 * caught the second mistake.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');

/** Per-file unbounded `fetch` count, frozen 2026-10-24. Lower these; never raise them. */
const BASELINE: Record<string, [number, string]> = {
  'services/agents/openclaw/openclawEngagementFetcher.ts': [9, 'Reddit/HN/Quora engagement polling'],
  'services/githubService.ts': [9, 'GitHub REST; some calls are large repo reads'],
  'services/architectProxyService.ts': [7, 'architect proxy; upstream latency unknown'],
  'services/ops/basecampClient.ts': [3, 'Basecamp API'],
  'services/commitDrivenMatcher.ts': [2, 'GitHub commit scan'],
  'services/githubIntegrationService.ts': [2, 'GitHub app integration'],
  'controllers/generatorController.ts': [1, 'generator passthrough'],
  'intelligence/systemStateEngine/incidents/subscribers/slackSubscriber.ts': [1, 'Slack webhook'],
  'scripts/sbpLiveEndToEnd.ts': [1, 'one-off script, not a request path'],
  'services/agentGitHubService.ts': [1, 'GitHub for agent repos'],
  'services/apolloService.ts': [1, 'Apollo enrichment'],
  'services/architectIntegrationService.ts': [1, 'architect integration'],
  'services/delivery/repoProjectImport.ts': [1, 'repo import; legitimately slow'],
  'services/ops/bcSyncService.ts': [1, 'Basecamp sync'],
  'services/paysimpleService.ts': [1, 'PAYMENTS — retime with care'],
  'services/visualScanService.ts': [1, 'visual scan'],
  'services/zoomService.ts': [1, 'Zoom API'],
};

type Mode = 'code' | 'line_comment' | 'block_comment' | 'sq' | 'dq' | 'tpl';

const IDENT = /[\w$]/;

/**
 * Offsets of every `fetch(` in CODE context, with the index of its opening paren.
 *
 * A stack rather than a flag, so a `${...}` interpolation inside a template literal is treated
 * as code (it is) and the template resumes after it.
 */
export function fetchCallSites(src: string): Array<{ start: number; open: number }> {
  const out: Array<{ start: number; open: number }> = [];
  const mode: Mode[] = ['code'];
  let i = 0;
  while (i < src.length) {
    const m = mode[mode.length - 1];
    const c = src[i];
    const nxt = src[i + 1] ?? '';

    if (m === 'code') {
      if (c === '/' && nxt === '/') { mode.push('line_comment'); i += 2; continue; }
      if (c === '/' && nxt === '*') { mode.push('block_comment'); i += 2; continue; }
      if (c === "'") { mode.push('sq'); i += 1; continue; }
      if (c === '"') { mode.push('dq'); i += 1; continue; }
      if (c === '`') { mode.push('tpl'); i += 1; continue; }
      if (c === '}' && mode.length > 1) { mode.pop(); i += 1; continue; }
      if (src.startsWith('fetch', i)) {
        const before = i > 0 ? src[i - 1] : ' ';
        const rest = src.slice(i + 5);
        const open = rest.search(/\S/);
        // `.fetch(` is a method on something else; `prefetch(` is a different identifier.
        if (!IDENT.test(before) && before !== '.' && open >= 0 && rest[open] === '(') {
          out.push({ start: i, open: i + 5 + open });
          i += 5;
          continue;
        }
      }
      i += 1;
      continue;
    }
    if (m === 'line_comment') { if (c === '\n') mode.pop(); i += 1; continue; }
    if (m === 'block_comment') { if (c === '*' && nxt === '/') { mode.pop(); i += 2; continue; } i += 1; continue; }
    if (m === 'sq' || m === 'dq') {
      if (c === '\\') { i += 2; continue; }
      if ((m === 'sq' && c === "'") || (m === 'dq' && c === '"')) mode.pop();
      i += 1;
      continue;
    }
    // template literal
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { mode.pop(); i += 1; continue; }
    if (c === '$' && nxt === '{') { mode.push('code'); i += 2; continue; }
    i += 1;
  }
  return out;
}

/** The text between the call's parens, or null if they never balance. */
export function callArguments(src: string, open: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

/** A call is bounded when its own argument list carries a `signal:`. */
export function isBounded(args: string): boolean {
  return /\bsignal\s*:/.test(args);
}

function tsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      tsFiles(p, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

/** `{ relativePath: unboundedCount }` over the real tree. */
function unboundedCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of tsFiles(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    let n = 0;
    for (const site of fetchCallSites(src)) {
      const args = callArguments(src, site.open);
      if (args !== null && !isBounded(args)) n += 1;
    }
    if (n > 0) counts[path.relative(SRC, file).split(path.sep).join('/')] = n;
  }
  return counts;
}

/**
 * The ratchet comparison, as a PURE function so it can be driven with synthetic inputs.
 *
 * The real tree is clean by construction the moment the baseline is pasted in, so proving this
 * can fail needs inputs the tree cannot supply — the same reason `bannedWordOutboundCopy` does
 * it this way.
 */
export function ratchetFailures(
  counts: Record<string, number>,
  baseline: Record<string, [number, string]>,
): string[] {
  const failures: string[] = [];
  for (const file of Object.keys(counts).sort()) {
    if (!Object.prototype.hasOwnProperty.call(baseline, file)) {
      failures.push(`${file}: NEW file with ${counts[file]} unbounded fetch(). Add `
        + `signal: AbortSignal.timeout(MS) — CLAUDE.md requires a timeout on every outbound call.`);
    }
  }
  for (const file of Object.keys(baseline).sort()) {
    const frozen = baseline[file][0];
    const actual = counts[file] ?? 0;
    if (actual > frozen) {
      failures.push(`${file}: ${actual} unbounded fetch(), baseline ${frozen}. A NEW one landed. `
        + 'Do not raise the baseline.');
    } else if (actual === 0) {
      failures.push(`${file}: now has NONE. Delete its baseline entry — a ratchet that keeps `
        + 'retired entries stops measuring anything.');
    }
  }
  return failures;
}

describe('the ratchet can actually fail', () => {
  const baseline: Record<string, [number, string]> = { 'a.ts': [2, 'idiom: two unbounded calls'] };

  it('passes when the tree matches the baseline exactly', () => {
    expect(ratchetFailures({ 'a.ts': 2 }, baseline)).toEqual([]);
  });

  it('passes when a file improves but is not yet clean', () => {
    expect(ratchetFailures({ 'a.ts': 1 }, baseline)).toEqual([]);
  });

  it('fails on a new unbounded call in a baselined file', () => {
    const f = ratchetFailures({ 'a.ts': 3 }, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('A NEW one landed');
  });

  it('fails on an unbounded call in a file that had none', () => {
    const f = ratchetFailures({ 'a.ts': 2, 'b.ts': 1 }, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('NEW file');
  });

  it('fails when a file is fixed but its entry is left behind', () => {
    const f = ratchetFailures({}, baseline);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Delete its baseline entry');
  });
});

describe('the scanner reads code and not prose', () => {
  it('finds a real call', () => {
    const sites = fetchCallSites('const r = await fetch(url, { method: "GET" });');
    expect(sites).toHaveLength(1);
  });

  it('IGNORES fetch( inside a string — the mistake that inflated this count to 68', () => {
    // Verbatim shape of the curriculum text in data/weeks/week2.ts.
    const src = "const lesson = 'no ES modules and no fetch() of local files';";
    expect(fetchCallSites(src)).toEqual([]);
  });

  it('ignores fetch( inside a template literal and a comment', () => {
    expect(fetchCallSites('const s = `call fetch(x) yourself`;')).toEqual([]);
    expect(fetchCallSites('// then fetch(x)\n')).toEqual([]);
    expect(fetchCallSites('/* fetch(x) */')).toEqual([]);
  });

  it('still finds a call inside a template INTERPOLATION, which is code', () => {
    expect(fetchCallSites('const s = `${await fetch(u)}`;')).toHaveLength(1);
  });

  it('ignores a .fetch() method call on something else', () => {
    expect(fetchCallSites('await client.fetch(url);')).toEqual([]);
    expect(fetchCallSites('await prefetch(url);')).toEqual([]);
  });

  it('reads the argument list across lines and nested calls', () => {
    const src = 'await fetch(buildUrl(a, b), {\n  headers,\n  signal: AbortSignal.timeout(5000),\n});';
    const [site] = fetchCallSites(src);
    const args = callArguments(src, site.open);
    expect(args).not.toBeNull();
    expect(isBounded(args as string)).toBe(true);
  });

  it('calls a call with no signal unbounded', () => {
    const src = 'await fetch(url, { headers });';
    const [site] = fetchCallSites(src);
    expect(isBounded(callArguments(src, site.open) as string)).toBe(false);
  });
});

describe('backend/src outbound fetch timeouts', () => {
  const counts = unboundedCounts();

  it('has no unbounded fetch beyond the frozen baseline', () => {
    expect(ratchetFailures(counts, BASELINE)).toEqual([]);
  });

  it('CONTROL: finds no call site in data/, which is curriculum content', () => {
    // This is the assertion that would have caught the 68. Lesson prompts quote `fetch()`; a
    // scanner that counts them turns documentation into a work list.
    const inData = Object.keys(counts).filter((f) => f.startsWith('data/'));
    expect(inData).toEqual([]);
  });

  it('CONTROL: the scanner finds bounded calls too, so a zero is not silence', () => {
    // If the scanner were broken, every count would be 0 and the ratchet would pass vacuously
    // while reporting nothing. The tree genuinely has bounded calls; prove we can see them.
    let bounded = 0;
    for (const file of tsFiles(SRC)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const site of fetchCallSites(src)) {
        const args = callArguments(src, site.open);
        if (args !== null && isBounded(args)) bounded += 1;
      }
    }
    expect(bounded).toBeGreaterThan(20);
  });
});
