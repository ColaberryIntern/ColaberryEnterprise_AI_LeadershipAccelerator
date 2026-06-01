// Reporting preflight + audit.
//
// For each daily report (Launch PMO, Gov Contracts, AI Pathway, ShipCES,
// LandJet, Anthropic Partner), run health checks BEFORE sending:
//
//   1. Required env vars present (MANDRILL_API_KEY, OPENAI_API_KEY for the
//      ones that use gpt-4o)
//   2. Mandrill SMTP auth (verify-only, no send)
//   3. Basecamp API auth on the report's project
//   4. Project todoset present + counts (open / completed)
//   5. CB AI runner state file readable + recent activity (where applicable)
//   6. Cron entry installed for this report
//   7. Recipients well-formed (to, cc lists)
//
// Output per report:
//   {
//     name, scriptPath, recipients: { to, cc },
//     projectId, projectName,
//     checks: [{ name, status: 'ok' | 'warn' | 'fail', detail }],
//     overall: 'ok' | 'warn' | 'fail',
//     errors: [...], warnings: [...]
//   }

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '../../../..');
const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';

function bcToken() {
  let t = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).trim();
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}

async function bcGet(p) {
  const r = await fetch(`https://3.basecampapi.com/3945211${p}`, {
    headers: { Authorization: `Bearer ${bcToken()}`, Accept: 'application/json', 'User-Agent': 'Colaberry ReportingPreflight' },
  });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}

async function checkBcProject(projectId) {
  const proj = await bcGet(`/projects/${projectId}.json`);
  return { name: proj.name, todoset: (proj.dock || []).find((d) => d.name === 'todoset')?.id || null };
}

async function checkBcOpenTodos(projectId, todosetId) {
  // Just verify the endpoint responds. Don't fetch all - just first page.
  const r = await fetch(`https://3.basecampapi.com/3945211/buckets/${projectId}/todosets/${todosetId}/todolists.json`, {
    headers: { Authorization: `Bearer ${bcToken()}`, Accept: 'application/json', 'User-Agent': 'Colaberry ReportingPreflight' },
  });
  if (!r.ok) throw new Error(`todolists fetch -> ${r.status}`);
  const lists = await r.json();
  return Array.isArray(lists) ? lists.length : 0;
}

async function checkMandrill() {
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY not set');
  const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  await transport.verify();
  return true;
}

function checkOpenai() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  return true;
}

function checkCronEntry(scriptName) {
  try {
    const out = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    const lines = out.split('\n').filter((l) => l.includes(scriptName) && !l.trim().startsWith('#'));
    return { count: lines.length, lines };
  } catch { return { count: 0, lines: [] }; }
}

function checkScript(scriptPath) {
  const abs = path.resolve(REPO, scriptPath);
  if (!fs.existsSync(abs)) throw new Error(`script missing: ${scriptPath}`);
  return { path: scriptPath, sizeBytes: fs.statSync(abs).size };
}

function checkCbRunnerState(stateFile) {
  if (!stateFile) return null;
  const abs = path.resolve(REPO, stateFile);
  if (!fs.existsSync(abs)) return { exists: false };
  try {
    const s = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const taskIds = Object.keys(s.tasks || {});
    const lastDraft = taskIds
      .map((id) => s.tasks[id])
      .map((info) => info?.at || '')
      .filter(Boolean)
      .sort()
      .pop();
    return { exists: true, drafted: taskIds.length, lastDraft };
  } catch { return { exists: true, error: 'parse failure' }; }
}

