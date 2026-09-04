/**
 * seedCertPrepContent — put the Cert Prep blueprint (and optionally the authored
 * items) into whatever database this process is pointed at, including production.
 *
 * This exists because `certPrepDevProof` / `certPrepDevLifecycle` deliberately
 * refuse to run anywhere but a scratch database, and the feature is useless in
 * production without its blueprint: the fence opens, the page loads, and there
 * is nothing to serve.
 *
 * WHAT IT WILL DO WITHOUT BEING ASKED
 *   - ensure the eight tables exist (idempotent DDL)
 *   - seed / re-seed the track and its five domains from the official published
 *     blueprint, which is reference data and safe to converge on
 *
 * WHAT IT WILL NOT DO WITHOUT BEING ASKED
 *   - load question items          (--items)
 *   - approve anything             (--approve-as <reviewer>)
 *
 * THE APPROVAL FLAG IS THE DANGEROUS ONE and it is deliberately awkward. Nothing
 * reaches a student until a named human approves it, and this script cannot BE
 * that human — it can only record whichever name you hand it. Hand it a real
 * reviewer only when a real person has actually read the items. For a smoke run,
 * hand it a `.test` address: the admin review queue renders any reviewer on a
 * .test/.invalid/.example/.local domain in red as "approved by a fixture
 * account — no human has read this item", so the shortcut announces itself
 * everywhere it matters instead of hiding in a database column.
 *
 * Usage:
 *   node dist/scripts/seedCertPrepContent.js
 *   node dist/scripts/seedCertPrepContent.js --items
 *   node dist/scripts/seedCertPrepContent.js --items --approve-as e2e@colaberry.test
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureCertPrepSchema, missingCertTables } from '../db/ensureCertPrepSchema';
import { seedBlueprint, getCurrentBlueprint } from '../services/certPrep/certBlueprintService';
import { createDraftRevision, validateRevision, setReviewStatus } from '../services/certPrep/certQuestionBankService';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../data/certBlueprints/ccarFoundations';
import { CCAR_F_SAMPLE_ITEMS } from '../data/certBlueprints/ccarFoundationsItems';
import CertQuestionRevision from '../models/CertQuestionRevision';

const args = process.argv.slice(2);
const withItems = args.includes('--items');
const approveIdx = args.indexOf('--approve-as');
const approveAs = approveIdx >= 0 ? args[approveIdx + 1] : null;

function log(line: string): void {
  console.log(line);
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db',
    { type: QueryTypes.SELECT },
  );
  log(`database        : ${db}`);
  log(`items           : ${withItems ? 'yes' : 'no (blueprint only)'}`);
  log(`approve as      : ${approveAs ?? 'nothing will be approved'}`);
  log('');

  await ensureCertPrepSchema();
  const missing = await missingCertTables();
  if (missing.length > 0) {
    throw new Error(`schema incomplete — missing ${missing.join(', ')}`);
  }
  log('schema          : all 8 tables present');

  const seeded = await seedBlueprint(CCAR_FOUNDATIONS_BLUEPRINT);
  log(`blueprint       : track ${seeded.track_id} ${seeded.blueprint_version} `
    + `(${seeded.track_created ? 'created' : 'already present'}), `
    + `${seeded.domains_created} domain(s) created, ${seeded.domains_updated} updated in place`);

  const blueprint = await getCurrentBlueprint();
  if (!blueprint) throw new Error('blueprint did not read back');
  const weights = blueprint.domains.map((d) => `${d.domain_id} ${d.weight_pct}%`).join(' · ');
  log(`weights         : ${weights}`);
  log(`blueprint source: ${blueprint.track.blueprint_source} (${blueprint.track.blueprint_version})`);

  if (withItems) {
    const problems = CCAR_F_SAMPLE_ITEMS.flatMap((i) =>
      validateRevision(i).map((p) => `${i.question_key}: ${p}`));
    if (problems.length > 0) {
      throw new Error(`items failed validation:\n  ${problems.join('\n  ')}`);
    }
    let created = 0;
    for (const input of CCAR_F_SAMPLE_ITEMS) {
      const existing = await CertQuestionRevision.findOne({ where: { question_key: input.question_key } });
      if (existing) continue;              // never a second revision by accident
      await createDraftRevision(input);
      created += 1;
    }
    log(`items           : ${created} created as DRAFT, ${CCAR_F_SAMPLE_ITEMS.length - created} already present`);
  }

  if (approveAs) {
    const drafts = await CertQuestionRevision.findAll({ where: { review_status: 'draft' } });
    for (const d of drafts) {
      await setReviewStatus(d.question_key, d.revision, 'approved', approveAs);
    }
    log(`approved        : ${drafts.length} revision(s) as "${approveAs}"`);
    if (/@[^@]*\.(test|invalid|example|local)$/i.test(approveAs)) {
      log('                  ^ a fixture reviewer — the admin queue will flag every one of these in red');
    }
  }

  const counts = await sequelize.query<{ review_status: string; n: string }>(
    'SELECT review_status, COUNT(*)::text AS n FROM cert_question_revisions GROUP BY 1 ORDER BY 1',
    { type: QueryTypes.SELECT },
  );
  log('');
  log(`bank            : ${counts.map((c) => `${c.review_status} ${c.n}`).join(' · ') || 'empty'}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err?.message ?? err);
    process.exit(1);
  })
  .finally(() => { void sequelize.close().catch(() => undefined); });
