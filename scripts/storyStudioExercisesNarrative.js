/**
 * storyStudioExercisesNarrative.js — STORY and VISUALS: the two tabs that turn
 * gathered facts into something a reader sees.
 *
 * Split out of `storyStudioTabExercises.js` on 2026-08-27; see that file's
 * header for the whole map.
 *
 * THE OPEN ITEM THIS FILE DELIBERATELY DOES NOT PAPER OVER. The chart builder
 * offers metric keys read from the SNAPSHOT while `resolveChart` resolves
 * against the `case_study_metrics` table, which has no rows for this record. So
 * every key it offers resolves to nothing and the panel honestly says
 * "Renders: nothing". Closing that needs a metric-listing endpoint the admin API
 * does not have — a new contract, not a bug fix — so it is recorded as a finding
 * on every run rather than worked around.
 */
const P = require('./storyStudioProbe');
const { openTab } = require('./storyStudioTabExercises');

/* ------------------------------------------------------------------ STORY --- */

async function story(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'story', 'STORY'))) return;

  rec.check('STORY: the draft panel discloses which engine wrote the draft',
    (await P.count(page, 'cs-draft-engine')) > 0 || (await P.count(page, 'cs-draft-disclaimer')) > 0);
  const draftEmpty = (await P.count(page, 'cs-draft-empty')) > 0;
  const noSource = (await P.count(page, 'cs-draft-no-source')) > 0;
  rec.check('STORY: the draft panel declares its state in words',
    draftEmpty || noSource || (await P.countPrefix(page, 'cs-draft-')) > 0,
    `empty=${draftEmpty}, no-source=${noSource}`);

  const generated = await P.click(page, 'cs-generate-draft', 4000);
  if (!generated.ok) {
    rec.check('STORY: a draft can be generated', false, generated.why);
  } else {
    await page.waitForTimeout(15000);
    const err = await P.text(page, 'cs-draft-error');
    const refused = await P.text(page, 'cs-draft-refused');
    const drafts = await page.locator('[data-testid^="cs-draft-"]').count();
    rec.check('STORY: generating a draft either produces drafts or names its refusals',
      !err && (drafts > 0 || Boolean(refused)),
      err || (refused ? `refused: ${refused.slice(0, 200)}` : `${drafts} draft elements`));
    const engine = await P.text(page, 'cs-draft-engine');
    rec.check('STORY: the generator names itself rather than implying an LLM',
      Boolean(engine), engine ? engine.slice(0, 180) : 'no engine attribution rendered');
    rec.note('observation', `draft generation left ${drafts} draft element(s) on screen`);

    /* Reject what was generated so the live record is left as it was found.
       Promotion is deliberately NOT exercised here: it mints a new snapshot
       version and would move a published record into draft-ahead. */
    const rejects = await page.locator('[data-testid^="cs-reject-draft"]').count();
    for (let i = 0; i < rejects; i += 1) {
      await page.locator('[data-testid^="cs-reject-draft"]').first().click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    const left = await api('/story-drafts');
    const remaining = left.body && Array.isArray(left.body.drafts)
      ? left.body.drafts.filter((d) => d.status === 'pending' || d.status === 'candidate').length : -1;
    rec.check('STORY: generated drafts can be rejected, leaving no pending drafts behind',
      remaining === 0, `${remaining} pending drafts remain (rejected ${rejects})`);
  }

  const noSnapshot = (await P.count(page, 'cs-narrative-no-snapshot')) > 0;
  const overrideCtl = await P.count(page, 'cs-narrative-override');
  rec.check('STORY: the narrative panel offers an override or explains why it cannot',
    overrideCtl > 0 || noSnapshot, `override controls=${overrideCtl}, no-snapshot=${noSnapshot}`);

  /* FIX 4, the positive half. This record HAS a snapshot, so the override must
     be live here. The negative half — a record with no snapshot must not offer
     an enabled override — can only be seen on a fresh record, so it is checked
     on the throwaway. */
  if (!noSnapshot && overrideCtl > 0) {
    const disabled = await page.locator('[data-testid="cs-narrative-override"]')
      .first().isDisabled().catch(() => null);
    rec.check('STORY: with a snapshot present the override control is live, not inert',
      disabled === false, `override button disabled=${disabled}`);
  }
  rec.skip('STORY: apply a narrative override on the pilot record',
    'an override mints a new snapshot version and would move this published record into '
    + 'draft-ahead; exercised on the throwaway record instead');

  const metricRows = await P.countPrefix(page, 'cs-metric-');
  const metricsEmpty = (await P.count(page, 'cs-metrics-empty')) > 0;
  rec.check('STORY: metrics render rows or a named empty state',
    metricRows > 0 || metricsEmpty, `${metricRows} metric elements`);

  const quotesEmpty = (await P.count(page, 'cs-quotes-empty')) > 0;
  const quoteForm = (await P.count(page, 'cs-quote-text')) > 0;
  rec.check('STORY: the quotes panel renders its form and a named empty state',
    quoteForm && (quotesEmpty || (await P.countPrefix(page, 'cs-quote-')) > 0),
    `form=${quoteForm}, empty=${quotesEmpty}`);
  rec.check('STORY: the quotes panel states its consent condition',
    (await P.count(page, 'cs-quote-disclaimer')) > 0 || (await P.count(page, 'cs-quote-consent')) > 0);
  const slots = await P.text(page, 'cs-quote-slots');
  rec.note('observation', `suggested quote slots: ${slots || 'none rendered (the page passes an empty list)'}`);
  void opts;
}

