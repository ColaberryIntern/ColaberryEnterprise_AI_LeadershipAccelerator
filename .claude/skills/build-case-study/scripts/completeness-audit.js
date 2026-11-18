/**
 * completeness-audit.js: the build-case-study completeness gate. Compares a record's latest snapshot with
 * the 5 most complete approved, published records, field by field, and adds the record-level checks the
 * snapshot cannot show. Read-only: it writes nothing.
 *
 *   docker exec accelerator-backend mkdir -p /tmp/csaudit
 *   docker cp completenessCore.js accelerator-backend:/tmp/csaudit/
 *   docker cp completeness-audit.js accelerator-backend:/tmp/csaudit/
 *   docker exec -w /app accelerator-backend node /tmp/csaudit/completeness-audit.js <caseStudyId> \
 *     [--refs=5] [--surfaces=enterprise,hire] [--accept=surfaceVariants:"reason"] [--json]
 *
 * Exit 0: no gap, no thin list, no record-level failure. Exit 2: something to fix (§12 loop). Exit 1: error.
 * --accept is for a field a person has ruled not applicable to THIS record; the reason is printed in the
 * report and must be repeated in the handoff. It is never a way to finish faster.
 */
'use strict';
const path = require('path');
const D = '/app/dist';
const core = require(path.join(__dirname, 'completenessCore.js'));

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = Number(opt('refs', '5'));
const SURFACES = opt('surfaces', 'enterprise').split(',').filter(Boolean);
const accepted = {};
for (const a of args.filter((x) => x.startsWith('--accept='))) {
  const [p, ...r] = a.slice(9).split(':');
  accepted[p] = r.join(':').replace(/^"|"$/g, '') || 'no reason given';
}
const RESTING = new Set(['case_study_not_approved', 'snapshot_not_approved']);

