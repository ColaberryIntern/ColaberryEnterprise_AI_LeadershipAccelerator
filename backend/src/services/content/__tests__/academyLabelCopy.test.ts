/**
 * The platform students READ is Claude Academy, not Skilljar.
 *
 * Anthropic's courses moved to academy.claude.com and Skilljar retires in early
 * December 2026. #4442 and its follow-on moved every link; this moves the words,
 * and stops them drifting back.
 *
 * WHY PHRASES AND NOT THE TOKEN. "SkillsJar" is still legal in this codebase and
 * must stay: `SkillsJarPanel`, `isSkillsJar`, the `skills_jar` render band, the
 * `anthropic_skills_jar` card type, the `tld-skilljar` CSS class and the
 * 'skilljar' CourseKind are all switched on in code or constrained in the
 * database. Renaming them is a migration with its own decision attached. So this
 * lint bans the user-facing PHRASINGS - the shapes the token only takes when it
 * is being shown to a person - and leaves every identifier alone.
 *
 * Sibling of frontendTypographyLint.test.ts, which scans the same tree from here
 * for the same reason: the backend unit-test gate is where tree-wide copy rules
 * are enforced in this repo.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const FRONTEND_SRC = path.join(REPO_ROOT, 'frontend', 'src');
// BACKEND TOO, and this is the whole lesson of Swati's 26 Nov list. This lint
// shipped scanning only the frontend, so `backend/src/data/claudeCode101Card.ts`
// kept telling every week 1 student the course "is taught on Anthropic's
// SkillsJar platform" - a phrase BANNED_PHRASES names explicitly. The lint was
// not wrong about the rule. It was looking at one half of the tree.
const BACKEND_SRC = path.join(REPO_ROOT, 'backend', 'src');

/** Files allowed to hold a banned phrase, each with the reason it holds one.
 *  Checked by the honesty test below, so an entry cannot outlive its reason. */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'backend/src/data/weekBlueprints.ts',
    why: 'instructor_notes record WHICH Anthropic course each week was built from, back when it was hosted on Skilljar ("Anchored on Skilljar ..."). That is provenance for staff, it is historically true, and no student ever reads it.',
  },
  {
    file: 'backend/src/services/runtime/certificateService.ts',
    why: 'The verifier PROMPT has to name the old platform. A student who took the course before the move holds a Skilljar-issued certificate, and the model is told in so many words to keep accepting it. These are instructions to a model, never a string a student sees - rewording them to satisfy this lint would cost real students their proof.',
  },
  {
    file: 'backend/src/scripts/lib/curriculumWeeks.js',
    why: 'A comment dating when the week-to-course mapping was validated against the live catalog (2026-06-10, while it was still hosted there). The same comment already states the courses now live on Claude Academy.',
  },
  // One-off scripts that already ran. Rewriting history in them would make the
  // record of what was actually sent untrue. The sibling link guard in
  // backend/src/__tests__/academyCourseLinks.contract.test.ts allowlists these
  // three for the same reason.
  {
    file: 'backend/src/scripts/addToAnthropicCohort.js',
    why: 'One-off that already ran (June 2026). It records the links that were actually used at the time.',
  },
  {
    file: 'backend/src/scripts/createRamAnthropicOnboarding.js',
    why: 'One-off that already ran (June 2026). It records the links that were actually used at the time.',
  },
  {
    file: 'backend/src/scripts/sendAliClaudeCodeTrainingHotmail.js',
    why: 'The HTML of an email that was already sent. The copy of a delivered message is a record, not live copy.',
  },
];
const ALLOWED_FILES = new Set(ALLOWED.map((a) => a.file));

