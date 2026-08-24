/**
 * fileOwnership — the classification every delivery surface asks about.
 *
 * The last test here is the important one: it walks the ACTUAL renderer output
 * rather than a hand-written list, so a future file added to `renderDocs` that
 * a student is meant to own cannot quietly inherit the `platform` default and
 * become shippable in a zip.
 */
import { ownershipOf, isSafeToOverwrite, seedPathFor } from '../fileOwnership';
import { renderDocs } from '../renderDocs';
import { PROGRESS_FILE_PATH } from '../verification/progressContract';
import { PROFILE_FILE_PATH } from '../profileContract';
import { PLAN_FILE_PATH } from '../planDocument';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;

describe('ownershipOf', () => {
  it('classifies the progress file as co-owned', () => {
    expect(ownershipOf(PROGRESS_FILE_PATH)).toBe('co_owned');
  });

  it('classifies the profile file as student-owned', () => {
    expect(ownershipOf(PROFILE_FILE_PATH)).toBe('student');
  });

  it('classifies the plan as platform-generated but not platform-owned', () => {
    // NOT `platform`. Students hand-edit this file and their Command Center
    // reads it at runtime, so a blind overwrite costs them the data and the
    // dashboard built on it. The platform regenerates it only while the repo
    // copy is provably still the one it wrote.
    expect(ownershipOf(PLAN_FILE_PATH)).toBe('platform_unless_edited');
  });

  it('classifies the manifest and the documents as platform-owned', () => {
    expect(ownershipOf('.colaberry/manifest.json')).toBe('platform');
    expect(ownershipOf('docs/REQUIREMENTS.md')).toBe('platform');
    expect(ownershipOf('CLAUDE.md')).toBe('platform');
  });
});

describe('isSafeToOverwrite', () => {
  it('is false for anything the student writes into', () => {
    expect(isSafeToOverwrite(PROGRESS_FILE_PATH)).toBe(false);
    expect(isSafeToOverwrite(PROFILE_FILE_PATH)).toBe(false);
  });

  it('is false for the plan, which needs a check no blind overwrite can run', () => {
    // The zip path consults this and nothing else. `repoWriter` can afford to
    // ask GitHub whether the repo copy is still ours before replacing it; an
    // `unzip` over a working tree cannot ask anything, so the plan must not
    // travel on its live path.
    expect(isSafeToOverwrite(PLAN_FILE_PATH)).toBe(false);
  });

  it('is true for files the platform regenerates every sync', () => {
    expect(isSafeToOverwrite('docs/STORIES.md')).toBe(true);
    expect(isSafeToOverwrite('.colaberry/manifest.json')).toBe(true);
  });
});

describe('seedPathFor', () => {
  it('moves a file onto a sibling that cannot collide with the original', () => {
    expect(seedPathFor(PROGRESS_FILE_PATH)).toBe('.colaberry/progress.seed.json');
    expect(seedPathFor(PROFILE_FILE_PATH)).toBe('.colaberry/profile.seed.json');
    expect(seedPathFor(PLAN_FILE_PATH)).toBe('.colaberry/plan.seed.json');
  });

  it('never returns the path it was given', () => {
    for (const p of [PROGRESS_FILE_PATH, PROFILE_FILE_PATH, PLAN_FILE_PATH]) {
      expect(seedPathFor(p)).not.toBe(p);
    }
  });
});

describe('the classification covers everything the renderer emits', () => {
  const rendered = renderDocs(pilot, {
    repoUrl: null, generatedAt: '2026-08-14T00:00:00Z', planVersion: 1, planSha256: 'x',
  }).map((f) => f.path);

  it('leaves no .colaberry JSON file unclassified by accident', () => {
    // Everything under `.colaberry/` is either explicitly classified or is one
    // of the two files the platform genuinely regenerates wholesale. A NEW
    // `.colaberry` file arriving here forces a deliberate decision.
    const known = new Set([PLAN_FILE_PATH, '.colaberry/manifest.json', PROGRESS_FILE_PATH, PROFILE_FILE_PATH]);
    const unexpected = rendered.filter((p) => p.startsWith('.colaberry/') && !known.has(p));
    expect(unexpected).toEqual([]);
  });

  it('agrees with the ownership model documented in profileContract', () => {
    expect(rendered).toContain(PLAN_FILE_PATH);
    expect(rendered).toContain(PROGRESS_FILE_PATH);
    expect(rendered).toContain(PROFILE_FILE_PATH);
    // Every file that needs a check before it lands, and no others. The zip
    // path reroutes exactly this set onto `.seed.json` siblings.
    expect(rendered.filter((p) => !isSafeToOverwrite(p)).sort())
      .toEqual([PLAN_FILE_PATH, PROGRESS_FILE_PATH, PROFILE_FILE_PATH].sort());
  });
});
