#!/usr/bin/env node
/**
 * Write "The story in brief" beats onto published case studies, and republish them.
 *
 * Ali, 19 Nov 2026: "can we add 'The story in brief' to all the case study's." The band
 * (identity.storyInBrief, 3 to 5 labeled beats) prints only when a record carries beats;
 * nothing is ever derived. This writes a reviewed set per record from a beats file.
 *
 * Runs INSIDE the backend container (it loads /app/dist), the way every case-study write
 * does: scp to the host, docker cp into accelerator-backend, then
 *   docker exec -w /app accelerator-backend node /tmp/sib/apply-story-in-brief.js /tmp/sib/beats.json [--apply] [--only=<slug>]
 * Dry run by default. With --apply each changed record goes through applyHumanOverride on
 * path `identity` (the WHOLE identity, or the rest of it is erased), which approves the new
 * snapshot and republishes every surface the record is live on.
 *
 * Refuses a record when:
 *   - the id and slug in the beats file do not match the record (a pasted id cannot write
 *     one story onto another record);
 *   - the server's own storyInBriefProblem rejects the beats (count, label, length);
 *   - a beat states a percentage, a currency figure, a quotation or a return/production
 *     claim: the publish gate's claim scan blocks those unless a verified metric carries
 *     them, and a blocked republish leaves the record approved but not live.
 * Unchanged beats are skipped, so a rerun writes nothing.
 * After writing, each live surface is checked to be on the new version; any that is not
 * prints the gate's blockers.
 */
const fs = require('fs');

const D = '/app/dist';
const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7) || null;
const ACTOR = process.env.CASE_STUDY_ACTOR || 'claude-code story-in-brief backfill';

/** The claim scan's closed vocabulary (caseStudyPublishClaimScan.ts), refused up front. */
const REFUSE = [
  [/\d+(?:\.\d+)?\s?%/, 'a percentage'],
  [/[$£€]\s?\d/, 'a currency figure'],
  [/["“”«»]/, 'a quotation mark'],
  [/\b(?:roi|return on investment|cost savings?|cost[- ]saving|savings? of|payback|revenue (?:lift|increase|growth|impact))\b/i, 'a return-on-investment claim'],
  [/\b(?:in production|into production|to production|production (?:deployment|rollout|release)|went live|gone live|goes live|go[- ]live)\b/i, 'a production claim'],
];

function vocabularyProblem(beats) {
  for (const [i, b] of beats.entries()) {
    for (const [re, what] of REFUSE) {
      if (re.test(`${b.label} ${b.text}`)) return `beat ${i + 1} (${b.label}) states ${what}`;
    }
  }
  return null;
}

// Compared field by field: Postgres jsonb stores each beat with its keys reordered ({text, label}),
// so a whole-object JSON.stringify never matched and every rerun reported "wrote" for unchanged records.
const shape = (beats) => JSON.stringify((beats || []).map((b) => [b && b.label, b && b.text]));
const same = (a, b) => shape(a) === shape(b);

(async () => {
  if (!FILE) { console.error('usage: apply-story-in-brief.js <beats.json> [--apply] [--only=<slug>]'); process.exit(64); }
  const entries = Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')).records);
  const { storyInBriefProblem } = require(`${D}/services/caseStudy/caseStudyStoryInBrief`);
  const { sequelize } = require(`${D}/config/database`);
  const { applyHumanOverride } = require(`${D}/services/caseStudy/caseStudyAdminReview`);
  const pub = require(`${D}/services/caseStudy/caseStudyPublicationService`);
  const latest = async (id) => (await sequelize.query(
    'SELECT version, content FROM case_study_snapshots WHERE case_study_id=:id ORDER BY version DESC LIMIT 1',
    { replacements: { id }, type: 'SELECT' }))[0];
  const live = (id) => sequelize.query(
    "SELECT p.surface_key, s.version FROM case_study_publications p JOIN case_study_snapshots s ON s.id=p.published_snapshot_id WHERE p.case_study_id=:id AND p.status='published'",
    { replacements: { id }, type: 'SELECT' });

  let refused = 0; let written = 0; let skipped = 0; let notLive = 0;
  for (const [id, { slug, beats }] of entries) {
    if (ONLY && slug !== ONLY) continue;
    const [row] = await sequelize.query('SELECT slug FROM case_studies WHERE id=:id', { replacements: { id }, type: 'SELECT' });
    const tag = slug.slice(0, 56).padEnd(56);
    if (!row || row.slug !== slug) { console.log(tag, 'REFUSED id and slug do not match a record'); refused++; continue; }
    const problem = storyInBriefProblem(beats) || vocabularyProblem(beats);
    if (problem) { console.log(tag, 'REFUSED', problem); refused++; continue; }
    const snap = await latest(id);
    const identity = snap.content.identity || {};
    if (same(identity.storyInBrief, beats)) { console.log(tag, 'unchanged v' + snap.version); skipped++; continue; }
    if (!APPLY) { console.log(tag, `would write ${beats.length} beats over v${snap.version}`); continue; }
    await applyHumanOverride({
      caseStudyId: id, path: 'identity', value: { ...identity, storyInBrief: beats }, actor: ACTOR,
      note: 'The story in brief: the arc in labeled beats at the top of the page (backfill, 19 Nov 2026)',
    });
    written++;
    const now = (await latest(id)).version;
    const surfaces = await live(id);
    const behind = surfaces.filter((s) => s.version !== now);
    console.log(tag, `wrote v${now}; live ${surfaces.map((s) => `${s.surface_key}@${s.version}`).join(' ')}`);
    for (const s of behind) {
      notLive++;
      const g = await pub.evaluateCaseStudyPublication({ caseStudyId: id, surfaceKey: s.surface_key, actor: ACTOR });
      console.log('   NOT LIVE on', s.surface_key, JSON.stringify((g.blockers || []).map((b) => b.message).slice(0, 4)));
    }
  }
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: written ${written}, unchanged ${skipped}, refused ${refused}, surfaces not on the new version ${notLive}`);
  process.exit(refused || notLive ? 2 : 0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