/** Shapes the old platform name only takes when a person is meant to read it. */
const BANNED_PHRASES: ReadonlyArray<string> = [
  'Open in SkillsJar',
  'Open course on Skilljar',
  'on SkillsJar',
  'on Skilljar',
  '· SkillsJar',
  '· Skilljar',
  'SKILLSJAR COURSE',
  'SkillsJar course URL',
  'SkillsJar course link',
  'SkillsJar link',
  'anthropic.skilljar.com',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // __tests__ is skipped because a test has to be able to NAME the string it
      // asserts about. #4457 was exactly this: the tree-wide link guard failed on
      // main because this lint names the host it forbids. Excluding tests is the
      // general form of that fix - one rule instead of an allowlist that grows by
      // one entry every time a sibling guard is written.
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const frontendFiles = walk(FRONTEND_SRC);
const backendFiles = walk(BACKEND_SRC);
const files = [...frontendFiles, ...backendFiles];

describe('the course platform students read is Claude Academy', () => {
  it('actually scanned BOTH trees', () => {
    // A path that resolved to an empty directory would make every assertion below
    // trivially true. This is the check that stops a silent pass - and it counts
    // the two trees separately, because the bug being fixed here is one of them
    // silently not being scanned at all.
    expect(frontendFiles.length).toBeGreaterThan(300);
    expect(backendFiles.length).toBeGreaterThan(300);
  });

  it('has no user-facing Skilljar phrasing left in the shipped source', () => {
    const hits: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      if (ALLOWED_FILES.has(rel)) continue;
      const source = fs.readFileSync(file, 'utf-8');
      for (const phrase of BANNED_PHRASES) {
        if (source.includes(phrase)) hits.push(`${rel}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('keeps the allowlist honest - every entry still holds a banned phrase', () => {
    // An allowlist entry whose file no longer needs it is a hole nobody notices.
    const stale: string[] = [];
    for (const { file } of ALLOWED) {
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
      if (!BANNED_PHRASES.some((p) => source.includes(p))) stale.push(file);
    }
    expect(stale).toEqual([]);
  });

  it('says Claude Academy on every surface that used to say Skilljar', () => {
    // The other half of the rule. Banning the old phrase alone would also pass if
    // someone deleted the label outright, leaving a student with an unlabelled
    // link to a platform they have never heard of.
    const expected: ReadonlyArray<[string, ReadonlyArray<string>]> = [
      ['frontend/src/pages/portal/ClassroomWeekPage.tsx', [
        'Anthropic · Claude Academy',
        'Open course in Claude Academy',
        'Opens in a new tab on Claude Academy.',
      ]],
      ['frontend/src/components/timeline/SkillsJarPanel.tsx', [
        'CLAUDE ACADEMY COURSE',
        'Anthropic · Claude Academy',
        'Open in Claude Academy',
        'This part of the course is on Claude Academy.',
        'The course is delivered on Claude Academy.',
        // Academy awards a completion BADGE and issues no certificate, so asking a
        // student to upload a certificate asks for something that does not exist.
        // The verifier learned this in #4452; this is the copy the student reads.
        'Upload your completion badge to complete',
        'upload your completion badge to mark this complete',
        'Choose badge or certificate',
      ]],
      ['frontend/src/components/timeline/TimelineCard.tsx', [
        // The tile a student sees BEFORE opening anything. It still advertised a
        // certificate after #4459 fixed the panel, because the same sentence lives
        // in two components and only one of them was pinned.
        'External course \u00b7 completion badge required',
      ]],
      ['frontend/src/components/portal/AnthropicCourseWrapper.tsx', ['Claude Academy']],
      // Backend-held copy a student reads. Unreachable by this lint until it
      // started walking backend/src, which is how the week 1 card kept its
      // SkillsJar wording through four merged PRs.
      ['backend/src/data/claudeCode101Card.ts', [
        'Open in Claude Academy',
        'upload your completion badge to mark this complete',
      ]],
      ['backend/src/services/timeline/courseDraftService.ts', [
        // The PROMPT that writes new course cards. Left alone, every card made
        // from here would have reintroduced the wording the rest of this fixes.
        'delivered on Claude Academy',
        'complete this course on Claude Academy',
        'upload their completion badge here',
      ]],
      ['frontend/src/components/portal/anthropic-bento/AnthropicCoursesBento.tsx', [
        'Anthropic · Claude Academy',
      ]],
      // These two tell an ADMIN which link to paste, so a stale host here is how a
      // dead link gets back into a student's card by hand.
      ['frontend/src/pages/admin/orchestration/ExperienceStudioTab.tsx', [
        'https://academy.claude.com/courses/',
      ]],
      ['frontend/src/pages/admin/orchestration/TimelineEditorTab.tsx', [
        'https://academy.claude.com/courses/',
        'Claude Academy course',
      ]],
    ];

    const missing: string[] = [];
    for (const [rel, phrases] of expected) {
      const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      for (const phrase of phrases) {
        if (!source.includes(phrase)) missing.push(`${rel}: ${phrase}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps announcement line breaks, which is what pre-line is there for', () => {
    // Swati: announcement descriptions arrived as one run-on paragraph. `.tld-desc`
    // renders stored text - card.description, content.summary, content.reflection -
    // where the author typed the breaks on purpose, and `white-space: normal` threw
    // them away. Asserted here because no unit test renders this stylesheet.
    const css = fs.readFileSync(
      path.join(FRONTEND_SRC, 'components', 'timeline', 'timeline.css'),
      'utf-8'
    );
    const rule = css
      .split('\n')
      .find((line) => line.startsWith('.tl-de .tld-desc{'));
    expect(rule).toBeDefined();
    expect(rule).toContain('white-space:pre-line');
  });
});
