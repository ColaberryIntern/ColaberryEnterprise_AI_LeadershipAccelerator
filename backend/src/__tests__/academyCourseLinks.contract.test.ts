/**
 * Nothing students can reach may point at Skilljar.
 *
 * Anthropic's courses moved from anthropic.skilljar.com to academy.claude.com and
 * Skilljar retires in early December 2026. The failure this guards against already
 * happened once, on 2026-11-25: every Skills Course card was updated to Academy by
 * hand, saved correctly, and students still landed on Skilljar - because
 * seedCurriculumCourseLinks.ts runs on EVERY backend restart and rewrote the table
 * the classroom week page reads, from a hardcoded Skilljar constant. A correct card
 * and a stale constant look identical until a deploy happens.
 *
 * So the host is pinned by a test rather than by everyone remembering. The same trap
 * is still loaded in weekBlueprints.ts, which seedSkilljarCards.ts rewrites student
 * CARDS from, and in catalogFallback.ts, which serves the catalog when the scraper
 * cannot reach Anthropic.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const SKILLJAR_HOST = 'anthropic.skilljar.com';

/**
 * Files allowed to keep a Skilljar URL, each for a stated reason. This list is
 * debt made visible: it should only ever shrink. Do not add to it to make a build
 * pass - a new Skilljar link in live code is the bug this test exists to catch.
 */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'scripts/sendAliClaudeCodeTrainingHotmail.js',
    why: 'The HTML of an email that was already sent. Its source is the record of what the recipient actually received; rewriting it would falsify that record.',
  },
  {
    file: 'scripts/addToAnthropicCohort.js',
    why: 'One-off that already ran (June 2026): the Basecamp todos it created carry these links. Historical.',
  },
  {
    file: 'scripts/createRamAnthropicOnboarding.js',
    why: 'One-off that already ran (June 2026), same as above. Historical.',
  },
  {
    file: 'services/__tests__/anthropicCatalogScraper.test.ts',
    why: 'URL-normalization fixtures (trailing slash, casing, query strings). Their host is irrelevant to what they assert.',
  },
  {
    file: 'services/content/__tests__/academyLabelCopy.test.ts',
    why: 'The sibling lint, which bans the user-facing Skilljar PHRASINGS in frontend/src. It has to name the host it forbids, the same way this file does. Found the hard way: both guards were green on their own branches and only met on main.',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const offenders = walk(SRC)
  // This file names the host it forbids, so it would always flag itself.
  .filter((f) => path.resolve(f) !== path.resolve(__filename))
  .filter((f) => fs.readFileSync(f, 'utf-8').includes(SKILLJAR_HOST))
  .map((f) => path.relative(SRC, f).split(path.sep).join('/'));

const allowedFiles = new Set(ALLOWED.map((a) => a.file));

describe('course links point at Claude Academy, not Skilljar', () => {
  it('has no Skilljar URL outside the documented allowlist', () => {
    expect(offenders.filter((f) => !allowedFiles.has(f))).toEqual([]);
  });

  it('keeps the allowlist honest: every entry still actually holds one', () => {
    // An allowlist entry for a file that no longer needs it is a license nobody
    // revoked. If this fails, delete the entry - the file is already clean.
    expect(ALLOWED.map((a) => a.file).filter((f) => !offenders.includes(f))).toEqual([]);
  });

  it('pins the live Academy slugs in the week blueprints', () => {
    // weekBlueprints.ts is what seedSkilljarCards.ts rewrites student cards from.
    // Pinned by name, not by host, because these are NOT the Skilljar slugs with
    // the host swapped: week 3's course was renamed to building-with-the-claude-api
    // and its old name (claude-with-the-anthropic-api) 404s on Academy. A host-only
    // assertion would pass while sending week 3 to a dead page.
    const bp = fs.readFileSync(path.join(SRC, 'data/weekBlueprints.ts'), 'utf-8');
    const slugs = [
      'claude-code-101',
      'introduction-to-agent-skills',
      'building-with-the-claude-api',
      'introduction-to-model-context-protocol',
      'model-context-protocol-advanced-topics',
      'introduction-to-subagents',
      'claude-code-in-action',
    ];
    expect(slugs.filter((s) => !bp.includes(s))).toEqual([]);
  });

  it('has retired week 3’s renamed slug from every file that builds a URL from it', () => {
    // The host swap cannot see this one. These three files build a course URL from
    // a base constant plus a slug, so moving the host carried the DEAD slug along
    // with it - which is how #4442 changed canonicalCourse.ts's base and left its
    // slug pointing at a 404 under the new host. Checked per file so a failure
    // names the file rather than just saying "somewhere".
    const files = [
      'data/weekBlueprints.ts',
      'data/canonicalCourse.ts',
      'scripts/lib/curriculumWeeks.js',
    ];
    const stale = files.filter((f) =>
      fs.readFileSync(path.join(SRC, f), 'utf-8').includes('claude-with-the-anthropic-api')
    );
    expect(stale).toEqual([]);
  });
});
