#!/usr/bin/env node
/*
 * buildStudentFactBase.js — regenerate the student outreach fact base from LIVE production.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-16 a set of 25 student emails passed their verification gate while
 * describing a system state that a deploy had already made false. The gate was
 * green because its fact base (`people.json`) was a snapshot taken BEFORE the
 * deploy, and nothing in the pipeline could tell that the snapshot had aged out.
 * The generator that produced that snapshot was throwaway code and was lost, so
 * nobody could refresh it either.
 *
 * This script is the committed, re-runnable replacement. It is READ-ONLY against
 * production: every statement is a SELECT, every Gmail call is list/get. It
 * writes exactly one file, the one named by --out.
 *
 * It stamps the output with the production HEAD SHA and a generated-at time.
 * `verify-drafts.js` reads that stamp, re-reads live production HEAD, and refuses
 * to run when they differ. That is what makes a stale fact base a loud failure
 * instead of a silent green.
 *
 * USAGE
 * -----
 *   node scripts/buildStudentFactBase.js --out people.json
 *   node scripts/buildStudentFactBase.js --out people.json --skip-mail
 *   node scripts/buildStudentFactBase.js --out people.json --accept-roster-change
 *
 * Requires: SSH access to the production VPS as root. No credentials are read,
 * written, or logged by this script; the Gmail refresh token stays inside the
 * backend container and is never transmitted to this host.
 *
 * FAILURE MODES HANDLED
 * ---------------------
 *  - SSH unreachable / non-zero exit  -> throws with the remote stderr, exit 1
 *  - psql returns non-JSON            -> throws naming the query, exit 1
 *  - Gmail token exchange fails       -> per-person mail marked unavailable and
 *                                        `mail_fidelity` downgraded, never silently empty
 *  - Roster drift (a project-holding student appears who is not on the roster)
 *                                     -> hard fail unless --accept-roster-change
 *
 * NOT handled: a production schema change that renames a column. That surfaces as
 * a psql error naming the column, which is the correct place to stop.
 */

'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────── configuration

const DEFAULTS = {
  ssh: 'root@95.216.199.47',
  repoPath: '/opt/colaberry-accelerator',
  dbContainer: 'accelerator-db',
  backendContainer: 'accelerator-backend',
  dbUser: 'accelerator',
  dbName: 'accelerator_prod',
  cohortName: 'Cohort - July 2026',
  // The Gmail window used by the original 2026-08-16 fact base, reverse-engineered
  // from the messages it kept: inbound mail from the student, trash excluded,
  // roughly the last 30 days. Recorded verbatim in the output meta so a later
  // reader can tell exactly what was and was not searched.
  mailQuery: 'from:{email} -in:trash newer_than:30d',
};

/**
 * Addresses that are ours, not students'. They own most of the github_connections
 * rows, so any repo-shaped query that forgets them reports nonsense.
 */
const FIXTURE_PATTERNS = [
  /^ali(\+[^@]*)?@colaberry\.(com|ai)$/i,
  /^e2e\+/i,
  /^test\+/i,
  /^system@platform\.colaberry\.ai$/i,
  /^(ram|roselen|swati|vivek|aleem|balamurali|balakrishna\.k|bposorchestrator)@colaberry\.com$/i,
];

/**
 * Flagged do-not-email. Kept in the generator rather than the send runner so the
 * address never enters the fact base at all and cannot be drafted to by accident.
 */
const DO_NOT_EMAIL = [
  { email: 'nzeribeikenna@gmail.com', why: 'do-not-email flag; withdrawn enrollment and an open refund request that is Ali\'s decision' },
];

/**
 * Roster members who hold NO project row and therefore cannot be derived from
 * production by the project rule below.
 *
 * PROVENANCE, STATED PLAINLY: this list is carried forward from the original
 * per-student assessment of 2026-08-16 (run 20260816-student-unblock-and-watch,
 * task T7). It is a human selection, not a machine-derived set. Production holds
 * 19 paid active July seats with no project row; these six are the ones that
 * assessment put on the send list. Re-deriving it from production is not possible
 * because the distinguishing facts lived in the assessment, not in a column.
 */
