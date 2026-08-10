require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../app/db');
const { encrypt } = require('../app/middleware/encryption');
const { runFullDemoPipeline } = require('../app/services/demoPipeline');

// All officeholder/candidate demo data below is entirely fictional -- these
// are not real Detroit officials. Names, offices, and positions exist only to
// populate the frontend demo end to end (RFP 548227 rehearsal, not a real
// public-facing deployment). See MEMORY.md feedback_detroit_voter_edu_demo_scope.
// STORY-014: sourceUrl/recordType/retrievedAt are fake demo citations (URLs
// resolve nowhere real) attached to fictional subjects -- structurally the
// same shape a real provenance trail would use, so the frontend/API path is
// exercised honestly, without claiming to cite real public records.
const DEMO_SUBJECTS = [
  {
    name: 'Morgan Reyes',
    office: 'City Council Member, District 3 (Fictional Demo Seat)',
    jurisdiction: 'Demo District 3',
    issuePositions: {
      Housing: {
        text: 'Supports expanding the affordable-housing tax credit program and streamlining permit review for multi-family construction.',
        sourceUrl: 'https://demo.colaberry.dev/fixtures/council-minutes/2026-03-district3-housing.pdf',
        recordType: 'City Council meeting minutes (demo fixture)',
        retrievedAt: '2026-03-14',
      },
      Education: {
        text: 'Backs increased per-pupil funding for neighborhood schools and expanded after-school programming.',
        sourceUrl: 'https://demo.colaberry.dev/fixtures/budget-testimony/2026-04-district3-education.pdf',
        recordType: 'Public budget testimony (demo fixture)',
        retrievedAt: '2026-04-02',
      },
    },
  },
  {
    name: 'Casey Whitfield',
    office: 'Candidate, Fictional Demo Mayoral Race',
    jurisdiction: 'Demo City-Wide',
    issuePositions: {
      Housing: {
        text: 'Proposes a first-time homebuyer assistance fund and a moratorium on demolition of habitable vacant housing stock.',
        sourceUrl: 'https://demo.colaberry.dev/fixtures/candidate-platform/whitfield-housing.pdf',
        recordType: 'Candidate platform document (demo fixture)',
        retrievedAt: '2026-05-01',
      },
      'Public Safety': {
        text: 'Supports community policing pilots and increased funding for street lighting infrastructure.',
        sourceUrl: 'https://demo.colaberry.dev/fixtures/candidate-platform/whitfield-safety.pdf',
        recordType: 'Candidate platform document (demo fixture)',
        retrievedAt: '2026-05-01',
      },
      Education: {
        text: 'Advocates for universal pre-K expansion citywide.',
        sourceUrl: 'https://demo.colaberry.dev/fixtures/candidate-platform/whitfield-education.pdf',
        recordType: 'Candidate platform document (demo fixture)',
        retrievedAt: '2026-05-01',
      },
    },
  },
];

async function seed() {
  const sessionId = '00000000-0000-0000-0000-000000000001';
  const zipCode = '48201'; // Detroit, Wayne County (near Wayne State University)
  const issues = ['Healthcare', 'Education'];

  const encZip = encrypt(zipCode);
  const encIssues = encrypt(JSON.stringify(issues));

  await pool.query(
    `INSERT INTO user_preferences (session_id, zip_code_enc, zip_iv, issues_enc, issues_iv)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id) DO UPDATE
       SET zip_code_enc = $2, zip_iv = $3, issues_enc = $4, issues_iv = $5, updated_at = NOW()`,
    [sessionId, encZip.enc, encZip.iv, encIssues.enc, encIssues.iv],
  );

  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES ($1, 'PREFERENCES_SET', $2)`,
    [sessionId, JSON.stringify({ source: 'seed', issue_count: issues.length })],
  );

  console.log(`Seeded: session=${sessionId} ZIP=${zipCode} issues=${issues.join(',')}`);

  for (const subject of DEMO_SUBJECTS) {
    const inserted = await pool.query(
      `INSERT INTO officeholders_candidates (name, office, jurisdiction, issue_positions)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [subject.name, subject.office, subject.jurisdiction, JSON.stringify(subject.issuePositions)],
    );
    const subjectId = inserted.rows[0].id;
    const selectedIssues = Object.keys(subject.issuePositions);

    const result = await runFullDemoPipeline(subjectId, selectedIssues);
    console.log(`Seeded + published demo subject: id=${subjectId} name="${subject.name}" stage=${result.stage} status=${result.status}`);
  }

  await pool.end();
}

seed().catch((err) => { console.error(err.message); process.exit(1); });
