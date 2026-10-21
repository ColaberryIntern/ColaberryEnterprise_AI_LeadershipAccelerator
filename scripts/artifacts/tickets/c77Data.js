/**
 * C7.7 - enterprise security and trust readiness gap assessment. Source for both PDFs.
 *
 * ## The ticket's standard
 *
 * "Every item evidenced from code or production, not assumed." So every row below carries
 * an EVIDENCE string that is either a `path:line` in this repo or a production measurement
 * with its date. `assertEveryGapHasEvidence()` fails the build on a row without one.
 *
 * "No certification claimed that is not held." We hold none. The assessment says so, and
 * `assertNoCertificationClaimed()` fails the build if the prose ever asserts otherwise.
 *
 * "Produce the honest list including the uncomfortable items." Two of the uncomfortable
 * items are about our own words rather than our code: two routed marketing pages describe
 * SOC 2 alignment, and our internal trust rubric scores a CORS allow-list we do not have.
 *
 * ## Framing
 *
 * Gaps are mapped to the Cloud Security Alliance Cloud Controls Matrix v4.1 domain codes,
 * read from cloudsecurityalliance.org/research/cloud-controls-matrix on 18 October 2026.
 * CAIQ is the questionnaire most mid-market enterprise buyers send, so answering by its
 * domains is answering in the buyer's own structure rather than ours.
 */

const AS_OF = '18 October 2026';

/** CCM v4.1 domains, quoted from the CSA page. Only those used below. */
const DOMAIN = {
  AIS: 'Application & Interface Security',
  BCR: 'Business Continuity Mgmt & Op Resilience',
  CEK: 'Cryptography, Encryption, & Key Management',
  DSP: 'Data Security & Privacy',
  GRC: 'Governance, Risk Management, & Compliance',
  IAM: 'Identity & Access Management',
  LOG: 'Logging & Monitoring',
  SEF: 'Sec. Incident Mgmt, E-Disc & Cloud Forensics',
  STA: 'Supply Chain Mgmt, Transparency, & Accountability',
  TVM: 'Threat & Vulnerability Management',
};

const SEV = {
  CRITICAL: { k: 'CRITICAL', color: '#b3261e', rank: 0 },
  HIGH: { k: 'HIGH', color: '#c2410c', rank: 1 },
  MEDIUM: { k: 'MEDIUM', color: '#b26a00', rank: 2 },
};

/** Effort to close, in engineering time. S < 1 week, M 1-4 weeks, L > 1 month. */
const EFFORT = { S: 'S', M: 'M', L: 'L' };

/* ------------------------------------------------------------------ *
 * THE GAPS
 * ------------------------------------------------------------------ */