/* ---------------------------------------------------------------- VISUALS --- */

async function visuals(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'visuals', 'VISUALS'))) return;

  const artifactsEmpty = (await P.count(page, 'cs-artifacts-empty')) > 0;
  const artifactRows = await P.countPrefix(page, 'cs-artifact-row-');
  rec.check('VISUALS: artifacts render rows or a named empty state',
    artifactsEmpty || artifactRows > 0, `${artifactRows} artifact rows, empty-state=${artifactsEmpty}`);
  if (artifactRows === 0) {
    rec.note('empty-state', 'no artifact rows exist, so hero selection, the promote control and '
      + 'the derived evidence/atmosphere column could not be exercised on this record');
  }

  rec.check('VISUALS: the chart panel states that a chart carries no numbers',
    (await P.count(page, 'cs-chart-disclaimer')) > 0);

  const noMetrics = (await P.count(page, 'cs-chart-no-metrics')) > 0;
  const keyBoxes = await P.countPrefix(page, 'cs-chart-key-');
  rec.check('VISUALS: the chart builder either offers metric keys or says there are none',
    noMetrics || keyBoxes > 0, `no-metrics=${noMetrics}, ${keyBoxes} metric checkboxes offered`);

  if (keyBoxes > 0) {
    const keys = await page.locator('[data-testid^="cs-chart-key-"]').evaluateAll(
      (els) => els.map((e) => (e.getAttribute('data-testid') || '').replace('cs-chart-key-', '')),
    ).catch(() => []);
    rec.note('observation', `chart builder offers keys: ${keys.join(', ') || '(none readable)'}`);

    /* FIX 6 from the previous run: `heroMetrics ++ measurement.metrics` shared a
       key, so two checkboxes rendered with one id and the second label toggled
       the first input. A duplicate is invisible unless the ids are counted. */
    const unique = Array.from(new Set(keys));
    rec.check('VISUALS: every offered metric key is offered exactly once',
      unique.length === keys.length,
      `${keys.length} checkboxes, ${unique.length} distinct keys`);

    await P.fill(page, 'cs-chart-title', `Walkthrough probe ${opts.stamp}`);
    await page.locator('[data-testid^="cs-chart-key-"]').first().check().catch(() => {});
    const saved = await P.click(page, 'cs-chart-save', 4000);
    const err = await P.text(page, 'cs-visuals-error');
    const chartsEmpty = (await P.count(page, 'cs-charts-empty')) > 0;
    rec.check('VISUALS: saving a chart succeeds without an error', saved.ok && !err,
      err || (saved.ok ? '' : saved.why));
    const after = await api('/charts');
    const list = (after.body && after.body.charts) || [];
    rec.check('VISUALS: the saved chart is persisted', list.length > 0,
      `${list.length} charts on the record, charts-empty-state=${chartsEmpty}`);
    if (list.length > 0) {
      const id = list[list.length - 1].chart ? list[list.length - 1].chart.id : list[list.length - 1].id;
      const resolvedText = id ? await P.text(page, `cs-chart-resolved-${id}`) : null;
      const unresolved = id ? await P.text(page, `cs-chart-unresolved-${id}`) : null;
      rec.check('VISUALS: the chart says what it would actually render',
        Boolean(resolvedText), resolvedText ? resolvedText.slice(0, 200) : 'no "Renders:" line found');
      if (resolvedText && /nothing/i.test(resolvedText)) {
        rec.note('known-gap', 'the chart builder offered metric keys read from the SNAPSHOT, but the '
          + 'resolver reads case_study_metrics — so the saved chart resolves to nothing. This is a '
          + 'missing metric-listing endpoint, not a bug in this tab, and is recorded rather than '
          + `worked around. Unresolved reasons: ${(unresolved || 'none rendered').slice(0, 220)}`);
      }
    }
  } else {
    rec.note('observation', 'the chart builder correctly refused to offer keys this record has no '
      + 'verified metrics for');
  }

  rec.skip('VISUALS: the architecture diagram',
    'the mermaid diagram is rendered by the PUBLIC story page (StoryDiagram.tsx), not by any '
    + 'admin VISUALS control; it is checked separately against /stories/:slug');
}

module.exports = { story, visuals };
