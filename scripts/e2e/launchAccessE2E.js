#!/usr/bin/env node
/**
 * End-to-end check: can a given person sign in to app.colaberry.com and do what Rob does?
 *
 * WHY THIS EXISTS
 *
 * On 2026-11-11 a CCPP profile row was created for a colleague taking over Rob's launch-grading
 * work, and the obvious next question - "can he actually do it now?" - turned out to have a
 * different answer from the one the database suggested. app.colaberry.com does not authenticate
 * against CCPP at all. It redirects to Auth0. The CCPP row is a PROFILE; the CREDENTIAL lives in a
 * system this repo holds no keys for. A check that only looked at CCPP would have reported success
 * and been wrong.
 *
 * So this script walks the whole path in order and stops at the first step that genuinely cannot
 * be completed, naming what is missing. It never infers a later step from an earlier one.
 *
 * USAGE
 *   node scripts/e2e/launchAccessE2E.js --email someone@colaberry.com
 *   node scripts/e2e/launchAccessE2E.js --email x@y.com --create   # make a disposable profile
 *   node scripts/e2e/launchAccessE2E.js --email x@y.com --cleanup  # retire what --create made
 *
 * Run it inside accelerator-backend, where the CCPP credentials live. It is read-only unless
 * --create or --cleanup is passed, and --cleanup only ever touches a row this script created
 * (it refuses any account that has ever logged in).
 *
 * EXIT CODES
 *   0  every step that could run, passed
 *   1  a step failed
 *   2  a step is BLOCKED on something this environment does not have (not a failure of the user)
 */
const { Sequelize, QueryTypes } = require('/app/node_modules/sequelize');
const https = require('https');

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const EMAIL = arg('email');
const ROB_ID = 39495;                      // Robelyn Florague - the capability baseline
const APP = 'https://app.colaberry.com';

if (!EMAIL) { console.error('--email is required'); process.exit(1); }

const ms = new Sequelize(
  process.env.MSSQL_DATABASE || 'CCPP',
  process.env.MSSQL_USER,
  process.env.MSSQL_PASS,
  {
    host: process.env.MSSQL_HOST,
    port: Number(process.env.MSSQL_PORT || 1433),
    dialect: 'mssql',
    logging: false,
    dialectOptions: { options: { encrypt: true, trustServerCertificate: true, requestTimeout: 60000 } },
  },
);
const q = (text, opts = {}) => ms.query(text, { type: QueryTypes.SELECT, ...opts });

const results = [];
const record = (name, state, detail) => {
  results.push({ name, state, detail });
  const mark = { PASS: 'PASS   ', FAIL: 'FAIL   ', BLOCKED: 'BLOCKED', INFO: 'INFO   ' }[state];
  console.log(`  [${mark}] ${name}`);
  String(detail).split('\n').forEach((l) => console.log(`            ${l}`));
};

/** Follow redirects without a browser, so the identity provider is observed rather than assumed. */
const head = (url, depth = 0) => new Promise((resolve) => {
  if (depth > 5) return resolve({ status: 0, location: null, url });
  https.get(url, { headers: { 'User-Agent': 'colaberry-access-check' } }, (res) => {
    res.resume();
    const loc = res.headers.location;
    if (loc && res.statusCode >= 300 && res.statusCode < 400) {
      const next = loc.startsWith('http') ? loc : new URL(loc, url).toString();
      return resolve(head(next, depth + 1));
    }
    resolve({ status: res.statusCode, location: null, url });
  }).on('error', (e) => resolve({ status: 0, error: e.message, url }));
});

