/**
 * storyStudioExercisesEvidence.js — TRUTH and SOURCES: the two tabs that answer
 * "where did this come from?".
 *
 * Split out of `storyStudioTabExercises.js` on 2026-08-27 because that file had
 * reached 497 of CLAUDE.md's 500-line ceiling and the rule is that the next
 * change splits before it adds. See that file's header for the whole map.
 *
 * THREE OF THE FIVE FIXES SHIPPED ON 2026-08-27 ARE RE-CHECKED HERE, and each is
 * checked by measurement rather than by looking for the fix's own code:
 *   - provenance rows are read out of the rendered table and the ones still
 *     reading `unknown` are COUNTED, because 14 was the number that made the
 *     defect undeniable and only a number can retire it;
 *   - the action band is proved on the SUCCESS path and then on the FAILURE
 *     path, the second by forcing a 500 at the browser, because it was the
 *     failure branch that was invisible;
 *   - `cs-analyze-repo` is required to resolve to exactly one element.
 */
const P = require('./storyStudioProbe');
const { openTab } = require('./storyStudioTabExercises');

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
    const server = await api('/storyline');
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

  const consentSaved = await P.click(page, 'cs-consent-save', 3500);
  rec.check('TRUTH: the consent save control is present and clickable', consentSaved.ok, consentSaved.why || '');

  /* FIX 2, the success half. Before 2026-08-27 both the note and the error
     rendered only inside CaseStudyPublishPanel, so this was the check that went
     red: a save on TRUTH produced no visible response of any kind. */
  const bandOnTruth = (await P.count(page, 'cs-action-band')) > 0;
  const noteOnTruth = await P.text(page, 'cs-action-note');
  const errOnTruth = await P.text(page, 'cs-action-error');
  rec.check('TRUTH: saving consent tells the operator on THIS tab what happened',
    bandOnTruth && Boolean(noteOnTruth || errOnTruth),
    bandOnTruth ? `band says: ${(noteOnTruth || errOnTruth || '').slice(0, 140)}`
      : 'no cs-action-band rendered on the TRUTH tab after a write');

  const after = await api('');
  const cs = after.body && after.body.caseStudy;
  rec.check('TRUTH: the consent re-save left the record\'s consent unchanged',
    Boolean(cs) && cs.organizationIdentityMode === consentBefore.orgMode
      && cs.visibility === consentBefore.visibility
      && cs.builderIdentityMode === consentBefore.builderMode,
    cs ? `${cs.organizationIdentityMode}/${cs.visibility}/${cs.builderIdentityMode}` : `GET -> ${after.status}`);

  await failedConsentSaveIsVisible(page, rec, opts);
  await provenance(page, rec);
  await contributors(page, rec);
}

/**
 * FIX 2, the failure half — the branch that was actually invisible.
 *
 * A successful save proves the note renders; it says nothing about the error,
 * and the error is what an operator most needs to see. The failure is
 * manufactured by answering the consent PATCH with a 500 AT THE BROWSER, so no
 * request reaches production and the pilot's consent cannot be altered by this
 * check even in principle. Only the PATCH is intercepted — the GET that
 * reloads the record afterwards is let through.
 */
async function failedConsentSaveIsVisible(page, rec, opts) {
  const pattern = `**/api/admin/case-studies/${opts.recordId}`;
  let clicked = { ok: false, why: 'not attempted' };
  await P.withForcedFailure(page, pattern, async () => {
    clicked = await P.click(page, 'cs-consent-save', 3500);
  }, 'PATCH');

  const band = (await P.count(page, 'cs-action-band')) > 0;
  const err = await P.text(page, 'cs-action-error');
  rec.check('TRUTH: a consent save that FAILS is reported on screen, not swallowed',
    clicked.ok && band && Boolean(err),
    band ? `error banner: ${(err || '(band rendered but no error text)').slice(0, 160)}`
      : 'the save failed and the operator was shown nothing at all');
  rec.note('method', 'the failure above was forced by fulfilling the consent PATCH with a 500 in '
    + 'the browser; the request never left the page, so production consent was not touched.');

  // Leave the tab in its true state rather than under a manufactured error.
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  await P.click(page, 'cs-studio-tab-truth', 1800);
}

