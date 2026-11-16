import * as fs from 'fs';
import * as path from 'path';

/**
 * Nothing we send a student may require them to buy Anthropic's Max or Team plan
 * for Claude Code.
 *
 * THE FACT, with its source. Claude Code is included on Anthropic's **Pro** plan.
 * code.claude.com/docs/en/setup (read 2026-11-16): "Claude Code requires a Pro, Max,
 * Ultra, Team, Enterprise, or Console account. The free claude.ai plan does not
 * include Claude Code access." Pro is listed first and is $20/month, or $17/month
 * paid annually (claude.com/pricing).
 *
 * WHAT THIS CAUGHT. Until 2026-11-16 three places told enrolling students they needed
 * a "Claude Code paid account (Max or Team plan)":
 *
 *   - frontend/src/pages/EnrollSuccessPage.tsx, the page shown immediately AFTER
 *     someone pays
 *   - backend/src/services/emailService.ts, in the welcome email
 *   - backend/src/seeds/seedClassReadinessCampaign.ts, in the AI instructions for the
 *     T-minus readiness emails
 *
 * Two separate harms, which is why this is a test and not a note. Max is $100/month,
 * so the instruction overstated an unavoidable cost of the course by five times. And a
 * Team plan cannot be bought by one person at all - claude.com/pricing says "For teams
 * of 2 to 150" - so a student following the instruction literally hits a two-seat
 * minimum for something they cannot use alone.
 *
 * WHY THE ASSERTION IS ABOUT THE INSTRUCTION AND NOT THE PRICE. Anthropic renamed
 * Max 5x to "Max" and Max 20x to "Ultra" on 2026-10-30 and will change prices again.
 * A test pinning "$20" would fail on a price change that is nobody's mistake, and a
 * test that fails for the wrong reason gets deleted. A test pinning "do not instruct a
 * student to buy Max or Team" stays true across repricings, because the defect is
 * telling an individual to buy the wrong product.
 *
 * Scope is backend/src only; the frontend has its own copy lint. The frontend fix is
 * held by the comment at EnrollSuccessPage.tsx's requirement list.
 */

const SRC = path.resolve(__dirname, '../..');

/** Patterns that instruct a reader to obtain Max or Team specifically. */
const BAD_INSTRUCTION = [
  // The exact phrasing that shipped, in copy and in AI instructions.
  /\(\s*Max\s+or\s+Team\s+plan\s*\)/i,
  /requires?\s+(?:a\s+)?(?:Claude\s+Code\s+)?(?:Max|Team)\s+plan/i,
  /need\s+(?:a\s+)?(?:Max|Team)\s+plan/i,
  /must\s+(?:have|buy|purchase)\s+(?:a\s+)?(?:Max|Team)\s+plan/i,
];

/** Files whose own text is ABOUT the rule, so a match there is the rule, not a breach. */
const SELF_REFERENTIAL = new Set([
  path.join('services', '__tests__', 'claudeCodePlanCopy.test.ts'),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('Claude Code plan copy', () => {
  const files = walk(SRC);

  it('scans a non-trivial number of files (guards against a broken walk)', () => {
    // A walk that silently returns [] would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(500);
  });

  it('no file instructs a student to buy the Max or Team plan', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC, file);
      if (SELF_REFERENTIAL.has(rel)) continue;
      // A line that forbids the instruction is not the instruction.
      const text = fs.readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (/never tell|do not buy|do not tell|until 2026-11-16|overstated/i.test(line)) continue;
        if (BAD_INSTRUCTION.some((p) => p.test(line))) {
          offenders.push(`${rel}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the readiness campaign names the plan that actually includes Claude Code', () => {
    const seed = fs.readFileSync(
      path.join(SRC, 'seeds', 'seedClassReadinessCampaign.ts'),
      'utf8'
    );
    expect(seed).toMatch(/Pro plan/);
    expect(seed).toMatch(/never tell them to buy a Team plan/i);
  });

  it('the welcome email names the Pro plan rather than a tier that does not include it', () => {
    const svc = fs.readFileSync(path.join(SRC, 'services', 'emailService.ts'), 'utf8');
    expect(svc).toMatch(/paid Anthropic plan with Claude Code/);
  });

  // The self-test: the patterns must actually fire on the string that shipped,
  // otherwise this suite passes by being blind.
  it('self-test: the patterns catch the copy that was live until 2026-11-16', () => {
    const shipped = '<li><strong>Claude Code paid account</strong> (Max or Team plan)</li>';
    expect(BAD_INSTRUCTION.some((p) => p.test(shipped))).toBe(true);
  });

  it('self-test: the patterns do not fire on correct copy', () => {
    const good =
      'A paid Anthropic plan with Claude Code - the Pro plan at $20/month covers it';
    expect(BAD_INSTRUCTION.some((p) => p.test(good))).toBe(false);
  });

  it('self-test: mentioning Max as an optional upgrade is allowed', () => {
    const optional = 'Max at $100/month only if they expect to hit usage limits';
    expect(BAD_INSTRUCTION.some((p) => p.test(optional))).toBe(false);
  });
});
