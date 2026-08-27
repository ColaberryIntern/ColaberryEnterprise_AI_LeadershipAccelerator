/**
 * storyStudioTabExercises.js — one function per Story Studio tab, each of which
 * USES the tab's controls rather than photographing them.
 *
 * THE DISTINCTION THIS FILE IS BUILT AROUND: a panel that says "nothing here
 * yet" in words is WORKING; a panel that renders a blank frame is not. So every
 * empty surface is asserted as a NAMED empty state (`cs-*-empty`, `cs-*-idle`,
 * `cs-*-none`), never as "the panel did not throw".
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

/* ------------------------------------------------------------------ TRUTH --- */

async function truth(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'truth', 'TRUTH'))) return;

  rec.check('TRUTH: the storyline panel states it is editorial direction, not a fact',
    (await P.count(page, 'cs-storyline-disclaimer')) === 1);

  const beforeEmpty = (await P.count(page, 'cs-storyline-empty')) > 0;
  const beforeMeta = await P.text(page, 'cs-storyline-meta');
  rec.check('TRUTH: the storyline panel declares its state in words',
    beforeEmpty || Boolean(beforeMeta),
    beforeEmpty ? 'named empty state' : `already written: ${String(beforeMeta).slice(0, 80)}`);

  const probe = `Story Studio production walkthrough ${opts.stamp}. Editorial direction only; `
    + 'this record teaches non-technical people to architect AI systems.';
  const filled = await P.fill(page, 'cs-storyline-input', probe);
  if (!filled.ok) {
    rec.check('TRUTH: storyline is editable', false, filled.why);
  } else {
    rec.check('TRUTH: storyline is editable', true);
    const saved = await P.click(page, 'cs-storyline', 3000);
    const err = await P.text(page, 'cs-storyline-error');
    rec.check('TRUTH: saving the storyline reports no error', saved.ok && !err,
      saved.ok ? (err || 'no error surface rendered') : saved.why);
    const meta = await P.text(page, 'cs-storyline-meta');
    rec.check('TRUTH: the saved storyline is attributed on screen', Boolean(meta),
      meta || 'no "Last written by" line appeared after the save');
    const server = await api(`/storyline`);
    const round = server.body && server.body.storyline
      && String(server.body.storyline.text || '').includes(opts.stamp);
    rec.check('TRUTH: the storyline round-trips through the server, not just the DOM',
      Boolean(round),
      server.body && server.body.storyline
        ? `authoredBy=${server.body.storyline.authoredBy}` : `GET /storyline -> ${server.status}`);
  }

  /* consent — re-saved with the values already on the record, so the control is
     exercised without changing what anybody consented to. */
  const consentBefore = {
    orgMode: await page.locator('[data-testid="cs-org-mode"]').first().inputValue().catch(() => null),
    orgName: await page.locator('[data-testid="cs-org-name"]').first().inputValue().catch(() => null),
    visibility: await page.locator('[data-testid="cs-visibility"]').first().inputValue().catch(() => null),
    builderMode: await page.locator('[data-testid="cs-builder-mode"]').first().inputValue().catch(() => null),
    orgConsent: await page.locator('[data-testid="cs-org-consent"]').first().isChecked().catch(() => null),
    builderConsent: await page.locator('[data-testid="cs-builder-consent"]').first().isChecked().catch(() => null),
  };
  rec.check('TRUTH: consent and privacy fields render with the record\'s values',
    Boolean(consentBefore.orgMode && consentBefore.visibility && consentBefore.builderMode),
    JSON.stringify(consentBefore));

  const consentSaved = await P.click(page, 'cs-consent-save', 3000);
  const consentErrOnTab = (await P.count(page, 'cs-action-error')) > 0;
  const consentNoteOnTab = (await P.count(page, 'cs-action-note')) > 0;
  rec.check('TRUTH: the consent save control is present and clickable', consentSaved.ok, consentSaved.why || '');
  rec.check('TRUTH: saving consent tells the operator on THIS tab what happened',
    consentNoteOnTab || consentErrOnTab,
    'neither cs-action-note nor cs-action-error is rendered on the TRUTH tab — '
    + 'both live inside CaseStudyPublishPanel, which only renders on PUBLISH');

  const after = await api('');
  const cs = after.body && after.body.caseStudy;
  rec.check('TRUTH: the consent re-save left the record\'s consent unchanged',
    Boolean(cs) && cs.organizationIdentityMode === consentBefore.orgMode
      && cs.visibility === consentBefore.visibility
      && cs.builderIdentityMode === consentBefore.builderMode,
    cs ? `${cs.organizationIdentityMode}/${cs.visibility}/${cs.builderIdentityMode}` : `GET -> ${after.status}`);

  /* contributors */
  const contribEmpty = (await P.count(page, 'cs-contributors-empty')) > 0;
  const contribRows = await P.countPrefix(page, 'cs-contributor-');
  rec.check('TRUTH: contributors render rows or a named empty state',
    contribEmpty || contribRows > 0, `${contribRows} contributor elements, empty=${contribEmpty}`);

  /* provenance */
  const provSelect = (await P.count(page, 'cs-provenance-version')) > 0;
  rec.check('TRUTH: the provenance version selector renders', provSelect);
  const provRows = await P.countPrefix(page, 'cs-provenance-');
  const provEmpty = (await P.count(page, 'cs-provenance-empty')) > 0;
  rec.check('TRUTH: provenance answers with rows or a named empty state',
    provRows > 1 || provEmpty, `${provRows} provenance elements, empty=${provEmpty}`);
  if (provSelect) {
    const options = await page.locator('[data-testid="cs-provenance-version"] option').count().catch(() => 0);
    rec.note('observation', `the provenance selector offers ${options} snapshot version(s)`);
    if (options > 1) {
      const value = await page.locator('[data-testid="cs-provenance-version"] option')
        .nth(1).getAttribute('value').catch(() => null);
      if (value) {
        await page.selectOption('[data-testid="cs-provenance-version"]', value).catch(() => {});
        await page.waitForTimeout(2500);
        const err = await P.text(page, 'cs-provenance-error');
        const rowsAfter = await P.countPrefix(page, 'cs-provenance-');
        rec.check('TRUTH: switching provenance version re-reads without erroring',
          !err && rowsAfter > 1, err || `${rowsAfter} elements after the switch`);
      }
    }
  }
}