const GAPS = [
  {
    id: 'G1', domain: 'BCR', sev: SEV.CRITICAL, effort: EFFORT.S,
    gap: 'There is no database backup of any kind.',
    state: 'Production Postgres runs on a bare Docker named volume with no replication. The '
      + 'only pg_dump in the repository is schema-only and belongs to a dev-sync script, so '
      + 'it copies no data and produces nothing restorable. No WAL archiving, no snapshot '
      + 'job, no object-storage target, and no written restore procedure, RTO or RPO.',
    evidence: 'docker-compose.production.yml:21 (pgdata volume); '
      + 'scripts/syncDevSchemaFromProd.sh:110 (--schema-only); docs/spec/out-of-scope-nfrs.md:36 '
      + 'declares DR drills out of scope and describes recovery as "we restore via git checkout", '
      + 'which restores code and not data.',
    answer: 'A buyer asking "what is your RPO" has no answer today, and the honest one is '
      + 'that an instance loss is a total data loss.',
  },
  {
    id: 'G2', domain: 'IAM', sev: SEV.CRITICAL, effort: EFFORT.M,
    gap: 'Admin access is cross-tenant in production right now.',
    state: 'The tenancy isolation layer is built, fail-closed and audited, but it switches '
      + 'itself to a permissive "migration_open" mode while the membership table is empty, '
      + 'and that is the live state. Separately, only about 11 of 134 admin route files '
      + 'consult tenant scope at all, so even once memberships exist most admin routes would '
      + 'still read any row by id.',
    evidence: 'Measured in production 18 October 2026: tenant_memberships 0 rows, '
      + 'platform_identities 0 rows, tenants 4 rows. Code: '
      + 'backend/src/modules/tenancy/adminScopeBridge.ts:41 and :177.',
    answer: 'Defensible only while there is one real customer. It is not defensible the day '
      + 'a second customer’s data lands in the same database.',
  },
  {
    id: 'G3', domain: 'IAM', sev: SEV.HIGH, effort: EFFORT.L,
    gap: 'No SSO for customer organizations. No SAML, no OIDC, no SCIM.',
    state: 'Authentication is a stateless JWT with a password login for staff and a magic '
      + 'link for learners. The only federated sign-in is Google ID-token verification on one '
      + 'external-reviewer surface, which is lookup-only and never provisions access. There '
      + 'is no tenant-configurable identity provider and no just-in-time provisioning.',
    evidence: 'No SAML/OIDC/SCIM library in any package.json; searched passport-saml, '
      + 'node-saml, openid-client, @azure/msal across backend, frontend and every package.json. '
      + 'The one federated path is backend/src/routes/deliveryClientAuthRoutes.ts:121.',
    answer: 'This is the single most common hard requirement in enterprise procurement and '
      + 'we cannot meet it. It is a roadmap item, not a configuration.',
  },
  {
    id: 'G4', domain: 'IAM', sev: SEV.HIGH, effort: EFFORT.M,
    gap: 'No multi-factor authentication anywhere, for any identity class.',
    state: 'Forty staff accounts authenticate with a password alone. No TOTP, no WebAuthn, '
      + 'no enrollment model, no verification endpoint.',
    evidence: 'Measured in production 18 October 2026: admin_users 40 rows. No MFA library '
      + 'in any package.json; searched mfa, totp, 2fa, speakeasy, otplib, authenticator.',
    answer: 'Expect this to be asked in the first ten questions of any questionnaire.',
  },
  {
    id: 'G5', domain: 'IAM', sev: SEV.HIGH, effort: EFFORT.S,
    gap: 'The staff login has no rate limit, no lockout and no password reset.',
    state: 'Passwords are hashed with bcrypt at cost 12 and the login does not reveal whether '
      + 'an account exists, both good. But the route takes unlimited attempts: there is no '
      + 'limiter on it, no failed-attempt counter and no lock column on the account model. '
      + 'Failed attempts are logged as telemetry and never counted. A minimum length of 12 is '
      + 'enforced on rotation but not on creation, and there is no forgot-password flow.',
    evidence: 'backend/src/routes/admin/authRoutes.ts:11 has no limiter argument; '
      + 'backend/src/models/AdminUser.ts carries no lockout column; '
      + 'backend/src/services/adminService.ts:7 (cost 12), :39 (length, rotation only).',
    answer: 'The cheapest high-severity fix on this list. A limiter on one route plus a lock '
      + 'column closes most of it.',
  },
  {
    id: 'G6', domain: 'TVM', sev: SEV.HIGH, effort: EFFORT.S,
    gap: 'No dependency or vulnerability scanning, and the backend has no lockfile.',
    state: 'No Dependabot, no npm audit in CI, no Snyk, Trivy or CodeQL. Every CI job installs '
      + 'with npm install rather than npm ci and passes --no-audit, which also suppresses '
      + 'npm’s own advisory output. The backend has no package-lock.json at all, so its '
      + 'dependency versions are not pinned and two builds can differ.',
    evidence: 'Verified: no backend/package-lock.json exists; only two lockfiles are tracked '
      + '(root and frontend). .github/workflows/ci.yml contains 10 uses of "npm install" and '
      + '0 of "npm ci". No dependabot.yml anywhere.',
    answer: 'A buyer asking how we learn about a critical CVE in a dependency has no answer '
      + 'except that someone notices.',
  },
  {
    id: 'G7', domain: 'DSP', sev: SEV.HIGH, effort: EFFORT.S,
    gap: 'One file endpoint serves uploaded community media with no authentication.',
    state: 'The route validates only that the id looks like a UUID and then returns the file '
      + 'from disk. Anyone who has or guesses an id can retrieve any uploaded community file '
      + 'without an account. The upload side is correctly guarded.',
    evidence: 'backend/src/routes/participantRoutes.ts:1024, read in full: a UUID format check '
      + 'at :1026 then res.sendFile at :1031, with no guard middleware on the route.',
    answer: 'An unauthenticated object store by accident. A signed-token pattern already '
      + 'exists two routes away and could be reused.',
  },
  {
    id: 'G8', domain: 'STA', sev: SEV.HIGH, effort: EFFORT.S,
    gap: 'Learner and customer data reaches one AI vendor with no redaction.',
    state: 'The OpenAI path redacts high-sensitivity identifiers from both the system and the '
      + 'user prompt before the call. The Anthropic mentor path does not: it contains no '
      + 'redaction call at all, and sends the system prompt and conversation turns as they '
      + 'are. The redactor itself only strips SSN and card patterns by design, so names, '
      + 'emails and phone numbers reach both vendors either way.',
    evidence: 'backend/src/services/llmCallWrapper.ts:170-171 redacts; '
      + 'backend/src/services/runtime/anthropicClient.ts contains zero matches for "redact". '
      + 'Scope of the redactor: backend/src/utils/piiRedaction.ts:6-9.',
    answer: 'The asymmetry is the finding. One path was hardened and its sibling was not.',
  },
  {
    id: 'G9', domain: 'DSP', sev: SEV.HIGH, effort: EFFORT.M,
    gap: 'A retention policy exists on paper and is switched off, and erasure is partial.',
    state: 'Nine PII-bearing table classes have a documented 24-month policy, and the service '
      + 'that implements it is read-only by construction with enforcement hardcoded to '
      + 'disabled. Nothing purges customer PII on any schedule. An admin-triggered erasure '
      + 'endpoint exists and anonymizes leads and enrollments and hard-deletes activities, '
      + 'but the matching export reads five tables while the erasure touches three: chat '
      + 'conversations and messages are exported and never erased.',
    evidence: 'backend/src/services/retentionReportService.ts:67-68, literally '
      + "dryRun: true and enforcement: 'disabled'; "
      + 'backend/src/routes/admin/securityRoutes.ts:159 exports five tables, :206 erases three.',
    answer: 'We can answer "do you have a retention policy" with yes and "do you enforce it" '
      + 'with no, and a buyer will ask the second question.',
  },
  {
    id: 'G10', domain: 'STA', sev: SEV.HIGH, effort: EFFORT.S,
    gap: 'No subprocessor list and no data processing agreement.',
    state: 'At least twelve external services receive customer, lead or learner personal data '
      + 'in the ordinary course of operation, including two AI providers, an email platform, a '
      + 'voice platform, a CRM and a payment processor. There is no subprocessor register, no '
      + 'DPA, and no vendor security review on file. The nearest artifact is an internal AI '
      + 'systems registry whose owner column reads TBD throughout.',
    evidence: 'Searched docs/ and directives/ for subprocessor, data processing agreement, DPA '
      + 'and vendor list: no matching document. Nearest: docs/ai-governance/ai-systems-registry.csv.',
    answer: 'This one is documentation rather than engineering, and it is required before any '
      + 'enterprise contract is signed, not after.',
  },
  {
    id: 'G11', domain: 'AIS', sev: SEV.MEDIUM, effort: EFFORT.S,
    gap: 'CORS is open to every origin.',
    state: 'The API applies the cors middleware with no options, so no origin allowlist and no '
      + 'credentials policy. Worth noting alongside it: our own internal trust rubric scores '
      + 'this control as shipped and describes a "cors allow-list" that does not exist.',
    evidence: 'backend/src/server.ts applies app.use(cors()) with no configuration object, '
      + 'verified by reading lines 178-205. The contradicting claim is at '
      + 'backend/src/services/trustRubric.ts:256.',
    answer: 'Low exploitability given the API is token-authenticated, but it is a question on '
      + 'every questionnaire and the answer is currently wrong in our own scorecard.',
  },
  {
    id: 'G12', domain: 'LOG', sev: SEV.MEDIUM, effort: EFFORT.M,
    gap: 'The audit trail records admin writes only, and is not tamper-evident.',
    state: 'Admin write requests are audited with actor, action, entity and IP. Reads are '
      + 'never audited, so there is no record of who looked at what. Only successful requests '
      + 'are recorded, so a denied or failed attempt leaves no row. Before-values are always '
      + 'null, so there is no diff. No database trigger, grant restriction or append-only '
      + 'constraint protects the table; immutability is convention.',
    evidence: 'backend/src/middlewares/auditMiddleware.ts:58 (writes only), :73 (success only), '
      + ':82 (old_values null). Measured in production 18 October 2026: audit_logs holds '
      + '541,411 rows from 8 March 2026 to today.',
    answer: 'Enough to answer "do you log admin actions" and not enough to answer "can you '
      + 'prove who accessed this record".',
  },
  {
    id: 'G13', domain: 'LOG', sev: SEV.MEDIUM, effort: EFFORT.M,
    gap: 'No structured logging framework, and PII redaction in logs is manual.',
    state: 'All logging is console output to stdout with roughly 2,700 call sites and no '
      + 'winston, pino or bunyan. Redaction helpers exist and are applied in many controllers, '
      + 'but application is per call site with no lint rule, and the same file that redacts an '
      + 'email on one line logs a raw one on another.',
    evidence: 'No logging library in backend/package.json. Redaction applied at '
      + 'backend/src/controllers/trackingController.ts:616 and a raw email logged at :250 in '
      + 'the same file.',
    answer: 'CLAUDE.md requires JSON structured logs; the codebase does not meet its own rule.',
  },
  {
    id: 'G14', domain: 'AIS', sev: SEV.MEDIUM, effort: EFFORT.M,
    gap: 'The content security policy permits inline and eval script, and duplicate headers '
      + 'are served on the API.',
    state: 'Security headers are present and correct on the live site, which many peers fail. '
      + 'But the policy allows unsafe-inline and unsafe-eval for scripts, which materially '
      + 'weakens it against cross-site scripting. Helmet and nginx both emit headers on API '
      + 'responses, so two different content security policies and two different referrer '
      + 'policies arrive together.',
    evidence: 'Measured live 18 October 2026 against enterprise.colaberry.ai: HSTS, '
      + 'X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy all '
      + 'present; script-src includes unsafe-inline and unsafe-eval; /api returned two '
      + 'Content-Security-Policy headers and two conflicting Referrer-Policy values.',
    answer: 'Partly deliberate: eval is required by an in-browser preview feature. The '
      + 'duplication is not deliberate.',
  },
  {
    id: 'G15', domain: 'IAM', sev: SEV.MEDIUM, effort: EFFORT.M,
    gap: 'Tokens cannot be revoked, and the browser stores them where script can read them.',
    state: 'Every token class is signed with one shared secret. Staff tokens last four hours '
      + 'and learner tokens seven days. There is no refresh, no rotation and no denylist, so '
      + 'logout is a client-side discard and a stolen token stays valid until it expires. The '
      + 'frontend keeps the staff token in localStorage, which any injected script can read.',
    evidence: 'backend/src/config/env.ts:57 (4h default); '
      + 'backend/src/services/participantService.ts:19-30 (7d); '
      + 'backend/src/controllers/adminAuthController.ts:65-72 states logout is client-side and '
      + 'no blacklist exists; frontend/src/contexts/AuthContext.tsx:42 reads localStorage.',
    answer: 'The practical question a buyer asks is "how fast can you cut off a departing '
      + 'employee", and the answer today is up to four hours.',
  },
  {
    id: 'G16', domain: 'SEF', sev: SEV.MEDIUM, effort: EFFORT.M,
    gap: 'No incident response plan, and no way for anyone to report a vulnerability.',
    state: 'There is no documented incident response procedure, no breach notification '
      + 'timeline, no on-call rotation and no severity definitions. There is no SECURITY.md '
      + 'and no disclosure address, so a researcher who finds something has no channel.',
    evidence: 'No SECURITY.md at the repository root or under .github/. Searched docs/ and '
      + 'directives/ for incident response and breach notification: no procedure document.',
    answer: 'Both are hours of writing rather than engineering, and both appear on every '
      + 'questionnaire.',
  },
  {
    id: 'G17', domain: 'GRC', sev: SEV.MEDIUM, effort: EFFORT.S,
    gap: 'The automated route-authorization check is weaker than it looks.',
    state: 'A CI job is a required check on main and scans the admin route tree for guard '
      + 'names. It matches by plain substring over the whole file including comments, and it '
      + 'is per file rather than per route, so one guarded route in a file of forty satisfies '
      + 'it and a comment mentioning a guard passes as readily as a real one. It does not '
      + 'scan the learner portal or public trees at all.',
    evidence: 'scripts/lint-route-auth.js:28 scopes to backend/src/routes/admin only; :46-49 '
      + 'is a whole-file substring search; the script’s own header at :17-21 documents both '
      + 'weaknesses.',
    answer: 'It is a real control and it is worth keeping. It should not be described to a '
      + 'buyer as proof that every route is guarded, because it does not establish that.',
  },
];

