/**
 * AF10.7 — post each intern's Release 0 documents onto their agent ticket.
 *
 *   docker exec accelerator-backend node /app/src/scripts/postInternArtifacts.js          # DRY
 *   docker exec accelerator-backend node /app/src/scripts/postInternArtifacts.js --send   # writes
 *
 * ## DRY BY DEFAULT, AND THAT IS THE MOST IMPORTANT LINE IN THIS FILE
 *
 * A Basecamp comment cannot be unposted by this code. Nothing in this repo edits or deletes a
 * comment, so recovery from a bad run is a human deleting comments by hand across seven tickets.
 * The reversible step therefore comes first: without `--send` this prints exactly what it would
 * post and writes nothing. `parseArgs` is exported and tested, because a bug in argument parsing
 * is the one defect here that reaches seven real tickets.
 *
 * There is deliberately NO cron entry for this. Registering a schedule would start the posting
 * automatically on the next deploy, which smuggles an approval through a deploy instead of asking
 * for it.
 *
 * ## How this actually reaches the container, which is not what you would guess
 *
 * **The image has no `/app/src`.** It ships `/app/dist` only, and `tsc` does not copy plain `.js`
 * files, so none of the `scripts/lib/*.js` modules is in the image at all — `agentRoster.js`
 * included. Measured 2026-10-28: `find /app -name agentRoster.js` returns nothing.
 *
 * So a plain-JS script like this one runs in one of two places, and both are established:
 *
 *   1. **Copied in and run from `/tmp`**, which is what `attachArtifactToTicket.js` documents
 *      ("Copy the PDFs across first, then `docker exec ... node /tmp/...`"). Inside `/tmp` it
 *      still sees `/app/dist` and `/app/node_modules`, which is all it needs.
 *   2. **On the host** under cron, from the git checkout, where `cron-env-wrapper.sh` exports a
 *      health-probed `BASECAMP_ACCESS_TOKEN` — the path `syncAgentTickets.js:61-70` describes.
 *
 * Either way **no deploy is required to run it**, which is the property that matters here.
 *
 * ## Why the dependencies are resolved from dist and injected
 *
 * The hardened clients are already-deployed TypeScript, so they come from `/app/dist` and are
 * passed into the lib modules. That keeps the libs pure and unit-testable with fakes, and keeps
 * the 401 refresh, the capped 429/503 backoff, the per-attempt timeout and GitHub's 15-second
 * abort rather than re-implementing any of them.
 */
const { syncTicket, formatSummary, WOULD_POST } = require('./lib/internArtifactSync');
const { domainFromTitle, agentFromTitle, builderFromTitle } = require('./lib/agentRoster');

const BUCKET = Number(process.env.BUCKET || 7463955);
const AGENT_GROUP = Number(process.env.AGENT_GROUP || 10424311358); // "09 - Agent Builds"

/**
 * Resolve one already-deployed module out of dist, failing with a sentence rather than a stack.
 *
 * Production is registry-mode, so a running container can lag `main`. A bare `require` of a
 * missing module would die with a module-resolution stack that says nothing about why, and this
 * is the one failure that stops the run dead before it does anything useful.
 */
function fromDist(relPath, what) {
  const full = `/app/dist/${relPath}`;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(full);
  } catch (err) {
    throw new Error(
      `Could not load ${what} from ${full}. This image may be older than the commit that added `
      + `it (production is registry-mode, so a container can lag main). Underlying error: `
      + `${err && err.message}`,
    );
  }
}

/** `--send` must be asked for. Everything else is ignored rather than guessed at. */
function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  return {
    send: args.includes('--send'),
    only: (() => {
      const i = args.indexOf('--only');
      return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
    })(),
  };
}

async function main() {
  const { send, only } = parseArgs(process.argv.slice(2));

  const { bcGet, bcGetAll, bcPost } = fromDist('services/ops/basecampClient.js', 'the Basecamp client');
  const { fetchRepoFile } = fromDist('services/sbp/repoConnect/githubRepoClient.js', 'the GitHub reader');
  const { RESEARCH_DELIVERABLES } = fromDist(
    'services/agentDomain/agentDomainResearchPrompts.js', 'the deliverable paths',
  );
  const { resolveProjectRepo } = fromDist('services/projectRepoResolver.js', 'the repo resolver');
  const { sequelize } = fromDist('config/database.js', 'the database connection');
  const { loadRoster, byDomain } = require('./lib/agentRoster');

  console.log(send
    ? '*** SEND MODE: comments WILL be posted to Basecamp ***'
    : 'DRY RUN. Nothing will be posted. Add --send to write.');

  const todos = await bcGet(`/buckets/${BUCKET}/todolists/${AGENT_GROUP}/todos.json?status=all`);
  // `loadRoster` calls its query function with the SQL and nothing else, by design: it owns no
  // I/O so that its keying and disagreement reporting stay unit-testable.
  const roster = byDomain(await loadRoster((sql) => sequelize.query(sql, { type: 'SELECT' })));

  const results = [];
  for (const todo of todos) {
    const domain = domainFromTitle(todo.title);
    if (!domain) {
      console.log(`  SKIP  "${todo.title}" does not match the agent-ticket naming convention.`);
      continue;
    }
    if (only && only !== domain) continue;

    const entry = roster.get(domain);
    if (!entry) {
      console.log(`  SKIP  ${domain}: a ticket exists but no provisioned domain does.`);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const pointer = await resolveProjectRepo(entry.projectId, entry.repoUrl);
    const repo = pointer && pointer.owner && pointer.name
      ? { owner: pointer.owner, name: pointer.name, url: pointer.url }
      : null;

    // eslint-disable-next-line no-await-in-loop
    const result = await syncTicket({
      ticket: {
        id: todo.id,
        project_id: BUCKET,
        agent: agentFromTitle(todo.title),
        title: todo.title,
      },
      repo,
      deliverables: RESEARCH_DELIVERABLES,
      fetchRepoFile,
      bcGetAll,
      bcPost,
      send,
    });
    result.builder = builderFromTitle(todo.title);
    results.push(result);
    console.log(`  ${formatSummary(result)}`);
  }

  // In a dry run the bodies are the whole point, so they are printed rather than counted.
  if (!send) {
    for (const r of results) {
      for (const d of r.decisions.filter((x) => x.outcome === WOULD_POST)) {
        console.log(`\n----- WOULD POST to ${r.agent} (${d.path}) -----`);
        console.log(d.html);
      }
    }
  }

  console.log(`\n${results.length} ticket(s) examined. sent=${send}`);
  await sequelize.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`FAILED: ${err && err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, fromDist, BUCKET, AGENT_GROUP };