/* ---------------------------------------------------------------- SOURCES --- */

async function sources(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'sources', 'SOURCES'))) return;

  const repoRows = await P.countPrefix(page, 'cs-repository-');
  const repoEmpty = (await P.count(page, 'cs-repositories-empty')) > 0;
  rec.check('SOURCES: repositories render rows or a named empty state',
    repoRows > 0 || repoEmpty, `${repoRows} repository rows`);
  rec.check('SOURCES: the attach form renders (reference + role + button)',
    (await P.count(page, 'cs-repo-reference')) > 0
    && (await P.count(page, 'cs-attach-role')) > 0
    && (await P.count(page, 'cs-attach-repository')) > 0);

  /* attach then detach — a full round trip that must leave the record as found. */
  const before = await api('');
  const beforeIds = ((before.body && before.body.repositories) || []).map((r) => r.id);
  await P.fill(page, 'cs-repo-reference', opts.throwawayRepo);
  await page.selectOption('[data-testid="cs-attach-role"]', 'supporting').catch(() => {});
  const attached = await P.click(page, 'cs-attach-repository', 4000);
  const afterAttach = await api('');
  const afterIds = ((afterAttach.body && afterAttach.body.repositories) || []).map((r) => r.id);
  const newIds = afterIds.filter((x) => !beforeIds.includes(x));
  rec.check('SOURCES: attaching a repository actually attaches it',
    attached.ok && newIds.length === 1,
    attached.ok ? `${beforeIds.length} -> ${afterIds.length} repositories` : attached.why);

  if (newIds.length === 1) {
    const row = page.locator(`[data-testid="cs-repository-${newIds[0]}"]`).first();
    const present = (await row.count()) > 0;
    rec.check('SOURCES: the newly attached repository appears in the table', present);
    if (present) {
      const detach = row.locator('button', { hasText: 'Detach' }).first();
      await detach.click({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3500);
    }
    const restored = await api('');
    const finalIds = ((restored.body && restored.body.repositories) || []).map((r) => r.id);
    rec.check('SOURCES: detaching restores the record to exactly the repositories it had',
      finalIds.length === beforeIds.length && finalIds.every((x) => beforeIds.includes(x)),
      `${finalIds.length} repositories after detach (started at ${beforeIds.length})`);
  } else {
    rec.skip('SOURCES: detach a repository', 'the attach did not add a row, so there is nothing to detach');
  }

  /* the analyzer */
  const analyzeIdle = (await P.count(page, 'cs-analyze-idle')) > 0;
  rec.check('SOURCES: the analyzer states its idle condition in words', analyzeIdle);
  const collisions = await P.count(page, 'cs-analyze-repo');
  rec.check('SOURCES: the analyzer\'s controls carry distinct test ids', collisions === 1,
    `${collisions} elements share data-testid="cs-analyze-repo" `
    + '(the Repository INPUT and the Analyze BUTTON both claim it)');

  await P.fill(page, 'cs-analyze-owner', opts.analyzeOwner);
  // The input and the button collide on `cs-analyze-repo`; `.first()` is the
  // input, so the button is reached by its accessible name instead. That the
  // walkthrough has to do this IS the finding recorded above.
  await page.locator('#cs-analyze-repo').fill(opts.analyzeRepo).catch(() => {});
  const analyzeBtn = page.getByRole('button', { name: /^Analyze$/ }).first();
  const canAnalyze = (await analyzeBtn.count()) > 0;
  if (canAnalyze) {
    await analyzeBtn.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(12000);
    const err = await P.text(page, 'cs-analyze-error');
    const proofs = await P.countPrefix(page, 'cs-proof-');
    rec.check('SOURCES: the analyzer returns a proof for a real repository',
      !err && proofs > 0, err || `${proofs} proof elements rendered`);
    if (proofs > 0) {
      rec.note('observation', `analyzer access status: ${await P.text(page, 'cs-proof-access')}`);
      const proves = await P.text(page, 'cs-proof-proves-heading');
      const cannot = await P.text(page, 'cs-proof-cannot-heading');
      rec.check('SOURCES: the analyzer reports BOTH what the repo proves and what it cannot',
        Boolean(proves) && Boolean(cannot), `${proves} / ${cannot}`);
    }
  } else {
    rec.skip('SOURCES: run the analyzer', 'no Analyze button could be located by role');
  }

  /* evidence */
  const evidenceRows = await P.countPrefix(page, 'cs-evidence-');
  const evidenceEmpty = (await P.count(page, 'cs-evidence-empty')) > 0;
  rec.check('SOURCES: the evidence panel renders rows or a named empty state',
    evidenceRows > 0 || evidenceEmpty, `${evidenceRows} evidence elements`);

  /* sync */
  const syncBefore = await P.text(page, 'cs-last-sync');
  const synced = await P.click(page, 'cs-sync', 12000);
  await page.waitForTimeout(6000);
  const syncAfter = await P.text(page, 'cs-last-sync');
  rec.check('SOURCES: a manual sync reports an outcome on this tab',
    synced.ok && Boolean(syncAfter), synced.ok ? `${syncBefore} -> ${syncAfter}` : synced.why);

  /* sync history */
  const history = await P.click(page, 'cs-sync-history', 3500);
  const runs = await P.countPrefix(page, 'cs-sync-run-');
  const runsEmpty = (await P.count(page, 'cs-sync-runs-empty')) > 0;
  const runsErr = await P.text(page, 'cs-sync-runs-error');
  rec.check('SOURCES: sync history lists runs or states it is empty',
    history.ok && (runs > 0 || runsEmpty) && !runsErr,
    runsErr || `${runs} runs listed, empty=${runsEmpty}`);

  /* published-vs-draft diff */
  const diffCtl = page.locator('[data-testid="cs-published-draft-diff"]').first();
  if ((await diffCtl.count()) === 0) {
    rec.check('SOURCES: the published-vs-draft diff control exists', false,
      'no element carries data-testid="cs-published-draft-diff"');
  } else if (await diffCtl.isDisabled().catch(() => false)) {
    rec.check('SOURCES: the diff control is correctly inert with nothing published', true,
      'disabled because there is no published snapshot to diff against');
  } else {
    await P.click(page, 'cs-published-draft-diff', 4000);
    const diffErr = await P.text(page, 'cs-diff-error');
    const table = (await P.count(page, 'cs-diff-table')) > 0;
    const rows = await P.countPrefix(page, 'cs-diff-');
    rec.check('SOURCES: the diff renders a table comparing published against draft',
      table && !diffErr, diffErr || `${rows} diff elements`);
  }
}

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

  const metricsInTable = await api('/charts');
  void metricsInTable;
  if (keyBoxes > 0) {
    const keys = await page.locator('[data-testid^="cs-chart-key-"]').evaluateAll(
      (els) => els.map((e) => (e.getAttribute('data-testid') || '').replace('cs-chart-key-', '')),
    ).catch(() => []);
    rec.note('observation', `chart builder offers keys: ${keys.join(', ') || '(none readable)'}`);
    await P.fill(page, 'cs-chart-title', `Walkthrough probe ${opts.stamp}`);
    await page.locator('[data-testid^="cs-chart-key-"]').first().check().catch(() => {});
    const saved = await P.click(page, 'cs-chart-save', 4000);
    const err = await P.text(page, 'cs-visuals-error');
    const chartsEmpty = (await P.count(page, 'cs-charts-empty')) > 0;
    const chartRows = await page.locator('[data-testid^="cs-chart-"][data-testid$=""]').count().catch(() => 0);
    void chartRows;
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
        rec.note('defect', 'the chart builder offered metric keys read from the SNAPSHOT, but the '
          + 'resolver reads case_study_metrics — so the saved chart resolves to nothing. '
          + `Unresolved reasons: ${(unresolved || 'none rendered').slice(0, 220)}`);
      }
    }
  } else {
    rec.note('observation', 'the chart builder correctly refused to offer keys this record has no '
      + 'verified metrics for');
  }

  const artifactOverride = await P.countPrefix(page, 'cs-artifact-');
  rec.note('observation', `${artifactOverride} artifact-related elements across both visuals panels`);
  rec.skip('VISUALS: the architecture diagram',
    'the mermaid diagram is rendered by the PUBLIC story page (StoryDiagram.tsx), not by any '
    + 'admin VISUALS control; it is checked separately against /stories/:slug');
}

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
    Boolean(live), live || 'no ↑ LIVE marker found');
  rec.check('SURFACES: the lab carries the note that exploring a lens never publishes',
    (await P.count(page, 'cs-surface-lab-publish-note')) > 0);

  if (err) {
    rec.note('gate', `the surface lab reported: ${err.slice(0, 300)}`);
  }
  if (lensTabs === 4) {
    const order = await P.text(page, 'cs-surface-lab-order-heading');
    rec.note('observation', `band order heading: ${order || 'not rendered'}`);
  }
}