/* ------------------------------------------------------------------ *
 * WHAT IS GENUINELY IN PLACE
 * ------------------------------------------------------------------ */

const STRENGTHS = [
  ['Secret scanning is real and gated', 'A gitleaks scan runs on every pull request and over '
    + 'the entire history weekly, and the pull-request check is a required status check on '
    + 'main. .github/workflows/secret-scan.yml:98 is the full-history job.'],
  ['Credentials are envelope-encrypted with rotation', 'AES-256-GCM with a master key, '
    + 'previous-key support so rows stay readable through a rotation, and a re-wrap path. '
    + 'backend/src/services/security/credentialVault.ts. The module also states what it does '
    + 'not defend against, which is the right posture.'],
  ['Transport headers are correct and verified live', 'HSTS for one year with subdomains, '
    + 'X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy all '
    + 'present on the production site, measured 18 October 2026.'],
  ['Unauthenticated API reads are refused cleanly', 'Five admin and portal endpoints were '
    + 'requested without credentials on 18 October 2026; all five returned 401 with the body '
    + '{"error":"Authentication required"} and no data.'],
  ['The one external multi-customer surface is genuinely isolated', 'Delivery-client reviewer '
    + 'tokens carry their permitted project ids, every request checks them, a cross-project '
    + 'request returns 404 rather than 403, and the attempt is written to an audit table. '
    + 'backend/src/middlewares/deliveryClientAuth.ts:118-156.'],
  ['Passwords are stored properly', 'bcrypt at cost 12, and the login returns the same error '
    + 'whether or not the account exists, so it does not confirm which emails are staff.'],
  ['A consent ledger exists and is append-only', 'Event-sourced consent records with lawful '
    + 'basis and jurisdiction, for AI-driven outbound. backend/src/models/ConsentRecord.ts.'],
  ['The tenancy isolation layer is built and fail-closed', 'Access derives from a membership '
    + 'row rather than from being an admin, cross-tenant attempts are audited, and a failed '
    + 'read returns an empty context rather than everything. It is switched off, not missing.'],
];

