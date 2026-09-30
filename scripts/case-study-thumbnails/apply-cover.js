/**
 * apply-cover.js: make a picked thumbnail a record's cover and its video poster, and keep
 * the old cover on the page as a body image. Step 6 of README.md. Runs inside
 * `accelerator-backend` against /app/dist:
 *
 *   docker cp apply-cover.js cover-caption.json accelerator-backend:/tmp/
 *   docker exec accelerator-backend node /tmp/apply-cover.js --id=<case study uuid> \
 *     --image=https://enterprise.colaberry.ai/site-v2/thumb-<name>.jpg?v=<first 8 of its md5> \
 *     --title="Illustration: <what the picture shows>" [--apply]
 *
 * WHAT IT WRITES, in one new snapshot:
 *   - one `case_study_artifacts` row: artifact_type `photo` (so the projection stamps it
 *     `atmosphere`, never evidence), source_type `generated`, approved, public;
 *   - `artifacts`: the snapshot's list with that row appended;
 *   - `identity.heroImageUrl`: the picture (resolveHeroImage honours it only because it
 *     is an approved open artifact);
 *   - `walkthroughVideo.posterUrl`: the picture, when the record has a video.
 * The previous cover is untouched: it is already an artifact, and once it is no longer
 * the cover both renderers place it in the body (the cover is the only image they skip).
 *
 * WHERE IT PUBLISHES. Only on the surfaces the record is ALREADY published on, and only
 * with --apply. A record with no live publication stops at a DRAFT snapshot: making a
 * record public is its owner's decision, never a side effect of changing a picture.
 *
 * REFUSES, before writing anything, when: the URL has no `?v=<md5 8>`; (--apply only) the
 * image URL is not a live 200 image on enterprise.colaberry.ai/site-v2 (deploy the assets
 * first, or every live page gets a broken poster); the title does not start with the caption prefix; the title or the
 * description would be dropped by the atmosphere claim scan (describesDeliveredWork);
 * the composed content would not resolve to this cover or project this artifact; the
 * visual story fails validation after its hash is re-stamped; or any surface's gate
 * shows a blocker other than the two that approval itself clears.
 *
 * THE URL CARRIES THE FILE'S HASH, AND A DRY RUN NEVER FETCHES IT. Measured 2026-09-18:
 * Cloudflare caches a 404 from site-v2 for four hours, and four covers requested before
 * (or during) their deploy stayed 404 at the edge while the server had them. A `?v=<md5>`
 * query is a cache key the edge has never seen, and a dry run that does not request the
 * URL cannot poison it.
 *
 * IDEMPOTENT. The artifact row is found by (case_study_id, public_url). A record whose
 * latest snapshot already carries this cover and poster is not re-persisted; if that
 * snapshot is approved and every live surface is on it, the script prints UNCHANGED.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const ID = arg('id');
const IMAGE = arg('image');
const TITLE = arg('title');
const ACTOR = arg('actor') || 'ali@colaberry.com';
const APPLY = process.argv.includes('--apply');
const SITE = 'https://enterprise.colaberry.ai/site-v2/';
const SURFACES = ['training', 'enterprise', 'ai-flotation'];
const RESTING = new Set(['case_study_not_approved', 'snapshot_not_approved']);
const CAPTION = JSON.parse(fs.readFileSync(path.join(__dirname, 'cover-caption.json'), 'utf8'));

function stop(msg, code = 2) { console.log(`STOP: ${msg}`); process.exit(code); }

(async () => {
  if (!ID || !IMAGE || !TITLE) stop('usage: --id=<uuid> --image=<url> --title="Illustration: ..." [--apply]', 1);
  if (!IMAGE.startsWith(SITE)) stop(`image must be served from ${SITE}`);
  if (!/\?v=[0-9a-f]{8}$/.test(IMAGE)) stop('name the image with its content hash: thumb-<name>.jpg?v=<first 8 of its md5>');
  if (!TITLE.startsWith(CAPTION.titlePrefix)) stop(`title must start with "${CAPTION.titlePrefix}"`);

  const presentation = require('/app/dist/services/caseStudy/caseStudyArtifactPresentation');
  if (presentation.describesDeliveredWork(TITLE) || presentation.describesDeliveredWork(CAPTION.description)) {
    stop('the caption uses a delivered-work word, so the projection would drop the picture (DELIVERED_WORK_CLAIMS)');
  }

  if (APPLY) {
    const head = await fetch(IMAGE, { method: 'GET', signal: AbortSignal.timeout(20000) });
    const type = head.headers.get('content-type') || '';
    if (head.status !== 200 || !type.startsWith('image/')) stop(`${IMAGE} answered ${head.status} ${type}: deploy the assets first`);
  } else {
    console.log('dry run: the image URL is not requested (a 404 fetched now is cached at the edge for 4 hours)');
  }

  const { sequelize } = require('/app/dist/config/database');
  const { CaseStudyArtifact } = require('/app/dist/models');
  const overrides = require('/app/dist/services/caseStudy/caseStudySnapshotOverrides');
  const store = require('/app/dist/services/caseStudy/caseStudySnapshotStore');
  const gate = require('/app/dist/services/caseStudy/caseStudyPublishGate');
  const sections = require('/app/dist/services/caseStudy/caseStudyPublicSections');
  const review = require('/app/dist/services/caseStudy/caseStudyAdminReview');
  const pub = require('/app/dist/services/caseStudy/caseStudyPublicationService');
  const { hashCanonical } = require('/app/dist/utils/canonicalHash');

  const [[rec]] = await sequelize.query('select id, slug, status, visibility, builder_identity_mode, builder_naming_consent, organization_identity_mode, organization_naming_consent, organization_display_name from case_studies where id=:id', { replacements: { id: ID } });
  if (!rec) stop(`no case study ${ID}`);
  const [[snap]] = await sequelize.query('select id, version, status, content, provenance, source_commit_map from case_study_snapshots where case_study_id=:id order by version desc limit 1', { replacements: { id: ID } });
  const [pubs] = await sequelize.query("select surface_key, status, published_snapshot_id from case_study_publications where case_study_id=:id and status='published' order by surface_key", { replacements: { id: ID } });
  const live = pubs.map((p) => p.surface_key);
  console.log(`${rec.slug}: record ${rec.status}/${rec.visibility}; latest v${snap.version} ${snap.status}; live on ${live.join(', ') || 'nothing'}`);

  const content = snap.content;
  const wv = content.walkthroughVideo || null;
  const alreadyThere = content.identity && content.identity.heroImageUrl === IMAGE
    && (!wv || wv.posterUrl === IMAGE)
    && (content.artifacts || []).some((a) => a.publicUrl === IMAGE);
  if (alreadyThere && snap.status === 'approved' && pubs.every((p) => p.published_snapshot_id === snap.id)) {
    console.log('UNCHANGED: the latest snapshot already carries this cover and poster, approved, and every live surface is on it.');
    process.exit(0);
  }

  let composed = content;
  let application = null;
  if (!alreadyThere) {
    let row = await CaseStudyArtifact.findOne({ where: { case_study_id: ID, public_url: IMAGE } });
    if (!row && APPLY) {
      row = await CaseStudyArtifact.create({
        case_study_id: ID, artifact_type: 'photo', title: TITLE, description: CAPTION.description,
        source_type: 'generated', source_ref: 'scripts/case-study-thumbnails', public_url: IMAGE, preview_url: IMAGE,
        visibility: 'public', status: 'approved',
      });
    }
    const ref = {
      ...(row ? { id: row.id } : {}), artifactType: 'photo', title: TITLE, description: CAPTION.description,
      sourceType: 'generated', sourceRef: 'scripts/case-study-thumbnails', sourceCommitSha: null,
      visibility: 'public', status: 'approved', publicUrl: IMAGE, previewUrl: IMAGE,
    };
    const recordedAt = new Date().toISOString();
    const note = 'Cover and video thumbnail replaced by a picked illustration; the previous cover stays as a body image';
    const list = [
      { path: 'artifacts', value: [...(content.artifacts || []).filter((a) => a.publicUrl !== IMAGE), ref], actor: ACTOR, recordedAt, note },
      { path: 'identity', value: { ...(content.identity || {}), heroImageUrl: IMAGE }, actor: ACTOR, recordedAt, note },
    ];
    if (wv) list.push({ path: 'walkthroughVideo', value: { ...wv, posterUrl: IMAGE }, actor: ACTOR, recordedAt, note });
    application = overrides.applyOverrides(content, list);
    if (application.ignored.length) stop(`overrides ignored: ${JSON.stringify(application.ignored)}`);

    // The visual story's provenance hash covers the artifacts, so it is re-stamped from
    // the composed content and validated against the evidence the content cites.
    if (application.content.visualStory) {
      const gen = require('/app/dist/services/caseStudy/caseStudyVisualStoryGenerate');
      const validate = require('/app/dist/services/caseStudy/caseStudyVisualStoryValidate');
      const vs = application.content.visualStory;
      const hash = gen.visualStorySourceHash(application.content);
      if (vs.provenance.sourceContentHash !== hash) {
        const stamped = { ...vs, provenance: { ...vs.provenance, sourceContentHash: hash, sourceSnapshotId: snap.id } };
        application = overrides.applyOverrides(content, [...list, { path: 'visualStory', value: stamped, actor: ACTOR, recordedAt, note: `${note} (visual story hash re-stamped)` }]);
        if (application.ignored.length) stop(`overrides ignored: ${JSON.stringify(application.ignored)}`);
      }
      const ctx = validate.visualStoryContextFromContent(application.content, validate.evidenceIdsCitedByContent(application.content));
      const result = validate.validateVisualStory(application.content.visualStory, ctx);
      if (!result.ok) stop(`visual story invalid: ${JSON.stringify(result.errors || result.issues).slice(0, 800)}`);
      console.log('visual story: re-stamped and valid');
    }
    composed = application.content;
  }

  const hero = sections.resolveHeroImage(composed);
  const projected = sections.projectArtifacts(composed.artifacts || []).find((a) => a.url === IMAGE);
  if (hero !== IMAGE) stop(`the composed record resolves its cover to ${hero}, not ${IMAGE}`);
  if (!projected || projected.presentation !== 'atmosphere') stop('the new artifact does not project as an atmosphere picture');
  const bodyImages = sections.projectArtifacts(composed.artifacts || []).filter((a) => a.access === 'open' && a.url !== IMAGE).length;
  console.log(`cover resolves to the picture; ${bodyImages} other open images now eligible for the body`);

  const record = { ...rec, status: 'approved', builderIdentityMode: rec.builder_identity_mode, builderNamingConsent: rec.builder_naming_consent, organizationIdentityMode: rec.organization_identity_mode, organizationNamingConsent: rec.organization_naming_consent, organizationDisplayName: rec.organization_display_name };
  // The gate reads provenance (who wrote each quoted phrase), so the check carries it exactly as the persisted snapshot will.
  const provenance = { ...(snap.provenance || {}), ...(application ? application.entries : {}) };
  const asApproved = { id: 'composed', version: snap.version + 1, status: 'approved', approvedBy: ACTOR, approvedAt: new Date().toISOString(), content: composed, provenance };
  for (const surfaceKey of (live.length ? live : SURFACES)) {
    const d = gate.evaluateCaseStudyPublishGate({ surfaceKey, caseStudy: record, snapshot: asApproved });
    const rest = (d.blockers || []).filter((b) => !RESTING.has(b.code));
    console.log(`gate ${surfaceKey}: ${rest.length ? 'BLOCKED ' + JSON.stringify(rest.map((b) => [b.code, b.field])) : 'clean'}`);
    if (rest.length) stop('a blocker other than approval itself');
  }
  if (!APPLY) { console.log('DRY RUN. Nothing written.'); process.exit(0); }

  let snapshotId = snap.id;
  if (application) {
    const sourceCommitMap = snap.source_commit_map || {};
    const persisted = await store.persistCaseStudySnapshot({
      caseStudyId: ID, status: 'draft',
      draft: {
        content: composed, provenance, sourceCommitMap,
        contentHash: hashCanonical({ content: composed, sourceCommitMap }), generatedAt: new Date().toISOString(),
        generatedBy: 'human_edit', appliedOverrides: application.applied, ignoredOverrides: application.ignored,
      },
    });
    snapshotId = persisted.snapshotId;
    console.log(`snapshot ${persisted.outcome} v${persisted.version} (${snapshotId}) draft`);
  }
  if (!live.length) { console.log('No live publication: left as a DRAFT. Publishing is the owner\'s decision.'); process.exit(0); }

  await review.approveSnapshot({ caseStudyId: ID, snapshotId, actor: ACTOR });
  for (const surfaceKey of live) {
    await pub.publishCaseStudy({ caseStudyId: ID, surfaceKey, snapshotId, actor: ACTOR });
  }
  const [after] = await sequelize.query('select p.surface_key, s.version from case_study_publications p join case_study_snapshots s on s.id = p.published_snapshot_id where p.case_study_id=:id order by 1', { replacements: { id: ID } });
  console.log('republished:', JSON.stringify(after.map((r) => `${r.surface_key}:v${r.version}`)));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.error_class || e.name, e.message, e.details ? JSON.stringify(e.details).slice(0, 900) : ''); process.exit(1); });
