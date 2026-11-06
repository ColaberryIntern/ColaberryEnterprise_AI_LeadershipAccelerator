/* eslint-disable */
/**
 * auditProposalNeeds — read-only staging audit for the v3 Proposal Studio needs model (T-AUDIT, PROMPT success #2).
 * For one delivery project it asserts the three invariants and prints a pass/fail report; it writes NOTHING.
 *
 *   1. Every unresolved [PLACEHOLDER: …] in a document's current content has exactly one OPEN need.
 *   2. Every finding row on a current version carries a resolver ('agent' | 'human').
 *   3. Every human-resolved finding carries a complete typed need.
 *
 * The assertion logic is the pure, unit-tested core in ./lib/auditProposalNeeds.js; this wrapper only loads the data.
 *
 * Run (against prod/staging, read-only):
 *   docker exec -w /app -e PROJECT_ID=<delivery_project_id> accelerator-backend node src/scripts/auditProposalNeeds.js
 *   # or: node src/scripts/auditProposalNeeds.js <delivery_project_id>
 * Exit code 0 = PASS, 1 = FAIL (so it can gate CI), 2 = usage/connection error.
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { auditProjectNeeds, renderAuditReport } = require('./lib/auditProposalNeeds');

async function main() {
  const projectId = process.argv[2] || process.env.PROJECT_ID;
  if (!projectId) {
    console.error('Usage: node src/scripts/auditProposalNeeds.js <delivery_project_id>  (or set PROJECT_ID)');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set.'); process.exit(2); }

  const sequelize = new Sequelize(url, { logging: false });
  try {
    await sequelize.authenticate();
    const docs = await sequelize.query(
      `SELECT d.doc_key AS "docKey", d.content_html AS "contentHtml", v.findings AS findings
         FROM gov_proposal_documents d
         LEFT JOIN gov_proposal_document_versions v ON d.current_version_id = v.id
        WHERE d.delivery_project_id = $1`,
      { bind: [projectId], type: QueryTypes.SELECT },
    );
    const openRows = await sequelize.query(
      "SELECT DISTINCT need_key FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND resolution = 'open' AND need_key IS NOT NULL",
      { bind: [projectId], type: QueryTypes.SELECT },
    );
    const openNeedKeys = openRows.map((r) => r.need_key);
    const normDocs = docs.map((d) => ({ docKey: d.docKey, contentHtml: d.contentHtml, findings: Array.isArray(d.findings) ? d.findings : [] }));

    const report = auditProjectNeeds({ docs: normDocs, openNeedKeys });
    console.log(renderAuditReport(projectId, report));
    process.exit(report.pass ? 0 : 1);
  } catch (err) {
    console.error('Audit could not run:', err && err.message ? err.message : err);
    process.exit(2);
  } finally {
    try { await sequelize.close(); } catch (_) { /* ignore */ }
  }
}

main();
