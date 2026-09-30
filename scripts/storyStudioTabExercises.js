/**
 * storyStudioTabExercises.js — the tab-exercise entry point: `openTab`, plus
 * the seven per-tab exercises re-exported from the three modules that hold them.
 *
 * THE DISTINCTION THIS FAMILY OF FILES IS BUILT AROUND: a panel that says
 * "nothing here yet" in words is WORKING; a panel that renders a blank frame is
 * not. So every empty surface is asserted as a NAMED empty state
 * (`cs-*-empty`, `cs-*-idle`, `cs-*-none`), never as "the panel did not throw".
 *
 * WHAT IT IS ALLOWED TO WRITE TO PRODUCTION. Everything here is an action a
 * working admin takes on a normal day, and the destructive lifecycle acts are
 * excluded by construction rather than by care: `unpublish` and `archive` are
 * never clicked on the pilot record, and no override is applied to it, because
 * an override mints a new snapshot version and would move a published record
 * into `draft-ahead`. Reversible writes (a storyline, a re-save of unchanged
 * consent, an attach immediately followed by its detach) are performed and then
 * checked back through the API, so "the click did something" is never inferred
 * from the click.
 *
 * WHY THIS FILE IS AN INDEX AND NOT THE WHOLE SUITE. It reached 497 lines
 * against CLAUDE.md's 500-line hard ceiling on the 2026-08-26 run, which
 * recorded the ceiling as the next change's first problem. The rule is that the
 * next change splits before it adds, so the 2026-08-27 re-audit split first:
 *
 *   storyStudioExercisesEvidence.js   TRUTH, SOURCES   — where facts come from
 *   storyStudioExercisesNarrative.js  STORY, VISUALS   — what is made of them
 *   storyStudioExercisesRelease.js    SURFACES, PREVIEW, PUBLISH — what ships
 *
 * The export surface is unchanged, so `exerciseStoryStudioProduction.js` did
 * not need editing to accommodate the split.
 */
const P = require('./storyStudioProbe');

const SETTLE = 1800;

/** Select a studio tab and prove the tabpanel actually changed. */
async function openTab(page, rec, key, label) {
  const clicked = await P.click(page, `cs-studio-tab-${key}`, SETTLE);
  if (!clicked.ok) {
    rec.check(`${label}: the tab button exists and is clickable`, false, clicked.why);
    return false;
  }
  const selected = await page.locator(`[data-testid="cs-studio-tab-${key}"]`)
    .first().getAttribute('aria-selected').catch(() => null);
  const question = await P.text(page, 'cs-studio-tab-question');
  rec.check(`${label}: the tab reports itself selected`, selected === 'true', `aria-selected=${selected}`);
  rec.check(`${label}: the tab states the question it answers`,
    Boolean(question && question.length > 20), question ? question.slice(0, 120) : 'no question rendered');
  return true;
}

module.exports.openTab = openTab;
module.exports.SETTLE = SETTLE;

/* The three exercise modules require `openTab` from here, so they are loaded
   after it is exported. This is a deliberate ordering, not an accident of
   style: swapping these lines above the assignment gives every module an
   `openTab` of `undefined` and the failure surfaces as a null-call deep inside
   the first tab rather than at load time. */
const evidence = require('./storyStudioExercisesEvidence');
const narrative = require('./storyStudioExercisesNarrative');
const release = require('./storyStudioExercisesRelease');

module.exports.truth = evidence.truth;
module.exports.sources = evidence.sources;
module.exports.story = narrative.story;
module.exports.visuals = narrative.visuals;
module.exports.surfaces = release.surfaces;
module.exports.preview = release.preview;
module.exports.publish = release.publish;