(async () => {
  if (!id) throw new Error('usage: completeness-audit.js <caseStudyId> [--refs=5] [--surfaces=a,b] [--accept=path:reason] [--json]');
  const { sequelize } = require(`${D}/config/database`);
  const q = (s, r) => sequelize.query(s, { replacements: r, type: 'SELECT' });

  const [rec] = await q('select id, slug, status, built_by_type, project_id from case_studies where id=:id', { id });
  if (!rec) throw new Error(`no case study ${id}`);
  const [latest] = await q('select id, version, status, content from case_study_snapshots where case_study_id=:id order by version desc limit 1', { id });

  // References: the snapshot each published record is actually live on (published = approved).
  const pubs = await q(`select distinct on (p.case_study_id) p.case_study_id, c.slug, s.content, p.published_at,
      array(select distinct p2.surface_key from case_study_publications p2 where p2.case_study_id=p.case_study_id and p2.status='published') surfaces
    from case_study_publications p join case_studies c on c.id=p.case_study_id join case_study_snapshots s on s.id=p.published_snapshot_id
    where p.status='published' and c.archived_at is null order by p.case_study_id, p.published_at desc`);
  const refs = core.selectReferences(pubs.map((r) => ({ caseStudyId: r.case_study_id, slug: r.slug, content: r.content, surfaces: r.surfaces, publishedAt: r.published_at })), id, N);
  // A name needs consent (gate rule 5). On a role-only record the missing name is correct, not a gap.
  if ((latest.content.identity || {}).builderIdentityMode !== 'named' && !accepted['builder.displayName']) {
    accepted['builder.displayName'] = 'role-only credit: no consented name (gate rule 5)';
  }
  const result = core.compareToReferences(latest.content, refs.map((r) => r.content), { accepted });

  // Record-level checks the snapshot cannot show.
  const record = [];
  const add = (check, ok, detail) => record.push({ check, ok, detail });
  const { serviceLinkGateFacts } = require(`${D}/services/caseStudy/caseStudyServiceLinkGateFacts`);
  const links = await serviceLinkGateFacts(id);
  add('service link confirmed (gate rule: no_confirmed_service_link)', links.confirmedCount > 0, `${links.confirmedCount} confirmed`);
  if (rec.built_by_type === 'colaberry_team') {
    add('linked to a person\'s project, so Hire can list it', !!rec.project_id, rec.project_id ? `project ${rec.project_id.slice(0, 8)}` : 'case_studies.project_id is null');
  }
  const hero = latest.content.identity && latest.content.identity.heroImageUrl;
  const [cover] = hero ? await q("select artifact_type, source_type from case_study_artifacts where case_study_id=:id and public_url=:u limit 1", { id, u: hero }) : [];
  add('cover is a picked thumbnail (§8f: photo artifact, generated)', !!cover && cover.artifact_type === 'photo', cover ? `${cover.artifact_type}/${cover.source_type}` : 'no cover artifact');

  // The three things every first try has missed (Ali, 2026-11-18). Each is its own named check, so a
  // record cannot read "nearly complete" while the pictures, the video or the picked cover are absent.
  const [shots] = await q(`select count(*)::int n from case_study_artifacts where case_study_id=:id and artifact_type='screenshot'
      and status='approved' and visibility='public' and public_url ~* '\\.(png|jpe?g|webp)'`, { id });
  const appScreensAccepted = accepted['record.appScreens'];
  add(`at least 3 real screens of the software (§8, captureAppScreens.js)${appScreensAccepted ? ' [ACCEPTED: ' + appScreensAccepted + ']' : ''}`,
    shots.n >= 3 || !!appScreensAccepted, `${shots.n} approved public screenshot artifact(s)`);
  const wv = latest.content.walkthroughVideo || {};
  add('walkthrough video with captions and a poster (§8c)', !!(wv.url && wv.captionsUrl && wv.posterUrl && wv.durationSeconds), wv.url ? `${wv.durationSeconds || '?'} s, captions ${wv.captionsUrl ? 'yes' : 'NO'}, poster ${wv.posterUrl ? 'yes' : 'NO'}` : 'no video');
  const pick = (latest.content.identity || {}).heroImageUrl;
  add('the cover is the concept Ali picked (§8f), and the video poster matches it', !!pick && wv.posterUrl === pick, pick ? (wv.posterUrl === pick ? 'cover = poster' : 'poster differs from cover') : 'no cover yet: generate three concepts and open the picker on day one');

  const reserved = core.mermaidReservedIds((latest.content.architecture || {}).diagramSource);
  add('the architecture diagram parses: no node named after a Mermaid keyword', reserved.length === 0, reserved.length ? `rename node(s): ${reserved.join(', ')}` : 'clean');

  // The real gate, with service-link facts (the bare gate reports every record as unlinked).
  const gate = require(`${D}/services/caseStudy/caseStudyPublishGate`);
  const store = require(`${D}/services/caseStudy/caseStudyPublicationStore`);
  const models = require(`${D}/models`);
  const snapRow = await models.CaseStudySnapshot.findByPk(latest.id);
  const asApproved = { ...store.toPublishSnapshot(snapRow), status: 'approved' };
  const raw = await store.loadCaseStudyOrThrow(id);
  const recRow = { ...store.toPublishRecord(raw), status: 'approved' };
  const { hireGateFacts } = require(`${D}/services/career/caseStudyLinkedPerson`);
  // Not passed: the foundation facts (maturity of a linked STUDENT project). Their builder is private to
  // the publication service, so a student-project record must still be checked with the real publish
  // path (evaluateCaseStudyPublication) once its snapshot is approved.
  for (const surfaceKey of SURFACES) {
    const d = await gate.evaluateCaseStudyPublishGate({ surfaceKey, caseStudy: recRow, snapshot: asApproved, serviceLinks: links, hire: await hireGateFacts(raw, surfaceKey) });
    const rest = (d.blockers || []).filter((b) => !RESTING.has(b.code));
    add(`gate on ${surfaceKey}, approval aside`, rest.length === 0, rest.length ? rest.map((b) => `${b.code}@${b.field}`).join(', ') : 'clean');
  }
  try {
    const { reviewCaseStudyStory } = require(`${D}/services/caseStudy/caseStudyStoryReview`);
    const rv = reviewCaseStudyStory(latest.content, SURFACES[0]);
    const warn = (rv.findings || rv.issues || []).filter((f) => /warn/i.test(f.severity || f.level || ''));
    add('story review: no warnings', warn.length === 0, warn.length ? warn.map((w) => w.code).join(', ') : 'clean');
  } catch (e) { add('story review ran', false, e.message); }

  const failed = record.filter((r) => !r.ok);
  const out = { caseStudy: rec.slug, version: latest.version, references: refs.map((r) => r.slug), fields: result, record };
  if (args.includes('--json')) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`COMPLETENESS AUDIT  ${rec.slug}  v${latest.version} (${latest.status})\n`);
    console.log(core.formatReport(result, refs.map((r) => r.slug)));
    console.log('\nRECORD');
    for (const r of record) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.check}: ${r.detail}`);
    console.log(`\nVERDICT ${result.gaps.length + result.thin.length + failed.length === 0 ? 'COMPLETE' : 'INCOMPLETE'}: gaps ${result.gaps.length}, thin ${result.thin.length}, record checks failed ${failed.length}`);
  }
  process.exit(result.gaps.length + result.thin.length + failed.length === 0 ? 0 : 2);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
