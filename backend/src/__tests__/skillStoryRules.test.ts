import * as fs from 'fs';
import * as path from 'path';

/**
 * SKILL.md §8e (the story format) names the checks that enforce its rules.
 * This test reads that section and asserts every check it names exists, so a
 * rule cannot promise a guard that is not there. It is the executable half of
 * "separate machine-enforceable validation from editorial judgment": the
 * editorial rules stay prose; the ones that claim a check are pinned here.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL = path.join(ROOT, '.claude', 'skills', 'build-case-study', 'SKILL.md');
const SRC = path.join(ROOT, 'backend', 'src');

function section8e(): string {
  const text = fs.readFileSync(SKILL, 'utf8');
  const start = text.indexOf('## 8e.');
  const end = text.indexOf('## 9.', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

describe('SKILL.md §8e names only checks that exist', () => {
  const sec = section8e();

  it('names the review, the two scripts and the rubric reference, and they exist', () => {
    expect(sec).toContain('reviewCaseStudyStory');
    expect(sec).toContain('publishCaseStudyVariants');
    expect(fs.existsSync(path.join(SRC, 'services', 'caseStudy', 'caseStudyStoryReview.ts'))).toBe(true);
    expect(fs.existsSync(path.join(SRC, 'scripts', 'reviewCaseStudyStory.ts'))).toBe(true);
    expect(fs.existsSync(path.join(SRC, 'scripts', 'publishCaseStudyVariants.ts'))).toBe(true);
    expect(read('scripts/publishCaseStudyVariants.ts')).toContain('--remove');
    expect(read('scripts/publishCaseStudyVariants.ts')).toContain('--canonical');
    expect(fs.existsSync(path.join(ROOT, '.claude', 'skills', 'build-case-study', 'references', 'story-rubric.md'))).toBe(true);
  });

  it('every story_* code the section names is a code the review emits', () => {
    const review = read('services/caseStudy/caseStudyStoryReview.ts');
    const codes = Array.from(new Set(sec.match(/story_[a-z_]+/g) ?? []));
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(review).toContain(`'${code}'`);
  });

  it('the projection and gate functions it names exist', () => {
    const variant = read('services/caseStudy/caseStudySurfaceVariant.ts');
    expect(sec).toContain('resolveSurfaceContent');
    expect(variant).toContain('export function resolveSurfaceContent');
    expect(variant).toContain('export function projectBuilder');
    expect(read('services/caseStudy/caseStudyPublishRules.ts')).toContain('checkBuilder');
    expect(read('services/caseStudy/caseStudyPublishClaimScan.ts')).toContain("push(`${prefix}[${i}].figure`");
  });

  it('the tests it names exist', () => {
    for (const t of ['caseStudySurfaceVariant.test.ts', 'caseStudySurfaceLens.test.ts']) {
      expect(sec).toContain(t);
      expect(fs.existsSync(path.join(SRC, 'services', 'caseStudy', '__tests__', t))).toBe(true);
    }
  });

  /*
   * THE COMPACT ENDING IS A THREE-SURFACE CONTRACT, and every marker the table
   * names must be one a renderer in this repository actually emits. The format
   * first shipped on the training site alone and Case Study #2 went live on the
   * other two without it; the table is what a person checks, and this is what
   * stops the table from naming a selector nobody draws.
   */
  it('the compact-ending markers it names are emitted by the renderers it names', () => {
    expect(sec).toContain('THREE-SURFACE contract');
    const shell = fs.readFileSync(path.join(ROOT, 'packages', 'case-study-shell', 'case-study-record.js'), 'utf8');
    const lower = fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'pages', 'publicV2', 'StoryLowerV2.tsx'), 'utf8');
    const arch = fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'pages', 'publicV2', 'StoryArchitectureBand.tsx'), 'utf8');
    for (const marker of ['story-build-rail', 'story-roadmap-board']) {
      expect(sec).toContain(marker);
      expect(lower).toContain(marker);
    }
    for (const cls of ["'cs-rail'", "'cs-next'", "'cs-measure-fold'"]) expect(shell).toContain(cls);
    expect(arch).toContain('More on what was built');
    for (const t of ['shellLowerHalf.test.ts', 'storyLowerV2.test.tsx']) {
      expect(sec).toContain(t);
      expect(fs.existsSync(path.join(ROOT, 'frontend', 'src', 'pages', 'publicV2', '__tests__', t))).toBe(true);
    }
    // The flow rule it states is the rule both copies of the layout carry.
    expect(sec).toContain('1.6 times');
    const layout = fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'pages', 'publicV2', 'storyWorkflowLayout.ts'), 'utf8');
    const model = fs.readFileSync(path.join(ROOT, 'packages', 'case-study-shell', 'case-study-visual-model.js'), 'utf8');
    expect(layout).toContain('MAX_SCALE_DOWN = 1.6');
    expect(model).toContain('MAX_SCALE_DOWN = 1.6');
  });

  it('the three section keys it places are keys the profiles order', () => {
    const keys = read('types/caseStudy.ts');
    const profiles = read('services/caseStudy/caseStudySurfaceProfiles.ts');
    for (const k of ['decisions', 'builder', 'closing']) {
      expect(sec).toContain(`\`${k}\``);
      expect(keys).toContain(`| '${k}'`);
      expect(profiles.split(`'${k}'`).length - 1).toBeGreaterThanOrEqual(4);
    }
  });

  it('the variant fields it lists are the fields of CaseStudySurfaceVariant', () => {
    const types = read('types/caseStudy.ts');
    const start = types.indexOf('export interface CaseStudySurfaceVariant');
    const body = types.slice(start).split(String.fromCharCode(13)).join('');
    const block = body.slice(0, body.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10)) + 3);
    for (const f of ['standfirst', 'situation', 'measurementNarrative', 'metricNotes', 'contributors', 'builder', 'decisions', 'closing']) {
      expect(sec).toContain(`\`${f}\``);
      expect(block).toContain(`readonly ${f}?`);
    }
  });
});