(async () => {
  console.log(`\nEnd-to-end launch-grading access check for ${EMAIL}`);
  console.log(`Baseline: Rob (UserID ${ROB_ID}), whose capability set is measured, not assumed.\n`);

  // ---------------------------------------------------------------- step 0
  console.log('STEP 0  What Rob can actually do (the bar to clear)');
  const robCaps = (await q(`
    SELECT (SELECT COUNT(*) FROM [dbo].[ADF_CAP_Launch_Activity] WHERE Graded_By = ${ROB_ID}) AS Graded,
           (SELECT MAX(Graded_Date) FROM [dbo].[ADF_CAP_Launch_Activity] WHERE Graded_By = ${ROB_ID}) AS LastGraded,
           (SELECT COUNT(*) FROM [dnnuser].[UserRoles] WHERE UserID = ${ROB_ID}) AS Roles,
           (SELECT COUNT(*) FROM [dbo].[ADF_GroupAdmins] WHERE UserID = ${ROB_ID}) AS GroupAdmin,
           (SELECT COUNT(*) FROM [dbo].[ADF_NETWORK_ACCESS] WHERE UserID = ${ROB_ID}) AS NetAccess,
           (SELECT COUNT(*) FROM [dbo].[ADF_UserLogon] WHERE UserID = ${ROB_ID}) AS Logons,
           (SELECT PreUserID FROM [dnnuser].[Users] WHERE UserID = ${ROB_ID}) AS PreUserID`))[0];
  record('Rob\'s measured capability', 'INFO',
    `graded ${robCaps.Graded} launch steps, last ${String(robCaps.LastGraded).slice(0, 24)}\n`
    + `holds roles=${robCaps.Roles} groupAdmin=${robCaps.GroupAdmin} networkAccess=${robCaps.NetAccess}\n`
    + `has logged in ${robCaps.Logons} times; PreUserID=${robCaps.PreUserID}\n`
    + 'Note she holds NO access rows. The grading right is not expressed in this database.');

  // ---------------------------------------------------------------- step 1
  console.log('\nSTEP 1  Which system actually authenticates app.colaberry.com?');
  const landing = await head(APP);
  const isAuth0 = /auth0|login\.refactored\.ai/i.test(landing.url);
  record('resolve the identity provider', isAuth0 ? 'PASS' : 'FAIL',
    `${APP} ends at ${landing.url.slice(0, 110)}\n`
    + (isAuth0
      ? 'That is Auth0 (tenant refactored-ai). The login credential is NOT in CCPP.'
      : 'Expected an Auth0 redirect and did not get one; the rest of this check assumes the wrong model.'));

  // ---------------------------------------------------------------- step 2
  console.log('\nSTEP 2  Does a CCPP profile exist for this person?');
  if (has('create')) {
    const u = 'e2e' + Math.random().toString(36).slice(2, 7);
    await ms.query(
      `INSERT INTO [dnnuser].[Users]
         (Username, FirstName, LastName, IsSuperUser, Email, DisplayName, UpdatePassword, IsDeleted,
          CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
       VALUES ('${u}', 'E2E', 'Probe', 0, '${EMAIL}', '${u}', 0, 0, 684, GETUTCDATE(), 684, GETUTCDATE())`,
      { type: QueryTypes.INSERT });
    record('created a disposable profile', 'INFO', `username ${u} for ${EMAIL}`);
  }

  const prof = await q(`
    SELECT UserID, Username, Email, IsDeleted, PreUserID, CreatedOnDate,
           (SELECT COUNT(*) FROM [dbo].[ADF_UserLogon] l WHERE l.UserID = u.UserID) AS Logons
      FROM [dnnuser].[Users] u WHERE Email = '${EMAIL}'`);
  record('CCPP profile row', prof.length === 1 ? 'PASS' : (prof.length ? 'FAIL' : 'FAIL'),
    prof.length
      ? prof.map((p) => `#${p.UserID} ${p.Username} deleted=${p.IsDeleted} PreUserID=${p.PreUserID} logons=${p.Logons}`).join('\n')
        + (prof.length > 1 ? '\nMORE THAN ONE ROW - the app may bind to either.' : '')
      : 'no profile for this address');

  // ---------------------------------------------------------------- step 3
  console.log('\nSTEP 3  Is the profile shaped the way working accounts are?');
  const shape = (await q(`
    SELECT SUM(CASE WHEN PreUserID IS NULL THEN 1 ELSE 0 END) AS NoPre,
           COUNT(*) AS Total
      FROM [dnnuser].[Users] WHERE CreatedOnDate > '2025-01-01'`))[0];
  const mine = prof[0];
  if (mine) {
    const pct = ((shape.Total - shape.NoPre) / shape.Total * 100).toFixed(0);
    record('PreUserID present', mine.PreUserID ? 'PASS' : 'FAIL',
      `this profile: PreUserID=${mine.PreUserID ?? 'NULL'}\n`
      + `${pct}% of accounts created since 2025 carry one (${shape.Total - shape.NoPre} of ${shape.Total}).\n`
      + (mine.PreUserID
        ? 'Matches the normal shape.'
        : 'A hand-inserted row is missing the link the signup funnel sets. Rob has one (54017).'));
  }

  // ---------------------------------------------------------------- step 4
  console.log('\nSTEP 4  Can we sign in as this person?');
  const haveAuth0 = Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET);
  record('authenticate against Auth0', haveAuth0 ? 'INFO' : 'BLOCKED',
    haveAuth0
      ? 'Auth0 credentials present; implement the password grant here.'
      : 'No AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET in this environment.\n'
        + 'Nothing in this repo or the backend container can create an Auth0 identity or\n'
        + 'sign in as one, so this step cannot run and NO claim can be made about whether\n'
        + 'this person can log in. It is blocked, which is not the same as failing.');

  // ---------------------------------------------------------------- step 5
  console.log('\nSTEP 5  With a session, could they do Rob\'s work?');
  record('grade a launch step', 'BLOCKED',
    'Requires step 4. The assertions, ready to run once a session exists:\n'
    + '  a. GET the launch dashboard and expect the grading queue, not a redirect to login\n'
    + '  b. open one submitted step and expect its upload link to be readable\n'
    + '  c. confirm the grade control is present (Rob sets CAP_Launch_ActivityStatus and\n'
    + '     InstructorComments; the writes land in ADF_CAP_Launch_Activity.Graded_By)\n'
    + 'Do NOT grade a real student to prove this. Verify the control renders, then have\n'
    + 'the person grade one genuine submission and check Graded_By carries their UserID.');

  // ---------------------------------------------------------------- cleanup
  if (has('cleanup') && mine) {
    if (mine.Logons > 0) {
      record('cleanup refused', 'FAIL', `#${mine.UserID} has ${mine.Logons} logins; this is a real account, not a probe.`);
    } else {
      await ms.query(`UPDATE [dnnuser].[Users] SET IsDeleted = 1, LastModifiedOnDate = GETUTCDATE()
                       WHERE UserID = ${mine.UserID} AND Email = '${EMAIL}'`, { type: QueryTypes.UPDATE });
      record('retired the probe profile', 'INFO', `#${mine.UserID} IsDeleted = 1`);
    }
  }

  // ---------------------------------------------------------------- verdict
  const fails = results.filter((r) => r.state === 'FAIL');
  const blocked = results.filter((r) => r.state === 'BLOCKED');
  console.log('\n' + '='.repeat(72));
  console.log(`VERDICT for ${EMAIL}`);
  console.log(`  passed  ${results.filter((r) => r.state === 'PASS').length}`);
  console.log(`  failed  ${fails.length}${fails.length ? ': ' + fails.map((f) => f.name).join(', ') : ''}`);
  console.log(`  blocked ${blocked.length}${blocked.length ? ': ' + blocked.map((b) => b.name).join(', ') : ''}`);
  console.log('');
  if (blocked.length) {
    console.log('  NOT CONFIRMED. The login step could not run, so this check cannot say');
    console.log('  whether this person can sign in or grade. Anyone reading only the passes');
    console.log('  would reach the wrong conclusion.');
  } else if (!fails.length) {
    console.log('  CONFIRMED end to end.');
  }
  console.log('='.repeat(72) + '\n');

  await ms.close();
  process.exit(fails.length ? 1 : (blocked.length ? 2 : 0));
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