/**
 * FIX 1 — provenance. The panel whose entire job is "where did each value come
 * from?" rendered fourteen rows reading `unknown` on 2026-08-26 over a payload
 * that named every source, because the reader expected `source`/`sourceRef`
 * while the server sends `{tier, origin, recordedAt}`.
 */
async function provenance(page, rec) {
  const provSelect = (await P.count(page, 'cs-provenance-version')) > 0;
  rec.check('TRUTH: the provenance version selector renders', provSelect);

  const rows = await P.provenanceRows(page);
  const empty = (await P.count(page, 'cs-provenance-empty')) > 0;
  rec.check('TRUTH: provenance answers with rows or a named empty state',
    rows.length > 0 || empty, `${rows.length} provenance rows, empty=${empty}`);

  if (rows.length > 0) {
    const unknown = rows.filter((r) => /^unknown$/i.test(r.source));
    rec.check('TRUTH: no provenance row reads "unknown"',
      unknown.length === 0,
      `${unknown.length} of ${rows.length} rows read "unknown"`
      + (unknown.length ? ` — ${unknown.map((r) => r.field).slice(0, 8).join(', ')}` : ''));
    const sources = Array.from(new Set(rows.map((r) => r.source)));
    rec.note('measurement', `provenance: ${rows.length} rows, ${unknown.length} unknown, `
      + `sources named: ${sources.join(', ')}`);
    const described = rows.filter((r) => r.detail && r.detail !== '—');
    rec.check('TRUTH: provenance rows carry a detail that makes the claim checkable',
      described.length > 0, `${described.length} of ${rows.length} rows carry a detail`);
  }

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
        const after = await P.provenanceRows(page);
        const unknownAfter = after.filter((r) => /^unknown$/i.test(r.source)).length;
        rec.check('TRUTH: switching provenance version re-reads without erroring',
          !err && after.length > 0, err || `${after.length} rows after the switch`);
        rec.check('TRUTH: an OLDER snapshot version also reads its provenance without "unknown"',
          after.length > 0 && unknownAfter === 0,
          `${unknownAfter} of ${after.length} rows read "unknown" on the previous version`);
      }
    }
  }
}

async function contributors(page, rec) {
  const empty = (await P.count(page, 'cs-contributors-empty')) > 0;
  const rows = await P.countPrefix(page, 'cs-contributor-');
  rec.check('TRUTH: contributors render rows or a named empty state',
    empty || rows > 0, `${rows} contributor elements, empty=${empty}`);
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

  /* Read the result by POLLING rather than by one read taken four seconds after
     the click. On the 2026-08-27 run a single read at that moment answered ZERO
     repositories for a record that had one before the attach and two after it,
     so the round trip reported a failed attach that had in fact succeeded — the
     sync a few steps later read "2 of 2 repositories". A one-shot read of a
     just-written record measures the timing of the harness, not the behaviour of
     the product. The intermediate readings are kept and reported, because a read
     that briefly sees zero is worth knowing about even when the end state is
     right. */
  const readings = [];
  let afterIds = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const poll = await api('');
    afterIds = ((poll.body && poll.body.repositories) || []).map((r) => r.id);
    readings.push(afterIds.length);
    if (afterIds.length > beforeIds.length) break;
    await page.waitForTimeout(2000);
  }
  const newIds = afterIds.filter((x) => !beforeIds.includes(x));
  rec.check('SOURCES: attaching a repository actually attaches it',
    attached.ok && newIds.length === 1,
    attached.ok ? `${beforeIds.length} -> ${afterIds.length} repositories `
      + `(readings: ${readings.join(', ')})` : attached.why);
  if (readings[0] < beforeIds.length) {
    rec.note('observation', `the first read after the attach answered ${readings[0]} repositories `
      + `for a record that had ${beforeIds.length} before it; the collection settled at `
      + `${afterIds.length}. The attach is wrapped in a database transaction, so this is recorded `
      + 'as an observation about read timing and NOT claimed as a defect: it was seen once and '
      + 'has not been reproduced.');
  }

  // FIX 2 again, on a different tab and a different write. The band must follow
  // the operator, not the panel that happens to own the mutation.
  const bandOnSources = (await P.count(page, 'cs-action-band')) > 0;
  rec.check('SOURCES: attaching a repository reports its outcome on THIS tab',
    bandOnSources,
    bandOnSources ? `band says: ${((await P.text(page, 'cs-action-note'))
      || (await P.text(page, 'cs-action-error')) || '').slice(0, 140)}`
      : 'no cs-action-band rendered on SOURCES after an attach');

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

  await analyzer(page, rec, opts);

  /* evidence */
  const evidenceRows = await P.countPrefix(page, 'cs-evidence-');
  const evidenceEmpty = (await P.count(page, 'cs-evidence-empty')) > 0;
  rec.check('SOURCES: the evidence panel renders rows or a named empty state',
    evidenceRows > 0 || evidenceEmpty, `${evidenceRows} evidence elements`);

  await syncAndDiff(page, rec);
}

