import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { auditBank, formatBankAudit, BankAudit, BankItem } from '../../services/certPrep/certBankRubric';

/**
 * Load the LIVE bank — latest revision of every non-retired question — and
 * audit it. Shared by every script that changes the bank, so the audit runs
 * after the change against the database it just changed, not against the repo.
 *
 * This is the hook that would have caught 144-at-A the moment the generator
 * wrote it, rather than a day later when an export put the items under a test.
 */
interface LiveRow {
  question_key: string;
  domain_id: string;
  objective_id: string | null;
  scenario_family: string | null;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
  review_status: string;
}

export async function loadLiveBank(): Promise<BankItem[]> {
  const rows = await sequelize.query<LiveRow>(
    `SELECT DISTINCT ON (r.question_key)
            r.question_key, r.domain_id, r.objective_id, q.scenario_family, r.stem, r.options,
            r.correct_keys, r.rationale, r.distractor_rationales, r.review_status
       FROM cert_question_revisions r
       JOIN cert_questions q ON q.question_key = r.question_key
      WHERE q.is_retired = false
      ORDER BY r.question_key, r.revision DESC`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    question_key: r.question_key,
    domain_id: r.domain_id,
    objective_id: r.objective_id ?? '',
    scenario_family: r.scenario_family,
    stem: r.stem,
    options: r.options ?? [],
    correct_keys: r.correct_keys ?? [],
    rationale: r.rationale,
    distractor_rationales: r.distractor_rationales,
    review_status: r.review_status,
  }));
}

/**
 * Audit the live bank and print the scorecard. Returns the audit so a caller
 * can set an exit code or refuse to approve on a hard failure.
 */
export async function runLiveAudit(heading = 'after this change'): Promise<BankAudit> {
  const items = await loadLiveBank();
  const audit = auditBank(items);
  console.log('');
  console.log(`── Bank audit ${heading} ${'─'.repeat(Math.max(0, 50 - heading.length))}`);
  console.log(formatBankAudit(audit));
  return audit;
}
