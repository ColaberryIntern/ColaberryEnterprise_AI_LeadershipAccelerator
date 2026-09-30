/**
 * storyStudioExercisesRelease.js — SURFACES, PREVIEW and PUBLISH: the three
 * tabs between a finished record and a reader.
 *
 * Split out of `storyStudioTabExercises.js` on 2026-08-27; see that file's
 * header for the whole map.
 *
 * THE GATING THIS FILE RECORDS RATHER THAN ROUTES AROUND. The four-lens
 * switcher on SURFACES is gated behind `CASE_STUDY_SURFACE_LAB_USER_IDS`, which
 * is unset in production, so three of the four lenses answer 403. That is a
 * configuration fact about the live environment, not a defect in the tab, and
 * the run reports it as a finding every time instead of quietly setting the
 * variable to make a check go green.
 */
const P = require('./storyStudioProbe');
const { openTab } = require('./storyStudioTabExercises');

/* --------------------------------------------------------------- SURFACES --- */

async function surfaces(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'surfaces', 'SURFACES'))) return;
  void api; void opts;

  const tablist = (await P.count(page, 'cs-surface-lab-tablist')) > 0;
  const lensTabs = await P.countPrefix(page, 'cs-lens-tab-');
  rec.check('SURFACES: the four-lens switcher renders', tablist && lensTabs === 4,
    `tablist=${tablist}, ${lensTabs} lens tabs`);

  const err = await P.text(page, 'cs-surface-lab-error');
  const idle = (await P.count(page, 'cs-surface-lab-idle')) > 0;
  const bands = await P.countPrefix(page, 'cs-lens-band-');
  const noBands = (await P.count(page, 'cs-surface-lab-no-bands')) > 0;
  const canonical = await P.text(page, 'cs-surface-lab-canonical');
  const publication = await P.text(page, 'cs-surface-lab-publication');
  const draft = await P.text(page, 'cs-surface-lab-draft');
  const live = await P.text(page, 'cs-lens-live-marker');

  rec.check('SURFACES: the lab reports a state rather than a blank frame',
    Boolean(err) || idle || bands > 0 || noBands,
    err ? `error: ${err.slice(0, 200)}` : `idle=${idle}, ${bands} bands, no-bands=${noBands}`);
  rec.check('SURFACES: the canonical truth line renders (it proves the lens changed no facts)',
    Boolean(canonical), canonical ? canonical.slice(0, 180) : 'not rendered');
  rec.check('SURFACES: the publication state and gate verdict render',
    Boolean(publication), publication ? publication.slice(0, 180) : 'not rendered');
  rec.check('SURFACES: the draft state is a named state, not an invented change count',
    Boolean(draft) && !/\d+\s+changes?/i.test(draft || ''),
    draft ? draft.slice(0, 160) : 'not rendered');
  rec.check('SURFACES: the live surface is marked in text, not by colour alone',
    Boolean(live), live || 'no LIVE marker found');
  rec.check('SURFACES: the lab carries the note that exploring a lens never publishes',
    (await P.count(page, 'cs-surface-lab-publish-note')) > 0);

  /* The gated lenses. Pressing one must produce a stated refusal, not a blank
     panel — a 403 the operator cannot see is the same defect as a failed save
     the operator cannot see. */
  const gatedTab = page.locator('[data-testid^="cs-lens-tab-"]').nth(1);
  if (await gatedTab.count()) {
    const label = ((await gatedTab.textContent()) || '').replace(/\s+/g, ' ').trim();
    await gatedTab.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const afterErr = await P.text(page, 'cs-surface-lab-error');
    const afterBands = await P.countPrefix(page, 'cs-lens-band-');
    rec.check('SURFACES: selecting a GATED lens states the refusal instead of blanking',
      Boolean(afterErr) || afterBands > 0,
      afterErr ? `"${label}" -> ${afterErr.slice(0, 180)}`
        : `"${label}" -> ${afterBands} bands and no error text`);
    if (afterErr) {
      rec.note('gate', `the second lens ("${label}") is refused in production because `
        + `CASE_STUDY_SURFACE_LAB_USER_IDS is unset: ${afterErr.slice(0, 220)}`);
    }

    /* PUT THE LENS BACK. `desk.lensSurface` is ONE piece of state shared by this
       tab and PREVIEW, so leaving a gated lens selected here makes the PREVIEW
       tab preview that gated surface and fail with a 403. The 2026-08-27 run
       discovered exactly that, and the harness must leave the surface as it
       found it for the same reason it detaches every repository it attaches.
       The coupling itself is a finding and is checked on the PREVIEW tab; it is
       not something to silently absorb here. */
    await page.locator('[data-testid^="cs-lens-tab-"]').first().click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const restored = await P.text(page, 'cs-surface-lab-error');
    rec.check('SURFACES: selecting the default lens again clears the refusal',
      !restored, restored ? `still refusing: ${restored.slice(0, 160)}` : 'back to the default lens');
  }

  if (err) rec.note('gate', `the surface lab reported: ${err.slice(0, 300)}`);
  if (lensTabs === 4) {
    const order = await P.text(page, 'cs-surface-lab-order-heading');
    rec.note('observation', `band order heading: ${order || 'not rendered'}`);
  }
}

/* ---------------------------------------------------------------- PREVIEW --- */

/**
 * FIX 3 — the PREVIEW tab pushed the document to 7745px inside a 1440 viewport
 * because the raw-snapshot `<pre>` WIDENED its `.col-lg-6` instead of scrolling
 * inside it. `overflow: auto` was already set and did not prevent it: a box has
 * to be stopped from widening before it can be asked to scroll.
 *
 * The measurement is taken twice — before the preview is requested and after the
 * projection has rendered — because the number only means something as a delta.
 * A tab that is 1440 wide while empty proves nothing about the tab that has
 * content in it.
 */