/**
 * FIX 5 — `cs-analyze-repo` resolved to two elements (the Repository INPUT as a
 * literal, and the Analyze BUTTON via the control registry). Every lookup takes
 * the first match, so the §18 guard for "analyze repository" was asserting
 * against a text box and would have stayed green with the button deleted.
 */
async function analyzer(page, rec, opts) {
  const analyzeIdle = (await P.count(page, 'cs-analyze-idle')) > 0;
  rec.check('SOURCES: the analyzer states its idle condition in words', analyzeIdle);

  const collisions = await P.count(page, 'cs-analyze-repo');
  rec.check('SOURCES: data-testid="cs-analyze-repo" resolves to exactly one element',
    collisions === 1,
    `${collisions} element(s) carry it`
    + (collisions > 1 ? ' — the Repository INPUT and the Analyze BUTTON both claim it' : ''));
  const runBtn = await P.count(page, 'cs-analyze-run');
  rec.check('SOURCES: the Analyze BUTTON carries its own distinct test id',
    runBtn === 1, `${runBtn} element(s) carry data-testid="cs-analyze-run"`);

  await P.fill(page, 'cs-analyze-owner', opts.analyzeOwner);
  await P.fill(page, 'cs-analyze-repo', opts.analyzeRepo);
  const clicked = runBtn === 1
    ? await P.click(page, 'cs-analyze-run', 1000)
    : { ok: false, why: 'no cs-analyze-run control to press' };
  if (clicked.ok) {
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
    rec.skip('SOURCES: run the analyzer', clicked.why);
  }
}

async function syncAndDiff(page, rec) {
  const syncBefore = await P.text(page, 'cs-last-sync');
  const synced = await P.click(page, 'cs-sync', 12000);
  await page.waitForTimeout(6000);
  const syncAfter = await P.text(page, 'cs-last-sync');
  rec.check('SOURCES: a manual sync reports an outcome on this tab',
    synced.ok && Boolean(syncAfter), synced.ok ? `${syncBefore} -> ${syncAfter}` : synced.why);

  const history = await P.click(page, 'cs-sync-history', 3500);
  const runs = await P.countPrefix(page, 'cs-sync-run-');
  const runsEmpty = (await P.count(page, 'cs-sync-runs-empty')) > 0;
  const runsErr = await P.text(page, 'cs-sync-runs-error');
  rec.check('SOURCES: sync history lists runs or states it is empty',
    history.ok && (runs > 0 || runsEmpty) && !runsErr,
    runsErr || `${runs} runs listed, empty=${runsEmpty}`);

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

module.exports = { truth, sources };
