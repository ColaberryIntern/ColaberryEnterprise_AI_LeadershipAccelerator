/**
 * Repo visibility: one answer, everywhere the student can read one.
 *
 * The defect this locks shut was not a wrong boolean, it was a DISAGREEMENT.
 * `studentWorkspaceService.ts` provisioned with `private: true`, while the
 * webhook panel warned in bold that "your repo is public", STORY-000's prompt
 * asserted "This repo is public", and `pagesUrlService.ts` noted that Pages on
 * a private repo needs a paid plan. So a provisioned student was told their
 * work was public, was warned about secrets on that basis, and then hit a
 * paywall on the final step of the very first story. Most students make their
 * own repo and make it public, so the cohort was split down the middle and
 * behaving differently on identical instructions.
 *
 * Ali Muwwakkil decided on 2026-08-19: provision public, and make every
 * document match. A boolean flip alone would have left the copy free to drift
 * back, which is exactly how this started, so the copy is pinned here too.
 *
 * The security half matters more than the tidiness half. A student who believes
 * their repo is private will commit a `.env`. Every surface that tells them
 * where their code is going must therefore also tell them it is public and that
 * secrets must stay out of it.
 */
import { buildStoryPrompt } from '../buildStoryPrompt';
import { renderDocs, manifestPaths } from '../renderDocs';
import { renderBundleNotice } from '../docsBundle';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const story = pilot.stories.find((s) => s.id === 'STORY-001')!;
const REPO = 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63';

const promptWithRepo = (): string =>
  buildStoryPrompt(pilot, story, {
    repoUrl: REPO,
    manifestPaths: manifestPaths(renderDocs(pilot, { repoUrl: REPO })),
  });

describe('the story prompt tells the student the repo is public', () => {
  it('says PUBLIC where it points Claude Code at the repo', () => {
    expect(promptWithRepo()).toMatch(/PUBLIC/);
  });

  it('never calls the workspace repo private', () => {
    // The exact phrase that used to ship in every STORY-001+ prompt, and which
    // was rendered into the student's own repo as part of their docs.
    expect(promptWithRepo()).not.toMatch(/private workspace/i);
  });

  it('warns against committing a secret, in the same breath', () => {
    const prompt = promptWithRepo();
    expect(prompt).toMatch(/never (write|commit) a secret/i);
    expect(prompt).toMatch(/\.env/);
  });

  it('says it in the no-repo branch too, before the student has one', () => {
    // A student reads this BEFORE choosing how to set the repo up, which is the
    // useful moment to learn what will be visible.
    const noRepo = buildStoryPrompt(pilot, story, { manifestPaths: [] });
    expect(noRepo).toMatch(/public/i);
    expect(noRepo).not.toMatch(/private repo/i);
  });
});

describe('the docs bundle README tells the student the repo is public', () => {
  const notice = (): string => renderBundleNotice('Sponsor Dashboard', 'p-1');

  it('describes the repo the platform would create as public, not private', () => {
    expect(notice()).toMatch(/empty public/i);
    expect(notice()).not.toMatch(/empty private/i);
  });

  it('states plainly that anyone can read it, and names what must not be committed', () => {
    const text = notice();
    expect(text).toMatch(/public/i);
    expect(text).toMatch(/anyone/i);
    // Naming the artifacts beats an abstract "do not commit secrets": the
    // student who leaks one is usually not thinking of it as a secret.
    expect(text).toMatch(/API key/i);
    expect(text).toMatch(/\.env/);
  });
});