const EXTRA_ROSTER = [
  'afsbaz77@gmail.com',
  'arinzeohagwu@yahoo.com',
  'jude.mofunanya@gmail.com',
  'mohsinali43@gmail.com',
  'sonya28tx@gmail.com',
  'valobiora@gmail.com',
];

/**
 * Colaberry's shipped wizard placeholder. A student row containing this text is
 * holding OUR example, not their own words, and must never be quoted back to
 * them as "your idea". Source: frontend/src/pages/portal/projects/ProjectWizard.tsx.
 */
const DEMO_VALUES = {
  idea: 'An AI agent that triages my support inbox and drafts replies',
  users: 'Support reps at a 40-person SaaS',
  target_weeks: 6,
};

/** Legacy hand-ticked task lists live on story ids of this shape. */
const LEGACY_STORY_RE = /^p\d+.*-t\d+$/i;

// ─────────────────────────────────────────────────────────────────────── shell

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const SSH = argOf('--ssh', DEFAULTS.ssh);
/**
 * Freshness probe. Prints one JSON line, `{production_head_sha, db_fingerprint}`,
 * and writes nothing. This is what `verify-drafts.js` calls to decide whether the
 * fact base it was handed still describes production. Mail is skipped because no
 * message body feeds the fingerprint, which keeps the probe to a few seconds.
 */
const FINGERPRINT_ONLY = has('--fingerprint-only');
const OUT = argOf('--out');
const SKIP_MAIL = has('--skip-mail') || FINGERPRINT_ONLY;
const ACCEPT_ROSTER_CHANGE = has('--accept-roster-change') || FINGERPRINT_ONLY;

if (!OUT && !FINGERPRINT_ONLY) {
  console.error('buildStudentFactBase: --out <path> is required (or --fingerprint-only)');
  process.exit(2);
}

/**
 * The projection of production that the drafts actually make claims about.
 *
 * A code deploy moves the HEAD SHA, but the 2026-08-16 near-miss was caused by a
 * DATABASE write (the project-name backfill) with no deploy behind it. A SHA
 * check alone would not have caught it. This fingerprint does: it covers every
 * fact a draft asserts, so any change to one of them invalidates the fact base.
 *
 * Deliberately excludes mail and free text. Those grow constantly and would make
 * the fingerprint churn without any draft becoming untrue.
 */
