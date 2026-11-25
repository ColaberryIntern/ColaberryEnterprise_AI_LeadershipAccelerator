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
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(FRONTEND_SRC);

describe('the course platform students read is Claude Academy', () => {
  it('actually scanned the frontend tree', () => {
    // A path that resolved to an empty directory would make every assertion below
    // trivially true. This is the check that stops a silent pass.
    expect(files.length).toBeGreaterThan(300);
  });

  it('has no user-facing Skilljar phrasing left in frontend/src', () => {
    const hits: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      for (const phrase of BANNED_PHRASES) {
        if (source.includes(phrase)) hits.push(`${rel}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
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
      ['frontend/src/components/portal/AnthropicCourseWrapper.tsx', ['Claude Academy']],
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