/* ---------------------------------------------------------------- PREVIEW --- */

async function preview(page, rec, api, opts) {
  if (!(await openTab(page, rec, 'preview', 'PREVIEW'))) return;
  void api; void opts;

  rec.check('PREVIEW: the panel states it has not previewed yet, rather than showing a blank frame',
    (await P.count(page, 'cs-preview-idle')) > 0);
  const clicked = await P.click(page, 'cs-preview', 6000);
  await page.waitForTimeout(4000);
  const err = await P.text(page, 'cs-preview-error');
  const projection = (await P.count(page, 'cs-preview-projection-heading')) > 0;
  const raw = (await P.count(page, 'cs-preview-raw-heading')) > 0;
  const noProjection = (await P.count(page, 'cs-preview-no-projection')) > 0;
  rec.check('PREVIEW: previewing renders the projection beside the raw snapshot',
    clicked.ok && projection && raw && !err,
    err || (clicked.ok ? `projection=${projection}, raw=${raw}, none=${noProjection}` : clicked.why));
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

  for (const id of ['cs-approve', 'cs-publish', 'cs-unpublish', 'cs-archive']) {
    rec.check(`PUBLISH: the ${id.replace('cs-', '')} control is present`,
      (await P.count(page, id)) > 0);
  }
  rec.skip('PUBLISH: approve / publish / unpublish / archive the live record',
    'the pilot is live on the enterprise surface; these are exercised on a throwaway record');
}

module.exports = { openTab, truth, sources, story, visuals, surfaces, preview, publish };