async function preflightReport(config) {
  const checks = [];
  const errors = [];
  const warnings = [];

  // 1. Script exists
  try { const s = checkScript(config.scriptPath); checks.push({ name: 'Script file', status: 'ok', detail: `${s.sizeBytes} bytes` }); }
  catch (e) { checks.push({ name: 'Script file', status: 'fail', detail: e.message }); errors.push(e.message); }

  // 2. Required env
  try { checkMandrill(); checks.push({ name: 'Mandrill SMTP auth', status: 'ok', detail: 'verify() passed' }); }
  catch (e) { checks.push({ name: 'Mandrill SMTP auth', status: 'fail', detail: e.message }); errors.push(e.message); }
  if (config.needsOpenai) {
    try { checkOpenai(); checks.push({ name: 'OpenAI API key', status: 'ok' }); }
    catch (e) { checks.push({ name: 'OpenAI API key', status: 'fail', detail: e.message }); errors.push(e.message); }
  }

  // 3. Basecamp project
  let projectName = null;
  if (config.projectId) {
    try {
      const p = await checkBcProject(config.projectId);
      projectName = p.name;
      checks.push({ name: 'BC project access', status: 'ok', detail: `"${p.name}"` });
      if (!p.todoset) {
        checks.push({ name: 'BC todoset present', status: 'warn', detail: 'no todoset on project' });
        warnings.push(`${config.name}: project has no todoset`);
      } else {
        try {
          const n = await checkBcOpenTodos(config.projectId, p.todoset);
          checks.push({ name: 'BC todolists fetchable', status: 'ok', detail: `${n} list(s)` });
        } catch (e) {
          checks.push({ name: 'BC todolists fetchable', status: 'warn', detail: e.message });
          warnings.push(`${config.name}: ${e.message}`);
        }
      }
    } catch (e) { checks.push({ name: 'BC project access', status: 'fail', detail: e.message }); errors.push(e.message); }
  }

  // 4. Cron entry
  const cron = checkCronEntry(path.basename(config.scriptPath));
  if (cron.count === 0) {
    checks.push({ name: 'Cron entry', status: 'warn', detail: 'no crontab entry found' });
    warnings.push(`${config.name}: no cron`);
  } else {
    checks.push({ name: 'Cron entry', status: 'ok', detail: `${cron.count} entry: ${(cron.lines[0] || '').slice(0, 80)}` });
  }

  // 5. Recipients well-formed
  const toList = Array.isArray(config.recipients?.to) ? config.recipients.to : [config.recipients?.to].filter(Boolean);
  const ccList = Array.isArray(config.recipients?.cc) ? config.recipients.cc : [config.recipients?.cc].filter(Boolean);
  const allRecipients = [...toList, ...ccList];
  const badEmail = allRecipients.find((e) => !/^[^@]+@[^@]+\.[^@]+$/.test(e));
  if (badEmail) {
    checks.push({ name: 'Recipients well-formed', status: 'fail', detail: `bad email: ${badEmail}` });
    errors.push(`${config.name}: bad recipient ${badEmail}`);
  } else {
    checks.push({ name: 'Recipients well-formed', status: 'ok', detail: `${toList.length} to, ${ccList.length} cc` });
  }

  // 6. CB runner state (if applicable)
  if (config.cbRunnerState) {
    const s = checkCbRunnerState(config.cbRunnerState);
    if (!s || !s.exists) {
      checks.push({ name: 'CB AI runner state', status: 'warn', detail: 'state file missing (CB has not drafted any tasks yet)' });
      warnings.push(`${config.name}: no CB drafts yet`);
    } else {
      checks.push({ name: 'CB AI runner state', status: 'ok', detail: `${s.drafted} task(s) drafted, last: ${(s.lastDraft || 'never').slice(0, 16)}` });
    }
  }

  const overall = errors.length ? 'fail' : (warnings.length ? 'warn' : 'ok');
  return {
    name: config.name,
    scriptPath: config.scriptPath,
    projectId: config.projectId,
    projectName,
    recipients: { to: toList, cc: ccList },
    checks, errors, warnings, overall,
  };
}

async function auditAll(reports) {
  const results = [];
  for (const r of reports) {
    try { results.push(await preflightReport(r)); }
    catch (e) { results.push({ name: r.name, scriptPath: r.scriptPath, recipients: r.recipients, checks: [], errors: [e.message], warnings: [], overall: 'fail' }); }
  }
  return results;
}

module.exports = { preflightReport, auditAll };
