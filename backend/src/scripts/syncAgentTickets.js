/**
 * AF10.3 - keep Basecamp in sync with the platform, automatically.
 *
 * Ali, 20 Oct: "I need this basecamp process to stay in sync with the projects... I should be
 * fully tapped into what they are committing and the progress of the agents."
 *
 * ## Direction, and why it is deliberately lopsided
 *
 *   PLATFORM -> BASECAMP   story progress, commits, repo state. Posted as a comment on the
 *                          agent's ticket in group 09.
 *   BASECAMP -> PLATFORM   DUE DATES ONLY. Moving a date on an agent ticket moves that
 *                          project's stories with it.
 *
 * Nothing else travels backwards. **A Basecamp comment must never change a story's state**: a
 * comment is a claim and the platform is the record. Inverting that even once would mean the
 * programme's own progress could be edited by typing, and every number downstream would become
 * an opinion.
 *
 * ## Due dates SHIFT, they are not stamped
 *
 * Moving the ticket from the 24th to the 22nd shifts that project's dated stories by -2 days.
 * It does not set them all to the 22nd, which would flatten the sequencing the programme set
 * across 60 dated stories into a single deadline. The previous date is read from the last
 * digest this job posted, so the delta is computed against what we last saw rather than against
 * a guess.
 *
 * Only stories that are NOT yet verified move. A verified story is finished, and moving its
 * date would rewrite history to make a delivery look late or early.
 *
 * ## Idempotent
 *
 * Each digest embeds a fingerprint of the state it describes. The job reads the last
 * fingerprint off the ticket's own comments and posts only when it differs. Re-running changes
 * nothing, which is the ticket's own acceptance criterion.
 *
 * Run: `node backend/src/scripts/syncAgentTickets.js`           (dry run)
 *      `node backend/src/scripts/syncAgentTickets.js --apply`   (posts and shifts)
 */
const { Sequelize, QueryTypes } = require('sequelize');
const R = require('./lib/agentRoster');
const { buildDigest, dueDateShiftDays, FINGERPRINT_TAG } = require('./lib/agentTicketDigest');

const ACCOUNT = '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const BUCKET = 7463955;
const AGENT_GROUP = 10424311358; // "09 - Agent Builds, one ticket per agent"

const APPLY = process.argv.slice(2).includes('--apply');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set.');
  process.exit(1);
}

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, b) => sql.query(t, { bind: b || [], type: QueryTypes.SELECT });

/**
 * The token, resolved for BOTH places this runs, and self-healing.
 *
 * On the host under cron, `cron-env-wrapper.sh` exports a health-probed token, so env is right.
 * Inside the container, env holds the DEPLOY-TIME token, which expires and then every call 401s
 * with "OAuth token expired (old age)". Preferring env unconditionally therefore works on the
 * schedule and fails by hand, which is the same trap in the opposite direction to the usual one.
 *
 * So: use env if present, and on a 401 mint a fresh one and retry ONCE. One retry, not a loop:
 * a second 401 after a fresh mint is a real auth problem and must surface.
 */
let T = null;
let minted = false;
const tok = async () => {
  if (T) return T;
  const fromEnv = (process.env.BASECAMP_ACCESS_TOKEN || '').trim();
  if (fromEnv) { T = fromEnv; return T; }
  T = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  minted = true;
  return T;
};

async function bc(method, p, body, retried = false) {
  const r = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && !retried && !minted) {
    console.log('  (env token rejected, minting a fresh one and retrying once)');
    T = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
    minted = true;
    return bc(method, p, body, true);
  }
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? {} : r.json();
}

/** The last fingerprint and due date this job recorded on a ticket, or nulls. */
function lastSeen(comments) {
  const re = new RegExp(`${FINGERPRINT_TAG}:([0-9a-f]{16})`);
  for (let i = (comments || []).length - 1; i >= 0; i -= 1) {
    const m = re.exec(String(comments[i].content || ''));
    if (m) {
      const due = /af103-due:(\d{4}-\d{2}-\d{2}|none)/.exec(String(comments[i].content || ''));
      return { fingerprint: m[1], due: due && due[1] !== 'none' ? due[1] : null };
    }
  }
  return { fingerprint: null, due: null };
}

