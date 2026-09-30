/**
 * sendCertQuestionReview — email the CCAR-F question bank out for human review,
 * one message per domain, in a shape somebody can reply to.
 *
 * WHY THIS EXISTS. All 150 questions sit as drafts behind the named-reviewer
 * gate, and nothing is servable until a person approves them. The admin queue at
 * /admin/cert-prep is the place to APPROVE; it is not a good place to READ 150
 * questions carefully. This sends the actual items to a reviewer's inbox so the
 * reading can happen where reading happens, and the reply comes back as prose.
 *
 * ONE EMAIL PER DOMAIN, not one per question and not one for everything. 150
 * items in a single message is not a review, it is a wall; 150 separate messages
 * is not a review either. A domain is 23-40 items, which is a sitting, and it
 * matches how the exam is organised, so feedback arrives scoped to a competence.
 *
 * DRY RUN BY DEFAULT. `--send` is required to put anything in an inbox.
 *
 * NO DEDUP TABLE, AND THAT IS DELIBERATE. Every other side-effecting script here
 * is keyed against re-sending, because a duplicate transactional email is a
 * defect. This one is a review loop: questions get edited and sent again, and
 * that is the workflow rather than a mistake. The subject carries the date and
 * the revision count so a second send reads as a second draft rather than a
 * duplicate, and `--send` being explicit is the guard against an accidental one.
 *
 * Usage:
 *   node dist/scripts/sendCertQuestionReview.js                    # dry run, all domains
 *   node dist/scripts/sendCertQuestionReview.js --domain D1        # dry run, one domain
 *   node dist/scripts/sendCertQuestionReview.js --send --to a@b.c  # actually send
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { sendCertReviewEmail } from '../services/certPrep/certReviewEmail';

const args = process.argv.slice(2);
const send = args.includes('--send');
const domainIdx = args.indexOf('--domain');
const onlyDomain = domainIdx >= 0 ? args[domainIdx + 1] : null;
const toIdx = args.indexOf('--to');
const recipient = toIdx >= 0 ? args[toIdx + 1] : 'ali@colaberry.com';

export interface ReviewRow {
  question_key: string;
  revision: number;
  domain_id: string;
  objective_id: string;
  difficulty: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
  review_status: string;
}

/**
 * The LATEST revision of every question, whatever its state. A reviewer must see
 * what would be served if they approved, which is the newest draft — not the
 * retired revision it replaced, and not an approved one that a correction has
 * already superseded.
 */
export const LATEST_REVISION_SQL = `
  SELECT DISTINCT ON (r.question_key)
         r.question_key, r.revision, r.domain_id, r.objective_id, r.difficulty,
         r.stem, r.options, r.correct_keys, r.rationale, r.distractor_rationales,
         r.review_status
    FROM cert_question_revisions r
   WHERE r.review_status <> 'retired'
   ORDER BY r.question_key, r.revision DESC`;

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  console.log(`database : ${db}`);
  console.log(`mode     : ${send ? `SEND to ${recipient}` : 'dry run (pass --send to email)'}`);
  console.log('');

  const rows = await sequelize.query<ReviewRow>(LATEST_REVISION_SQL, { type: QueryTypes.SELECT });
  if (rows.length === 0) throw new Error('no question revisions found — is this the right database?');

  const byDomain = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    if (onlyDomain && row.domain_id !== onlyDomain) continue;
    const list = byDomain.get(row.domain_id) ?? [];
    list.push(row);
    byDomain.set(row.domain_id, list);
  }
  if (byDomain.size === 0) throw new Error(`no questions matched domain ${onlyDomain}`);

  const domains = [...byDomain.keys()].sort();
  let sent = 0;

  for (let i = 0; i < domains.length; i += 1) {
    const domain = domains[i];
    const items = (byDomain.get(domain) ?? []).sort((a, b) => a.question_key.localeCompare(b.question_key));

    console.log(`${domain.padEnd(4)} ${String(items.length).padStart(3)} item(s)  part ${i + 1} of ${domains.length}`);

    if (!send) continue;
    const result = await sendCertReviewEmail({
      to: recipient,
      domainId: domain,
      part: i + 1,
      ofParts: domains.length,
      items,
    });
    console.log(`     sent: ${result.subject}`);
    sent += 1;
  }

  console.log('');
  console.log(`questions : ${rows.length} across ${new Set(rows.map((r) => r.domain_id)).size} domain(s)`);
  console.log(`emails    : ${send ? `${sent} sent` : `${domains.length} would be sent`}`);
  if (!send) console.log('            nothing was emailed. Re-run with --send.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('FAILED:', err?.message ?? err); process.exit(1); })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