/* ------------------------------------------------------------------ *
 * CERTIFICATIONS AND CLAIMS
 * ------------------------------------------------------------------ */

// CORRECTED 21 October 2026. These rows read "NOT HELD. No report, no audit in progress,
// no auditor engaged." and "NOT HELD." The assessment was assembled from the codebase and
// from production, where a consulting engagement leaves no trace, so it missed a funded
// SOC 2 Type II and ISO 27001 program running since July 2026. "No auditor engaged" is
// still true and is the part that matters to a buyer; "no audit in progress" conflated an
// implementation with an attestation and understated our posture.
const CERTS = [
  ['SOC 2 Type I or II', 'NOT HELD. No report and no auditor engaged. A Type II readiness '
    + 'implementation has run with an external consultancy since July 2026.'],
  ['ISO 27001', 'NOT HELD. A 27001:2022 implementation has run since July 2026; no '
    + 'certification body is engaged.'],
  ['HIPAA', 'NOT APPLICABLE and not attested. No BAA is in place.'],
  ['PCI DSS', 'NOT HELD. Card data is handled by PaySimple; we do not store card numbers.'],
  ['FedRAMP', 'NOT HELD. Also not a prerequisite for the state and local work in C7.0; '
    + 'SOC 2 is what gates hosted products, not federal authorization.'],
];