function dbFingerprint(people) {
  const projection = people
    .map((p) => [
      p.email, p.project_id, p.project_name, p.organization_name,
      p.has_published_plan, p.has_story000, p.story000_status, p.story000_due,
      p.has_answers, p.answers_count, p.idea_is_demo_text,
      p.login_candidate_count, p.login_outcome, p.login_resolves_to_id,
      p.repo_connected, p.legacy_ticked,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

function ssh(remoteCommand, { stdin, label } = {}) {
  try {
    return execFileSync(
      'ssh',
      ['-o', 'ConnectTimeout=25', '-o', 'BatchMode=yes', SSH, remoteCommand],
      { input: stdin, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000 },
    );
  } catch (err) {
    const stderr = (err.stderr || '').toString().trim();
    throw new Error(`ssh failed${label ? ` during ${label}` : ''} (exit ${err.status}): ${stderr || err.message}`);
  }
}

/**
 * Run one SELECT and parse its single JSON column.
 *
 * -Atc gives unaligned, tuples-only output so the result is exactly the JSON text
 * and nothing else. The query is passed as a single argv element, never
 * interpolated into a shell string with user data in it.
 */
function psqlJson(sql, label) {
  const wrapped = sql.replace(/\s+/g, ' ').trim();
  const remote =
    `docker exec ${DEFAULTS.dbContainer} psql -U ${DEFAULTS.dbUser} -d ${DEFAULTS.dbName} ` +
    `-Atc ${shellQuote(wrapped)}`;
  const raw = ssh(remote, { label }).trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`query "${label}" did not return JSON. First 300 chars: ${raw.slice(0, 300)}`);
  }
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Ship a dependency-free JS payload into the running backend container and run it.
 *
 * Deliberately NOT a backend/src/scripts/*.ts: this repo has no `allowJs`, and a
 * new .ts would only reach dist through a deploy. This path needs no deploy, and
 * a fact-base refresh must never require one.
 */
function runInBackend(source, label) {
  // Capped retry, because the production box runs concurrent deploys and a
  // `docker compose up --build` next door has SIGKILLed this read before
  // (exit 137). Three attempts with a widening pause, then give up loudly:
  // an unbounded retry against production is explicitly forbidden.
  const attempts = 3;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const remoteTmp = `/tmp/cbfb-${process.pid}-${Date.now()}-${i}.js`;
    const remote =
      `cat > ${remoteTmp} && docker cp ${remoteTmp} ${DEFAULTS.backendContainer}:${remoteTmp} >/dev/null && ` +
      `docker exec ${DEFAULTS.backendContainer} node ${remoteTmp}; rc=$?; ` +
      `docker exec ${DEFAULTS.backendContainer} rm -f ${remoteTmp} >/dev/null 2>&1; rm -f ${remoteTmp}; exit $rc`;
    try {
      return ssh(remote, { stdin: source, label });
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        console.error(`  ${label} attempt ${i} failed (${err.message.slice(0, 120)}); retrying`);
        execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${i * 5000})`]);
      }
    }
  }
  throw lastErr;
}

const isFixture = (email) => FIXTURE_PATTERNS.some((re) => re.test(email));
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

// ───────────────────────────────────────────────────────── production identity

function productionHead() {
  const sha = ssh(`git -C ${DEFAULTS.repoPath} rev-parse HEAD`, { label: 'reading production HEAD' }).trim();
  const branch = ssh(`git -C ${DEFAULTS.repoPath} rev-parse --abbrev-ref HEAD`, { label: 'reading production branch' }).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`production HEAD is not a SHA: "${sha}"`);
  return { sha, branch };
}

// ────────────────────────────────────────────────────────────────── DB queries

function fetchEnrollments(cohortName) {
  // Every active, portal-enabled enrollment in the cohort, plus the mgmt_role
  // that pickBestEnrollment ranks on. Withdrawn rows are pulled too, separately,
  // because "this address also has a withdrawn duplicate" is a fact the drafts
  // depend on.
  return psqlJson(
    `select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
       select e.id, lower(e.email) as email, e.full_name, e.status, e.portal_enabled,
              e.enrollment_type, e.payment_status, e.created_at, e.portal_token_expires_at,
              cm.mgmt_role
         from enrollments e
         join cohorts c on c.id = e.cohort_id
         left join community_members cm on cm.enrollment_id = e.id
        where c.name = ${sqlLit(cohortName)}
        order by e.email, e.created_at
     ) r`,
    'enrollments',
  );
}

function fetchProjects() {
  return psqlJson(
    `select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
       select p.id, p.enrollment_id, p.name, p.organization_name, p.github_repo_url, p.created_at
         from projects p
     ) r`,
    'projects',
  );
}

function fetchIntake() {
  return psqlJson(
    `select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
       select bi.project_id, bi.idea, bi.name, bi.users, bi.target_weeks, bi.status,
              case when jsonb_typeof(bi.answers::jsonb) = 'array'
                   then jsonb_array_length(bi.answers::jsonb) else 0 end as answers_count
         from build_intake bi
     ) r`,
    'build_intake',
  );
}

function fetchPlans() {
  return psqlJson(
    `select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
       select bp.project_id, bp.status, bp.version, bp.published_at
         from build_plans bp
     ) r`,
    'build_plans',
  );
}

function fetchTasks() {
  return psqlJson(
    `select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
       select st.project_id, st.story_id, st.status, st.due_on, st.verified_at,
              case when jsonb_typeof(st.acceptance::jsonb) = 'array'
                   then jsonb_array_length(st.acceptance::jsonb) else 0 end as acceptance_count
         from student_tasks st
     ) r`,
    'student_tasks',
  );
}

function fetchRepos() {
  return psqlJson(
    `select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
       select gc.enrollment_id, gc.project_id, gc.repo_url, gc.repo_owner, gc.repo_name, gc.last_sync_at
         from github_connections gc
     ) r`,
    'github_connections',
  );
}

const sqlLit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ──────────────────────────────────────────────────────────── deployed ranking

/**
 * A faithful port of `pickBestEnrollment` from
 * backend/src/services/participantService.ts. Kept in sync BY HAND, which is a
 * real risk, so the rank tuple is written in the same order and commented with
 * the same meaning. If the deployed function changes, this must change with it.
 *
 * Candidates must already be filtered to { status: 'active', portal_enabled: true },
 * which is what `requestMagicLink` does before calling it.
 */
function pickBestEnrollment(candidates) {
  if (!candidates.length) return null;
  const rank = (e) => [
    e.mgmt_role ? 0 : 1,
    e.enrollment_type === 'explorer' ? 1 : 0,
    e.payment_status === 'paid' ? 0 : 1,
    -new Date(e.created_at || 0).getTime(),
  ];
  return [...candidates].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  })[0];
}

// ─────────────────────────────────────────────────────────────────────── Gmail

/**
 * The payload that runs inside the backend container. Dependency-free on purpose:
 * it uses Node 20's global fetch against the REST API rather than `googleapis`,
 * so it does not care what is or is not installed in the image.
 *
 * READ-ONLY: messages.list and messages.get only. No modify, no trash, no send.
 */
function mailPayload(emails, queryTemplate) {
  return `
