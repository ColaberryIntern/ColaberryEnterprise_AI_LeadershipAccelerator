/**
 * Repoint the CoreOps record's imagery at the two captures of the project's own UI.
 *
 * WHY. The record shipped with two GENERATED images: a dashboard drawn from figures the
 * record already carried, and a rendered mermaid diagram. Ali's question - "are you
 * saying that image was in the repo?" - had the answer "no". The repository ships a
 * nine-page command-center/ app; these are captures of it.
 *
 * IDEMPOTENT. Re-running finds the captures already attached by URL and does not add a
 * second copy. Safe to run twice.
 *
 * It goes through the same services the admin endpoints call - applyHumanOverride,
 * approveSnapshot, publishCaseStudy - rather than writing snapshot JSON directly, so the
 * publish gate, the claim scanner and the content hash all still apply.
 */
const path = require('path');
const APP = process.cwd();
const { sequelize } = require(path.join(APP, 'dist/config/database'));
const { CaseStudyArtifact } = require(path.join(APP, 'dist/models'));
const { applyHumanOverride } = require(path.join(APP, 'dist/services/caseStudy/caseStudyAdminReview'));
const { approveSnapshot } = require(path.join(APP, 'dist/services/caseStudy/caseStudyAdminReview'));
const { publishCaseStudy } = require(path.join(APP, 'dist/services/caseStudy/caseStudyPublicationService'));

const CASE_STUDY_ID = '2d735285-7dfc-4dc1-a84b-74f3d812fc2d';
const ACTOR = 'ali@colaberry.com';
const BASE = 'https://enterprise.colaberry.ai/site-v2/';
// The CoreOps commit the captures were taken at.
const SHA = process.env.COREOPS_SHA || null;

const COVER = BASE + 'shot-coreops-traceability.png';

const NEW_ARTIFACTS = [
  {
    public_url: COVER,
    artifact_type: 'screenshot',
    title: 'Requirements traceability in the CoreOps Command Center',
    /* NO FIGURES IN THIS TEXT, DELIBERATELY. The first version quoted the
       confidence threshold printed in the screenshot and the publish gate refused
       it: an artifact description that states a figure must trace to a verified
       metric on this record, and the project's own requirement text is not one.
       The rule is right - a reader cannot tell a quoted requirement from a
       measured result - so the description says what the picture shows and lets
       the picture carry the numbers. */
    description:
      "The project's own interface, captured from the repository. Every requirement is "
      + 'traced to the story that fulfils it, with an enforcement state computed from the '
      + 'plan rather than asserted. Among them: the system must recommend actions without '
      + 'executing production changes, and must escalate to a human when its confidence '
      + 'falls below a stated threshold.',
  },
  {
    public_url: BASE + 'shot-coreops-guardrails.png',
    artifact_type: 'screenshot',
    title: 'The guardrails tab, showing what is and is not enforced',
    description:
      'The same interface reporting its own limits: of the guardrails shown, one is '
      + 'enforced, one partially, one not yet. The tab labels illustrative rows as sample '
      + 'data rather than presenting them as measured.',
  },
];

const log = (...a) => console.log(...a);

(async () => {
  // ---- 1. attach the two captures, without duplicating on a re-run -----------
  for (const spec of NEW_ARTIFACTS) {
    const existing = await CaseStudyArtifact.findOne({
      where: { case_study_id: CASE_STUDY_ID, public_url: spec.public_url },
    });
    if (existing) {
      // Title and description are refreshed too, so a re-run can correct copy the
      // publish gate rejected rather than needing the row deleted by hand.
      await existing.update({
        status: 'approved', visibility: 'public',
        title: spec.title, description: spec.description,
      });
      log(`kept   ${spec.public_url.split('/').pop()} (re-approved, copy refreshed)`);
      continue;
    }
    const row = await CaseStudyArtifact.create({
      case_study_id: CASE_STUDY_ID,
      artifact_type: spec.artifact_type,
      title: spec.title,
      description: spec.description,
      source_type: 'repo',
      ...(SHA ? { source_commit_sha: SHA } : {}),
      public_url: spec.public_url,
      preview_url: spec.public_url,
      visibility: 'public',
      status: 'approved',
    });
    log(`added  ${spec.public_url.split('/').pop()}  ${row.id}`);
  }

  // ---- 2. retire the generated pair ------------------------------------------
  // Rejected, not deleted: the record of what was published and why it was replaced
  // is worth more than a clean table.
  const [demoted] = await sequelize.query(
    `UPDATE case_study_artifacts SET status = 'rejected', visibility = 'private', updated_at = NOW()
      WHERE case_study_id = :id AND source_type = 'generated' AND status = 'approved'
      RETURNING id, title`,
    { replacements: { id: CASE_STUDY_ID } },
  );
  for (const d of demoted) log(`retired ${d.title}`);

  // ---- 3. rebuild the snapshot's artifacts section and name the cover --------
  const approved = await CaseStudyArtifact.findAll({
    where: { case_study_id: CASE_STUDY_ID, status: 'approved', visibility: 'public' },
    order: [['created_at', 'ASC']],
  });
  log(`\napproved public artifacts now: ${approved.length}`);

  const artifactsSection = approved.map((a) => ({
    id: a.id,
    artifactType: a.artifact_type,
    title: a.title,
    description: a.description,
    sourceType: a.source_type,
    visibility: a.visibility,
    status: a.status,
    publicUrl: a.public_url,
    previewUrl: a.preview_url,
    ...(a.source_commit_sha ? { sourceCommitSha: a.source_commit_sha } : {}),
  }));

  const artifactOverride = await applyHumanOverride({
    caseStudyId: CASE_STUDY_ID,
    path: 'artifacts',
    value: artifactsSection,
    note:
      'Replace the two generated images with captures of the project\'s own '
      + 'command-center interface. The generated dashboard was drawn from figures this '
      + 'record already carried and was not from the repository.',
    actor: ACTOR,
  });
  log('artifacts override ->', artifactOverride && artifactOverride.snapshotId);

  // identity is overridden as a WHOLE SECTION: applyHumanOverride refuses a nested path
  // the snapshot does not already carry, and heroImageUrl may not be there yet.
  const [[snapRow]] = await sequelize.query(
    `SELECT content FROM case_study_snapshots WHERE case_study_id = :id
      ORDER BY created_at DESC LIMIT 1`,
    { replacements: { id: CASE_STUDY_ID } },
  );
  const content = typeof snapRow.content === 'string' ? JSON.parse(snapRow.content) : snapRow.content;
  const identity = { ...content.identity, heroImageUrl: COVER };

  const identityOverride = await applyHumanOverride({
    caseStudyId: CASE_STUDY_ID,
    path: 'identity',
    value: identity,
    note: 'Cover: the traceability capture.',
    actor: ACTOR,
  });
  const snapshotId = (identityOverride && identityOverride.snapshotId)
    || (artifactOverride && artifactOverride.snapshotId);
  log('identity override  ->', snapshotId);

  // ---- 4. approve and publish ------------------------------------------------
  await approveSnapshot({ caseStudyId: CASE_STUDY_ID, snapshotId, actor: ACTOR });
  log('approved snapshot', snapshotId);

  const published = await publishCaseStudy({
    caseStudyId: CASE_STUDY_ID, surfaceKey: 'enterprise', snapshotId, actor: ACTOR,
  });
  log('published:', JSON.stringify(published && (published.status || published), null, 1).slice(0, 300));

  await sequelize.close();
  log('\nDONE');
})().catch((e) => {
  console.error('REPOINT_FAILED', e && (e.stack || e.message));
  process.exit(1);
});
