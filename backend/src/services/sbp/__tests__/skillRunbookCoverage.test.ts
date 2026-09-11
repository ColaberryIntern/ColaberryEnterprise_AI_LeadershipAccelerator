import fs from 'fs';
import path from 'path';

/**
 * The runbook must know about every module in the pipeline it documents.
 *
 * ## Why this test exists
 *
 * `.claude/skills/build-student-project/SKILL.md` is the runbook a human or an
 * agent follows when a student's build is broken. Its own reference file says
 * the point of the skill is the failure history: every rule, with the incident
 * that produced it.
 *
 * On 2026-09-09 that runbook was measured against the pipeline it describes. It
 * was pinned to PR #1463 and its module map to `4078338f` (2026-08-13).
 *
 * It named 34 of 64 modules. The sweep found THIRTY undocumented, which was far
 * more than the seven the first hand-audit spotted - the same lens-widening
 * lesson the runbook's own publish incident teaches, arriving again.
 *
 * The seven that a human noticed first are worth naming, because each is a
 * lesson bought with a real student's day:
 *
 *   fileOwnership          a bot overwrote a student's hand-edited plan.json,
 *                          he restored it, the bot overwrote him again
 *   activeProjectDrift     a student built in her second project and watched
 *                          her first; the platform verified her work at 3 of 3
 *                          while her portal truthfully showed 0 of 3
 *   repoWriteAccess        one enrollment, two repositories, chosen by whatever
 *                          order Postgres happened to return
 *   capabilityRepoReader   the portfolio read the upload mirror, so a student
 *                          who built everything in their own repo saw an
 *                          almost empty page
 *   repoSignals            structure a file tree can honestly report, and the
 *                          quality it can never report
 *   buildLabContract       the labs live in the database, so nothing in CI
 *                          could fail when a lab renamed a path the portfolio
 *                          was looking for
 *
 * Every one of those is a lesson bought with a real student's day. A runbook
 * that does not carry them sends the next reader to re-derive them.
 *
 * ## Why a hard failure and not a report
 *
 * A report is what allowed the gap to reach thirty. The escape hatch is one line
 * in `NOT_IN_RUNBOOK` below, so a module that genuinely does not belong in a
 * human runbook costs a sentence rather than a green check nobody reads.
 *
 * This test reads FILES, not the module graph, so it holds even when a module
 * is only reachable through a dynamic import.
 */

const SBP_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const SKILL_DIR = path.join(REPO_ROOT, '.claude', 'skills', 'build-student-project');

/**
 * Modules deliberately absent from the runbook, each with the reason.
 *
 * Keep this SHORT. A long list is this test failing quietly: the whole point is
 * that adding a module to the pipeline should cost a line of documentation, and
 * an allowlist entry is how that cost gets avoided.
 */
const NOT_IN_RUNBOOK: Readonly<Record<string, string>> = {
  // Empty, and that is the healthy state. On 2026-09-09 the runbook named 34 of
  // 64 modules; documenting the other 30 turned out to be a morning's work, and
  // every one of them had something a reader would want on the day it breaks.
  //
  // Add an entry only for a module with genuinely no student-visible failure
  // mode, and say why in the value. An allowlist that grows is this test being
  // switched off one line at a time.
};

/** Every module the pipeline ships, by bare name. */
function pipelineModules(): string[] {
  const walk = (dir: string, prefix = ''): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__tests__') return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full, `${prefix}${entry.name}/`);
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) return [];
      return [entry.name.replace(/\.ts$/, '')];
    });
  return [...new Set(walk(SBP_DIR))].sort();
}

/** The runbook and every reference file it routes to, as one searchable string. */
function runbookText(): string {
  const files = [
    path.join(SKILL_DIR, 'SKILL.md'),
    ...fs.existsSync(path.join(SKILL_DIR, 'references'))
      ? fs.readdirSync(path.join(SKILL_DIR, 'references'))
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(SKILL_DIR, 'references', f))
      : [],
  ];
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

describe('build-student-project runbook covers the pipeline it documents', () => {
  const modules = pipelineModules();
  const text = runbookText();

  it('finds the skill and a non-trivial pipeline, so the sweep cannot pass by scanning nothing', () => {
    // The failure this guards: a wrong path returns an empty module list and an
    // empty runbook, and every assertion below then passes vacuously.
    expect(fs.existsSync(path.join(SKILL_DIR, 'SKILL.md'))).toBe(true);
    expect(modules.length).toBeGreaterThan(20);
    expect(text.length).toBeGreaterThan(20_000);
    expect(modules).toContain('sbpOrchestrator');
  });

  it('names every pipeline module, or says in one line why it is not worth naming', () => {
    const missing = modules
      .filter((m) => !(m in NOT_IN_RUNBOOK))
      .filter((m) => !text.includes(m));

    // The message has to be actionable, because the person reading it is
    // usually not the person who added the module.
    expect({
      missing,
      whatToDo: 'Add each module to the runbook with the failure it prevents, '
        + 'or add it to NOT_IN_RUNBOOK with the reason it has no student-visible failure mode.',
    }).toEqual({ missing: [], whatToDo: expect.any(String) });
  });

  it('keeps the escape hatch honest: every allowlisted module still exists and carries a reason', () => {
    // Vacuous while the allowlist is empty, which is deliberate: the assertion
    // costs nothing today and starts working the moment somebody adds an entry.
    for (const [name, reason] of Object.entries(NOT_IN_RUNBOOK)) {
      // A stale allowlist entry is a silent licence for a future module of the
      // same name to skip the runbook.
      expect({ name, exists: modules.includes(name) }).toEqual({ name, exists: true });
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('carries the seven hardening lessons from the six weeks after PR #1463', () => {
    // Named individually rather than counted, so a partial rewrite that drops
    // one of them fails on the one it dropped.
    for (const lesson of [
      'fileOwnership',
      'activeProjectDrift',
      'repoWriteAccess',
      'capabilityRepoReader',
      'repoSignals',
      'buildLabContract',
      'repoConnect',
    ]) {
      expect({ lesson, documented: text.includes(lesson) }).toEqual({ lesson, documented: true });
    }
  });
});