const CLAIM_EXPOSURE = [
  ['frontend/src/pages/UtilityIOULandingPage.tsx:165',
    '"Built for SOC 2 Type II, NERC CIP, and SOX evidence. Auditor-ready from day one."'],
  ['frontend/src/pages/UtilityIOULandingPage.tsx:67',
    '"NERC CIP, SOC 2, and SOX-aligned audit trails."'],
  ['frontend/src/pages/UtilityCoopLandingPage.tsx:132',
    '"SOC 2 aligned audit trails. ... Full compliance monitoring."'],
  ['frontend/src/pages/UtilityCoopLandingPage.tsx:42',
    '"SOC 2 aligned audit trails and full explainability."'],
];

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function counts() {
  const by = (s) => GAPS.filter((g) => g.sev === s).length;
  return { critical: by(SEV.CRITICAL), high: by(SEV.HIGH), medium: by(SEV.MEDIUM), total: GAPS.length };
}

function headline() {
  const c = counts();
  return `We can pass a mid-market security review on identity hygiene and transport, and we `
    + `cannot pass one on resilience or tenancy. ${c.total} gaps: ${c.critical} critical, `
    + `${c.high} high, ${c.medium} medium. The two critical ones are that there is no database `
    + `backup at all, and that admin access is cross-tenant in production today.`;
}

