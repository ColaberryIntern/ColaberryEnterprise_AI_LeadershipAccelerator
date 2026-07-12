/**
 * Audit the launch Approval Queue: list every approval todo and report whether
 * it is wired to the artifact it gates.
 *
 * Read-only diagnostic. Built after the 2026-06-10 audit found approval todos
 * surfaced to the human queue with nothing attached to approve. Use this to
 * enumerate the live queue and triage which approvals are "ready" (artifact
 * marker present) vs "awaiting deliverable" (no artifact wired). For each
 * awaiting approval it attempts to locate the producing task in the matching
 * area list by fuzzy-matching the approval's deliverable/dependency text.
 *
 * Resolves the live Basecamp token via lib/basecampToken (CCPP), so it must run
 * where that token is reachable (prod backend container / PMO host) or with
 * BASECAMP_ACCESS_TOKEN set locally.
 *
 * Run:  node backend/src/scripts/auditApprovalQueue.js [--json]
 * Output: human table (default) or JSON (--json) to stdout. Writes nothing.
 */

const ops = require('./lib/launchPmoOps');
const { LAUNCH } = require('./lib/launchPmoTeam');
const { getBasecampToken } = require('./lib/basecampToken');
const { approvalArtifactStatus, extractArtifactUrl, APPROVAL_LIST_NAME } = require('./lib/approvalArtifactLink');

const asJson = process.argv.includes('--json');

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function today() { return new Date().toISOString().slice(0, 10); }
function daysOverdue(due) {
  if (!due || due >= today()) return 0;
  return Math.round((new Date(today()) - new Date(due)) / 86400000);
}

// Pull the "Deliverable" / "Dependencies" prose out of a generated todo body so
// we can fuzzy-match it to a producing task. The generator renders them as
// labelled paragraphs; fall back to the whole stripped body.
function extractDeliverableHint(description) {
  const text = stripHtml(description);
  const m = /(deliverable|dependenc(?:y|ies))[:\s]+(.*?)(?:definition of done|briefs to read|dependencies|$)/i.exec(text);
  return (m ? m[2] : text).slice(0, 160);
}

function tokenize(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []);
}
function overlapScore(aSet, bStr) {
  const b = tokenize(bStr);
  let n = 0;
  for (const t of aSet) if (b.has(t)) n++;
  return n;
}

async function main() {
  // Resolve the live token onto the env the ops primitives read.
  process.env.BASECAMP_ACCESS_TOKEN = await getBasecampToken();

  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const approvalList = lists.find((l) => l.name === APPROVAL_LIST_NAME);
  if (!approvalList) throw new Error(`No "${APPROVAL_LIST_NAME}" list in project ${LAUNCH.projectId}`);

  const approvals = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${approvalList.id}/todos.json`);

  // Pre-load open todos from every other list once, for producing-task matching.
  const otherTodos = [];
  for (const l of lists) {
    if (l.id === approvalList.id) continue;
    const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${l.id}/todos.json`);
    for (const t of todos) otherTodos.push({ ...t, listName: l.name });
  }

  const rows = approvals.map((t) => {
    const status = approvalArtifactStatus(t); // 'ready' | 'awaiting'
    const artifactUrl = extractArtifactUrl(t.description);
    let producingGuess = null;
    if (status === 'awaiting') {
      const hint = tokenize(extractDeliverableHint(t.description) + ' ' + (t.content || ''));
      let best = null;
      for (const o of otherTodos) {
        const score = overlapScore(hint, (o.content || '') + ' ' + stripHtml(o.description));
        if (score >= 3 && (!best || score > best.score)) best = { score, title: o.content, list: o.listName, url: o.app_url };
      }
      producingGuess = best;
    }
    return {
      id: t.id,
      title: t.content,
      due_on: t.due_on || null,
      days_overdue: daysOverdue(t.due_on),
      artifact_status: status,
      artifact_url: artifactUrl,
      producing_task_guess: producingGuess,
      url: t.app_url,
    };
  });

  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.artifact_status === 'ready').length,
    awaiting: rows.filter((r) => r.artifact_status === 'awaiting').length,
    awaiting_overdue: rows.filter((r) => r.artifact_status === 'awaiting' && r.days_overdue > 0).length,
  };

  if (asJson) {
    console.log(JSON.stringify({ project_id: LAUNCH.projectId, list_id: approvalList.id, summary, rows }, null, 2));
    return;
  }

  console.log(`\nApproval Queue audit — project ${LAUNCH.projectId} ("${APPROVAL_LIST_NAME}")`);
  console.log(`  ${summary.total} approvals  |  ${summary.ready} ready  |  ${summary.awaiting} awaiting deliverable (${summary.awaiting_overdue} of them overdue)\n`);
  for (const r of rows) {
    const flag = r.artifact_status === 'ready' ? 'READY   ' : 'AWAITING';
    const od = r.days_overdue > 0 ? ` [${r.days_overdue}d overdue]` : '';
    console.log(`  [${flag}] ${r.title}${od}`);
    console.log(`            todo ${r.id} · due ${r.due_on || 'none'} · ${r.url}`);
    if (r.artifact_url) console.log(`            artifact: ${r.artifact_url}`);
    if (r.producing_task_guess) {
      console.log(`            likely producer: "${r.producing_task_guess.title}" (${r.producing_task_guess.list}) ${r.producing_task_guess.url}`);
    } else if (r.artifact_status === 'awaiting') {
      console.log('            likely producer: none found — artifact may not exist yet');
    }
  }
  console.log('');
}

main().catch((e) => { console.error('auditApprovalQueue failed:', e.message); process.exit(1); });