async function main() {
  console.log(APPLY ? '*** APPLYING ***\n' : '*** DRY RUN - nothing is posted or written ***\n');

  // Who is building what comes from `lib/agentRoster.js`, the one definition the sweep and the
  // daily report also read. Adding an intern is one repoint of one column and nothing here moves.
  const roster = await R.loadRoster(q);
  const todos = await bc('GET', `/buckets/${BUCKET}/todolists/${AGENT_GROUP}/todos.json?status=all`);
  const { byDomain: ticketForDomain, problems } = R.matchTickets(todos, roster);
  console.log(`agent tickets: ${ticketForDomain.size}`);
  // A domain with no ticket used to be one line in a cron log nobody reads, and an agent that
  // stops being reported on looks identical to an agent with nothing to report.
  for (const p of problems) console.log(`  PROBLEM ${p.kind}: ${JSON.stringify(p)}`);
  for (const d of R.builderDrift(roster)) {
    console.log(`  PROBLEM builder_drift: ${d.domain} stored "${d.stored}" vs enrollment "${d.enrollment}"`);
  }
  console.log('');

  // The per-domain build state. Keyed on the roster's project ids rather than re-deriving the
  // join, so the two can never disagree about which project belongs to which domain.
  const pids = R.assigned(roster).map((r) => r.projectId);
  const rows = await q(`
    SELECT d.domain_key, d.student_project_id::text AS pid, d.intended_builder,
           g.repo_url, g.file_count, g.commit_summary_json AS commits
      FROM agent_domain_projects d
      LEFT JOIN github_connections g ON g.project_id = d.student_project_id
     WHERE d.student_project_id::text = ANY($1)
     ORDER BY d.domain_key`, [pids]);
  const domains = rows;

  let posted = 0; let unchanged = 0; let shifted = 0;

  for (const dom of domains) {
    const ticket = ticketForDomain.get(dom.domain_key);
    if (!ticket) { console.log(`  ${dom.domain_key}: NO TICKET, skipped`); continue; }

    const [s] = await q(`
      SELECT count(*)::int AS stories,
             count(*) FILTER (WHERE verified_at IS NOT NULL)::int AS verified,
             count(*) FILTER (WHERE status = 'complete' AND verified_at IS NULL)::int AS ticked,
             count(*) FILTER (WHERE verification_json IS NOT NULL)::int AS verdicts,
             count(*) FILTER (WHERE due_on IS NOT NULL)::int AS dated
        FROM student_tasks WHERE project_id = $1::uuid`, [dom.pid]);

    const verifiedStories = await q(`
      SELECT story_id,
             coalesce(verification_json->>'criteria_passed', '?') AS passed,
             coalesce(verification_json->>'criteria_total', '?') AS total,
             verified_ref AS sha
        FROM student_tasks
       WHERE project_id = $1::uuid AND verified_at IS NOT NULL
       ORDER BY verified_at DESC LIMIT 8`, [dom.pid]);

    const state = {
      agent: ticket.agent,
      intern: dom.intended_builder,
      stories: s.stories,
      verified: s.verified,
      tickedNotVerified: s.ticked,
      withVerdict: s.verdicts,
      dated: s.dated,
      repoUrl: dom.repo_url || null,
      fileCount: dom.file_count,
      ticketDueOn: ticket.dueOn,
      commits: Array.isArray(dom.commits) ? dom.commits : [],
      verifiedStories: verifiedStories.map((v) => ({
        storyId: v.story_id, passed: v.passed, total: v.total, sha: v.sha,
      })),
    };

    const { fingerprint, html, headline } = buildDigest(state);
    const comments = await bc('GET', `/buckets/${BUCKET}/recordings/${ticket.id}/comments.json`);
    const seen = lastSeen(comments);

    // --- BASECAMP -> PLATFORM: due dates only ---------------------------------
    const shift = dueDateShiftDays(seen.due, ticket.dueOn);
    if (shift !== 0) {
      const [n] = await q(`
        SELECT count(*)::int AS n FROM student_tasks
         WHERE project_id = $1::uuid AND due_on IS NOT NULL AND verified_at IS NULL`, [dom.pid]);
      console.log(`  ${dom.domain_key}: ticket date moved ${seen.due} -> ${ticket.dueOn}`
        + ` (${shift > 0 ? '+' : ''}${shift}d), would shift ${n.n} unverified dated stor${n.n === 1 ? 'y' : 'ies'}`);
      if (APPLY && n.n > 0) {
        await sql.query(
          `UPDATE student_tasks
              SET due_on = due_on + ($2::int) * INTERVAL '1 day', updated_at = now()
            WHERE project_id = $1::uuid AND due_on IS NOT NULL AND verified_at IS NULL`,
          { bind: [dom.pid, shift], type: QueryTypes.UPDATE });
        shifted += n.n;
      }
    }

    // --- PLATFORM -> BASECAMP: post only when the state changed ---------------
    if (seen.fingerprint === fingerprint) {
      unchanged += 1;
      console.log(`  ${dom.domain_key}: unchanged (${fingerprint}), nothing posted`);
      continue;
    }

    const content = `${html}<div style="display:none">af103-due:${ticket.dueOn || 'none'}</div>`;
    if (APPLY) await bc('POST', `/buckets/${BUCKET}/recordings/${ticket.id}/comments.json`, { content });
    posted += 1;
    console.log(`  ${dom.domain_key}: ${APPLY ? 'POSTED' : 'WOULD POST'} ${seen.fingerprint || '(first)'} -> ${fingerprint}`);
    console.log(`      ${headline}`);
  }

  console.log(`\n=== result ===`);
  console.log(`  ${APPLY ? 'posted' : 'would post'}=${posted}  unchanged=${unchanged}  stories re-dated=${shifted}`);
  if (!APPLY) console.log('\nDRY RUN. Re-run with --apply.');
}

main()
  .then(async () => { await sql.close(); process.exit(0); })
  .catch(async (e) => {
    console.error('FAILED: ' + e.message);
    try { await sql.close(); } catch (_) { /* pool may already be down */ }
    process.exit(1);
  });