async function preview(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'preview', 'PREVIEW'))) return;
  void api; void opts;

  const before = await P.overflow(page);
  rec.note('measurement', `PREVIEW before previewing: scrollWidth=${before.scrollWidth}, `
    + `clientWidth=${before.clientWidth}`);

  rec.check('PREVIEW: the panel states it has not previewed yet, rather than showing a blank frame',
    (await P.count(page, 'cs-preview-idle')) > 0);

  /* WHICH SURFACE IS THIS TAB ABOUT TO PREVIEW? The button says so, and it is
     worth reading, because the answer is not this tab's own business: the
     surface comes from `desk.lensSurface`, which the SURFACES tab writes. The
     button label is the only place on this tab that reveals the coupling. */
  const buttonLabel = await P.text(page, 'cs-preview');
  rec.note('observation', `the preview button offers: "${buttonLabel}" — the surface is inherited `
    + 'from the SURFACES tab, not chosen here');
  rec.check('PREVIEW: the tab names which surface it is about to render',
    Boolean(buttonLabel && /surface/i.test(buttonLabel)),
    buttonLabel || 'the button does not name a surface');

  const clicked = await P.click(page, 'cs-preview', 6000);
  await page.waitForTimeout(4000);
  const err = await P.text(page, 'cs-preview-error');
  const projection = (await P.count(page, 'cs-preview-projection-heading')) > 0;
  const raw = (await P.count(page, 'cs-preview-raw-heading')) > 0;
  const noProjection = (await P.count(page, 'cs-preview-no-projection')) > 0;
  rec.check('PREVIEW: previewing renders the projection beside the raw snapshot',
    clicked.ok && projection && raw && !err,
    err || (clicked.ok ? `projection=${projection}, raw=${raw}, none=${noProjection}` : clicked.why));

  const after = await P.overflow(page);
  // A few pixels of slack absorbs sub-pixel layout rounding; it is nowhere near
  // wide enough to hide the 6,305px overrun this check exists to catch.
  const fits = after.scrollWidth > 0 && after.scrollWidth <= after.clientWidth + 4;
  rec.check('PREVIEW: rendering the projection does not push the page wider than the viewport',
    fits,
    `scrollWidth=${after.scrollWidth} against clientWidth=${after.clientWidth}`
    + (fits ? '' : ` — the page overflows by ${after.scrollWidth - after.clientWidth}px`));
  rec.note('measurement', `PREVIEW after previewing: scrollWidth=${after.scrollWidth}, `
    + `clientWidth=${after.clientWidth} (2026-08-26 measured 7745 against 1440 here)`);

  const delta = await P.text(page, 'cs-preview-delta');
  rec.check('PREVIEW: the panel names what the projection withheld',
    Boolean(delta), delta ? delta.slice(0, 220) : 'no delta narrative rendered');
  const projJson = await P.text(page, 'cs-preview-projection-json');
  rec.check('PREVIEW: the projection is shown as data a reviewer can read',
    Boolean(projJson) && projJson.length > 40, `${(projJson || '').length} characters`);
}

/* ---------------------------------------------------------------- PUBLISH --- */

async function publish(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'publish', 'PUBLISH'))) return;
  void api; void opts;

  const advisory = (await P.count(page, 'cs-readiness-advisory')) > 0;
  rec.check('PUBLISH: readiness declares itself advisory rather than gating', advisory);
  const recheck = await P.click(page, 'cs-readiness-recheck', 4000);
  const gaps = await P.countPrefix(page, 'cs-readiness-gap-');
  const noGaps = (await P.count(page, 'cs-readiness-none')) > 0;
  rec.check('PUBLISH: readiness names its gaps or states it has none',
    recheck.ok && (gaps > 0 || noGaps), recheck.ok ? `${gaps} gaps, none=${noGaps}` : recheck.why);
  if (gaps > 0) {
    rec.note('observation', `readiness gaps: ${(await P.textsPrefix(page, 'cs-readiness-gap-', 6)).map((t) => t.slice(0, 90)).join(' | ')}`);
  }

  const state = await P.text(page, 'cs-publication-state');
  rec.check('PUBLISH: the enterprise publication state renders', Boolean(state), state || 'not rendered');

  const blockers = await P.countPrefix(page, 'cs-publish-blocker-');
  const band = (await P.count(page, 'cs-gate-band')) > 0;
  const bandCount = await P.text(page, 'cs-gate-band-count');
  rec.check('PUBLISH: the gate band renders above the tabs on this tab too', band,
    bandCount || 'no count rendered');
  rec.note('observation', `the gate currently reports ${blockers} blocker(s) on the publish panel`);

  /* FIX 2 once more: the publish panel used to OWN the note and the error. They
     were moved above the tab strip, and the point of moving them is that they
     must not have been duplicated on the way — two elements with one test id is
     the defect this same run fixed elsewhere. */
  for (const id of ['cs-action-note', 'cs-action-error']) {
    const n = await P.count(page, id);
    rec.check(`PUBLISH: data-testid="${id}" is not duplicated now the band renders on every tab`,
      n <= 1, `${n} element(s) carry it`);
  }

  for (const id of ['cs-approve', 'cs-publish', 'cs-unpublish', 'cs-archive']) {
    rec.check(`PUBLISH: the ${id.replace('cs-', '')} control is present`,
      (await P.count(page, id)) > 0);
  }
  rec.skip('PUBLISH: approve / publish / unpublish / archive the live record',
    'the pilot is live on the enterprise surface; these are exercised on a throwaway record');
}

module.exports = { surfaces, preview, publish };