const SO_WHAT = [
  'THE DECISION THIS ENABLES IS WHETHER TO SELL TO ENTERPRISES NOW OR FIX FIRST, AND THE '
    + 'ANSWER DIFFERS BY GAP. Three of the high-severity items are days of work: a rate limit '
    + 'and lockout on the staff login, dependency scanning with a backend lockfile, and a '
    + 'subprocessor list. Backups are a day. Those four change the answer to a questionnaire '
    + 'materially and none of them is a project.',
  'TWO GAPS ARE NOT FIXABLE BEFORE A DEAL AND SHOULD BE DISCLOSED INSTEAD. Customer SSO does '
    + 'not exist and is a month of work, and the tenancy isolation layer is built but '
    + 'switched off because the membership table is empty. For a single-customer pilot '
    + 'neither is a blocker. For a second concurrent customer, tenancy is.',
  'THE UNCOMFORTABLE ITEM IS THAT WE ALREADY CLAIM MORE THAN WE HOLD. Two routed marketing '
    + 'pages describe SOC 2 aligned audit trails and one says "auditor-ready from day one". '
    + 'We hold no SOC 2 report and none is in progress. Separately our own internal trust '
    + 'rubric scores a CORS allow-list that the code does not have. Both are honest-looking '
    + 'sentences that a security reviewer would ask us to substantiate.',
];

const LIMITS = [
  'This is a code and configuration assessment with live checks against the production site '
    + 'and database. It is not a penetration test and no exploitation was attempted.',
  'TLS configuration is not reviewable here. Cloudflare terminates it and the repository '
    + 'holds no certificate or cipher configuration, so cipher suites and protocol versions '
    + 'are a Cloudflare question.',
  'Human and physical controls are out of scope and unassessed: background checks, '
    + 'onboarding and offboarding, security training, and the datacenter controls of the '
    + 'hosting provider. A real questionnaire asks about all of them.',
  'Severity is judged against a mid-market enterprise buyer. A regulated buyer in health or '
    + 'finance would rate several of the medium items higher.',
];

const DECISION = 'Which gaps to fix and which to disclose. My recommendation is to fix the '
  + 'four cheap ones before the next enterprise conversation, disclose SSO and tenancy as '
  + 'roadmap with dates, and correct the SOC 2 wording on the two utility pages this week, '
  + 'because that one is a claim rather than a gap and it is live now.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** Nothing in this assessment claims a certification we do not hold. */