'use strict';
const EMAILS = ${JSON.stringify(emails)};
const Q = ${JSON.stringify(queryTemplate)};

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('token exchange failed with HTTP ' + r.status);
  const j = await r.json();
  if (!j.access_token) throw new Error('token exchange returned no access_token');
  return j.access_token;
}

const decode = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function plainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) return decode(payload.body.data);
  for (const p of payload.parts || []) { const t = plainText(p); if (t) return t; }
  return '';
}

/**
 * Reduce a message to the words THIS PERSON TYPED, dropping everything they
 * merely carried along: the quoted reply chain, forwarded receipts, and Outlook's
 * header divider.
 *
 * This is a correctness boundary, not tidying. The gate asserts that a sentence
 * quoted back to a student appears "in that person's own mail". If a forwarded
 * Zendesk reply or a quoted paragraph of Ali's own writing stays in the corpus,
 * that assertion silently becomes false and the gate would happily approve
 * quoting Ali's words back to Ali's student as if they were the student's.
 *
 * Deliberately conservative: when in doubt it cuts, so the corpus is a subset of
 * what the person wrote rather than a superset.
 */
function ownWords(text) {
  const cuts = [
    /\\r?\\n?On .{5,120}wrote:/,                       // Gmail reply chain
    /\\r?\\n-{2,} ?Forwarded message ?-{2,}/i,          // Gmail forward
    /\\r?\\n_{10,}/,                                    // Outlook divider
    /\\r?\\nFrom: .{3,120}\\r?\\nSent: /i,               // Outlook header block
    /\\r?\\nBegin forwarded message:/i,                 // Apple Mail
  ];
  let end = text.length;
  for (const re of cuts) {
    const m = re.exec(text);
    if (m && m.index < end) end = m.index;
  }
  return text.slice(0, end).replace(/\\r\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
}

(async () => {
  let token;
  try { token = await accessToken(); }
  catch (e) { console.log(JSON.stringify({ ok: false, error: e.message, mailboxes: {} })); return; }
  const H = { authorization: 'Bearer ' + token };

  let mailbox = null;
  try {
    const p = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H })).json();
    mailbox = p.emailAddress || null;
  } catch { /* reported as null below */ }

  const out = {};
  const errors = {};
  for (const email of EMAILS) {
    try {
      const q = encodeURIComponent(Q.replace('{email}', email));
      const list = await (await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=' + q, { headers: H })).json();
      const msgs = [];
      for (const m of list.messages || []) {
        const full = await (await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', { headers: H })).json();
        const h = {};
        for (const x of (full.payload && full.payload.headers) || []) h[x.name.toLowerCase()] = x.value;
        msgs.push({ date: h.date || null, subject: h.subject || '', body: ownWords(plainText(full.payload)) });
      }
      msgs.sort((a, b) => new Date(a.date) - new Date(b.date));
      out[email] = msgs;
    } catch (e) {
      errors[email] = e.message;
      out[email] = null;
    }
  }
  console.log(JSON.stringify({ ok: true, mailbox, messages: out, errors }));
})().catch((e) => { console.log(JSON.stringify({ ok: false, error: e.message, mailboxes: {} })); });
`;
}

function fetchMail(emails, queryTemplate) {
  const raw = runInBackend(mailPayload(emails, queryTemplate), 'reading Gmail');
  const line = raw.trim().split(/\r?\n/).filter(Boolean).pop();
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`Gmail payload did not return JSON. Last line: ${String(line).slice(0, 300)}`);
  }
  return parsed;
}

// ───────────────────────────────────────────────────────────────────── assemble

function main() {
  const startedAt = new Date();
  console.error('reading production HEAD...');
  const head = productionHead();
  console.error(`  production HEAD = ${head.sha.slice(0, 8)} on ${head.branch}`);

  console.error('reading production database (read-only)...');
  const enrollments = fetchEnrollments(DEFAULTS.cohortName);
  const projects = fetchProjects();
  const intake = fetchIntake();
  const plans = fetchPlans();
  const tasks = fetchTasks();
  const repos = fetchRepos();
  console.error(`  ${enrollments.length} cohort enrollments, ${projects.length} projects, ${intake.length} intake rows`);

  const projectsByEnrollment = new Map();
  for (const p of projects) {
    if (!projectsByEnrollment.has(p.enrollment_id)) projectsByEnrollment.set(p.enrollment_id, []);
    projectsByEnrollment.get(p.enrollment_id).push(p);
  }
  const intakeByProject = new Map(intake.map((r) => [r.project_id, r]));
  const plansByProject = new Map();
  for (const b of plans) {
    if (!plansByProject.has(b.project_id)) plansByProject.set(b.project_id, []);
    plansByProject.get(b.project_id).push(b);
  }
  const tasksByProject = new Map();
  for (const t of tasks) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id).push(t);
  }
  const repoByProject = new Map(repos.filter((r) => r.project_id).map((r) => [r.project_id, r]));

  // ── roster ────────────────────────────────────────────────────────────────
  const byEmail = new Map();
  for (const e of enrollments) {
    if (!byEmail.has(e.email)) byEmail.set(e.email, []);
    byEmail.get(e.email).push(e);
  }

  const blocked = new Set(DO_NOT_EMAIL.map((d) => d.email.toLowerCase()));
  const derived = [];
  for (const [email, rows] of byEmail) {
    if (isFixture(email) || blocked.has(email)) continue;
    const active = rows.filter((r) => r.status === 'active' && r.portal_enabled);
    if (!active.length) continue;
    const holdsProject = active.some((r) => (projectsByEnrollment.get(r.id) || []).length > 0);
    if (holdsProject) derived.push(email);
  }
  const roster = [...new Set([...derived, ...EXTRA_ROSTER.map((e) => e.toLowerCase())])]
    .filter((e) => !blocked.has(e))
    .sort();

  // Drift alarm. A project-holding student who is not on the roster is a person
  // about to be silently left out of a cohort-wide send, which is exactly the
  // class of miss this fact base exists to prevent.
  const missing = derived.filter((e) => !roster.includes(e));
  if (missing.length && !ACCEPT_ROSTER_CHANGE) {
    console.error(`ROSTER DRIFT: ${missing.join(', ')} hold projects but are not on the roster.`);
    console.error('Re-run with --accept-roster-change once you have decided what to do about them.');
    process.exit(3);
  }

  // ── mail ──────────────────────────────────────────────────────────────────
  let mail = { ok: false, mailbox: null, messages: {}, errors: {} };
  let mailFidelity;
  if (SKIP_MAIL) {
    mailFidelity = { level: 'NONE', why: '--skip-mail was passed; no message bodies were read' };
  } else {
    console.error(`reading Gmail for ${roster.length} addresses (list + get only)...`);
    mail = fetchMail(roster, DEFAULTS.mailQuery);
    if (!mail.ok) {
      mailFidelity = { level: 'NONE', why: `Gmail unavailable: ${mail.error}` };
      console.error(`  Gmail unavailable: ${mail.error}`);
    } else {
      const failed = Object.keys(mail.errors || {});
      mailFidelity = failed.length
        ? { level: 'PARTIAL', why: `read failed for ${failed.join(', ')}`, failed }
        : { level: 'FULL', why: `mailbox ${mail.mailbox}, query "${DEFAULTS.mailQuery}"` };
      console.error(`  mailbox ${mail.mailbox}, ${Object.values(mail.messages).filter(Boolean).reduce((n, m) => n + m.length, 0)} messages`);
    }
  }

  // ── people ────────────────────────────────────────────────────────────────
  const people = [];
  for (const email of roster) {
    const rows = byEmail.get(email) || [];
    const candidates = rows.filter((r) => r.status === 'active' && r.portal_enabled);
    const picked = pickBestEnrollment(candidates);
    const enrollment = picked || rows[0] || null;

    const projectRows = enrollment ? (projectsByEnrollment.get(enrollment.id) || []) : [];
    // When one enrollment somehow carries several projects, the one holding a
    // published plan is the real build; ties fall back to newest.
    const project = projectRows.slice().sort((a, b) => {
      const pa = (plansByProject.get(a.id) || []).some((x) => x.status === 'published') ? 0 : 1;
      const pb = (plansByProject.get(b.id) || []).some((x) => x.status === 'published') ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at) - new Date(a.created_at);
    })[0] || null;

    const bi = project ? intakeByProject.get(project.id) : null;
    const projectPlans = project ? (plansByProject.get(project.id) || []) : [];
    const published = projectPlans.filter((p) => p.status === 'published');
    const projectTasks = project ? (tasksByProject.get(project.id) || []) : [];
    const story000 = projectTasks.find((t) => t.story_id === 'STORY-000') || null;
    const repo = project ? repoByProject.get(project.id) : null;

    const ideaIsDemo = !!bi && norm(bi.idea).startsWith(norm(DEMO_VALUES.idea));
    const contaminated = [];
    if (ideaIsDemo) contaminated.push('idea');
    if (bi && norm(bi.users) === norm(DEMO_VALUES.users)) contaminated.push('users');
    if (bi && Number(bi.target_weeks) === DEMO_VALUES.target_weeks) contaminated.push('target_weeks');

    const messages = mail.messages && mail.messages[email] ? mail.messages[email] : [];
    const mailUnavailable = !mail.ok || SKIP_MAIL || mail.messages[email] === null;

    people.push({
      email,
      full_name: enrollment ? enrollment.full_name : null,
      enrollment_id: enrollment ? enrollment.id : null,

      project_id: project ? project.id : null,
      project_name: project ? project.name : null,
      organization_name: project ? project.organization_name : null,

      idea: bi ? bi.idea : null,
      idea_is_demo_text: ideaIsDemo,
      demo_contaminated_fields: contaminated,
      answers_count: bi ? Number(bi.answers_count) : 0,
      has_answers: !!bi && Number(bi.answers_count) > 0,

      plan_status: published.length ? 'published' : (projectPlans[0] ? projectPlans[0].status : null),
      has_published_plan: published.length > 0,

      has_story000: !!story000,
      story000_status: story000 ? story000.status : null,
      story000_due: story000 ? story000.due_on : null,
      story000_verified_at: story000 ? story000.verified_at : null,
      acceptance_count: story000 ? Number(story000.acceptance_count) : 0,

      repo_connected: !!repo && !!repo.repo_url,
      total_tasks: projectTasks.length,
      legacy_ticked: projectTasks.filter((t) => t.status === 'complete' && LEGACY_STORY_RE.test(String(t.story_id || ''))).length,

      login_candidate_count: candidates.length,
      login_outcome: candidates.length ? 'LINK_WOULD_BE_SENT'
        : (rows.some((r) => r.status === 'active') ? 'PORTAL_DISABLED' : 'NO_ACTIVE_ENROLLMENT'),
      login_resolves_to_id: picked ? picked.id : null,
      login_resolves_to_project: project ? project.id : null,
      token_expires_at: enrollment ? enrollment.portal_token_expires_at : null,

      withdrawn_duplicate_count: rows.filter((r) => r.status !== 'active').length,

      messages,
      wrote_in: messages.length > 0,
      mail_unavailable: mailUnavailable,
    });
  }

  const fingerprint = dbFingerprint(people);

  if (FINGERPRINT_ONLY) {
    process.stdout.write(JSON.stringify({
      production_head_sha: head.sha,
      production_branch: head.branch,
      db_fingerprint: fingerprint,
      probed_at: new Date().toISOString(),
    }) + '\n');
    return;
  }

  const payload = {
    meta: {
      generator: 'scripts/buildStudentFactBase.js',
      generator_contract: 2,
      generated_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      production_head_sha: head.sha,
      db_fingerprint: fingerprint,
      production_branch: head.branch,
      production_host: SSH,
      cohort: DEFAULTS.cohortName,
      roster_size: people.length,
      sources: {
        database: `${DEFAULTS.dbName} via docker exec ${DEFAULTS.dbContainer} psql (SELECT only)`,
        tables: ['enrollments', 'cohorts', 'community_members', 'projects', 'build_intake', 'build_plans', 'student_tasks', 'github_connections'],
        mail: SKIP_MAIL ? null : `Gmail API users.messages.list + get as ${mail.mailbox || 'unknown'}, query "${DEFAULTS.mailQuery}"`,
        login_resolution: 'pickBestEnrollment ported by hand from backend/src/services/participantService.ts',
      },
      fidelity: {
        mail: mailFidelity,
        roster: {
          derived_rule: 'active + portal_enabled enrollments in the cohort, non-fixture, holding at least one project row',
          carried_forward: EXTRA_ROSTER,
          carried_forward_why: 'project-less send-list members selected by the 2026-08-16 T7 assessment; not derivable from a production column',
          excluded: DO_NOT_EMAIL,
        },
      },
    },
    people,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + '\n', 'utf8');
  console.error(`\nwrote ${OUT}`);
  console.error(`  ${people.length} people, stamped to production ${head.sha.slice(0, 8)}`);
  console.error(`  mail fidelity: ${mailFidelity.level} (${mailFidelity.why})`);
  const named = people.filter((p) => p.project_name).length;
  console.error(`  ${named} of ${people.filter((p) => p.project_id).length} projects carry a name`);
}

try {
  main();
} catch (err) {
  console.error(`buildStudentFactBase FAILED: ${err.message}`);
  process.exit(1);
}