function assertNoCertificationClaimed() {
  const prose = [headline(), ...SO_WHAT, ...LIMITS, DECISION,
    ...GAPS.map((g) => `${g.gap} ${g.state} ${g.answer}`),
    ...STRENGTHS.map((s) => s.join(' '))].join(' ');
  const bad = /\bwe (are|hold|have) (soc ?2|iso ?27001|hipaa|fedramp|pci)|soc ?2 (certified|compliant)|iso ?27001 (certified|compliant)/i;
  if (bad.test(prose)) throw new Error('the assessment claims a certification we do not hold');
  for (const [, status] of CERTS) {
    if (!/NOT HELD|NOT APPLICABLE/.test(status)) {
      throw new Error('a certification row does not say plainly that it is not held');
    }
  }
  return CERTS.length;
}

/** Every gap carries a domain, a severity, an effort and real evidence. */
function assertEveryGapHasEvidence() {
  const ids = new Set();
  for (const g of GAPS) {
    if (ids.has(g.id)) throw new Error(`duplicate gap id ${g.id}`);
    ids.add(g.id);
    if (!DOMAIN[g.domain]) throw new Error(`${g.id}: ${g.domain} is not a CCM v4.1 domain code`);
    if (!Object.values(SEV).includes(g.sev)) throw new Error(`${g.id}: invalid severity`);
    if (!Object.values(EFFORT).includes(g.effort)) throw new Error(`${g.id}: invalid effort`);
    for (const k of ['gap', 'state', 'answer']) {
      if (!g[k] || g[k].length < 25) throw new Error(`${g.id}: thin ${k}`);
    }
    // Evidence must point at a file:line or be an explicitly dated measurement.
    const hasFile = /[A-Za-z0-9_\-/.]+\.(ts|tsx|js|yml|sh|csv|md):\d+/.test(g.evidence);
    const hasMeasurement = /measured (in production|live)[^.]*\d{4}|Verified:|Searched|No SECURITY\.md/i.test(g.evidence);
    if (!hasFile && !hasMeasurement) {
      throw new Error(`${g.id}: evidence names neither a file:line nor a dated measurement`);
    }
  }
  return GAPS.length;
}

/** An all-gaps report is as misleading as an all-clear. What works must be stated too. */
function assertStrengthsPresent() {
  if (STRENGTHS.length < 5) throw new Error('too few strengths recorded to be a fair picture');
  for (const s of STRENGTHS) {
    if (!s[1] || s[1].length < 40) throw new Error(`thin evidence for strength: ${s[0]}`);
  }
  return STRENGTHS.length;
}

/** The live marketing claims are recorded, because the ticket asks for the uncomfortable list. */
function assertClaimExposureRecorded() {
  if (!CLAIM_EXPOSURE.length) throw new Error('the SOC 2 marketing claims are not recorded');
  for (const [ref] of CLAIM_EXPOSURE) {
    if (!/\.tsx?:\d+/.test(ref)) throw new Error(`claim exposure row has no file:line: ${ref}`);
  }
  const prose = [headline(), ...SO_WHAT, DECISION].join(' ').toLowerCase();
  if (!prose.includes('soc 2')) {
    throw new Error('the summary does not mention the SOC 2 wording exposure, which is a finding');
  }
  return CLAIM_EXPOSURE.length;
}

/** The headline's counts are derived from the gap list, never written. */
function assertHeadlineMatchesGaps() {
  const c = counts();
  if (c.critical + c.high + c.medium !== c.total) throw new Error('severity tally is incomplete');
  const h = headline();
  for (const [label, n] of [['total', c.total], ['critical', c.critical], ['high', c.high], ['medium', c.medium]]) {
    if (!new RegExp(`\\b${n}\\b`).test(h)) throw new Error(`headline omits the ${label} count ${n}`);
  }
  return `${c.critical} critical, ${c.high} high, ${c.medium} medium`;
}

module.exports = {
  AS_OF, DOMAIN, SEV, GAPS, STRENGTHS, CERTS, CLAIM_EXPOSURE, SO_WHAT, LIMITS, DECISION,
  counts, headline,
  assertNoCertificationClaimed, assertEveryGapHasEvidence, assertStrengthsPresent,
  assertClaimExposureRecorded, assertHeadlineMatchesGaps,
};
