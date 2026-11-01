/**
 * AF10.5 - the roster. ONE definition of who is building what.
 *
 * "As more interns join, they will also have more interns / agents join this process so people
 * will be added removed, etc..." One place that says who is building what, which everything else
 * reads.
 *
 * ## The key is the sign-in email, never the display name
 *
 * `agent_domain_projects.intended_builder` is a TEXT NAME, and a name is not an identity.
 * Measured in production on 2026-10-22: **"Sarbjit Kaur" matches two active enrollments**,
 * `sarbjitsaini83@yahoo.com` (one project, the marketing agent) and `sarbjitsaini716@gmail.com`
 * (none). A name-keyed lookup is a coin flip for her, and the coin lands differently depending on
 * which table you start from.
 *
 * So the chain of custody here runs
 *
 *     agent_domain_projects.student_project_id -> projects.enrollment_id -> enrollments.email
 *
 * which is the key the scripts were already using by accident, through the join. Making it
 * explicit is the whole change: `student_project_id` is `NOT NULL`, so every domain already has
 * exactly one project, and moving an agent to a new builder is ONE repoint of ONE column.
 * `intended_builder` is kept for display and is reported when it disagrees with the enrollment,
 * rather than being trusted.
 *
 * ## "Has an enrollment" and "has an intern" are DIFFERENT questions
 *
 * This distinction was not in the original design and production supplied it. Three domains
 * (executive, learner success, website) were assumed to have no owner at all. They do: all three
 * projects belong to `reese@colaberry.com`, Colaberry staff, with `intended_builder` unset. So
 * the domain has an enrollment behind it and no intern on it, and those are not the same state.
 *
 * Conflating them is not cosmetic. Routing inbound mail by "the project has an enrollment" would
 * have begun filing **Reese's email onto three agent tickets**, which the old
 * `WHERE intended_builder IS NOT NULL` quietly prevented. So:
 *
 *   - `backed`   - a project with an enrollment behind it. Can be staff.
 *   - `assigned` - an intern is named AND an enrollment backs them. This is who mail routes to.
 *
 * Every domain is returned either way, because filtering them out is what made an unowned domain
 * and a non-existent domain look identical.
 *
 * ## One person can own several domains
 *
 * Reese owns three. An email-keyed `Map` therefore cannot hold one entry per email without
 * silently dropping two of them, so `byEmail` returns an ARRAY per address and
 * `ownerCollisions` names anyone holding more than one.
 *
 * ## Nothing here talks to the database or to Basecamp
 *
 * `loadRoster` takes a query function; the matching functions take plain arrays. That is what
 * lets the interesting decisions - the email key, the disagreement report, the unassigned domains -
 * be asserted in a unit test rather than confirmed by reading a cron log.
 */

/**
 * The canonical roster query.
 *
 * LEFT JOINs throughout after the project, because a domain with a project whose enrollment has
 * been removed is a thing that must be VISIBLE, not a row that vanishes from a seven-row report
 * and leaves six.
 */
const ROSTER_SQL = `
  SELECT d.domain_key,
         d.student_project_id::text      AS project_id,
         d.intended_builder              AS stored_builder,
         lower(e.email)                  AS email,
         e.full_name                     AS enrollment_name,
         e.id::text                      AS enrollment_id,
         e.status::text                  AS enrollment_status,
         e.created_at::text              AS joined_at,
         g.repo_url,
         g.last_sync_at::text            AS last_sync_at
    FROM agent_domain_projects d
    LEFT JOIN projects p    ON p.id = d.student_project_id
    LEFT JOIN enrollments e ON e.id = p.enrollment_id
    LEFT JOIN github_connections g ON g.project_id = d.student_project_id
   ORDER BY d.domain_key`;

/**
 * Shape one database row into a roster entry.
 *
 * `builder` is null when there is no enrollment behind the project. `storedBuilder` is carried
 * separately and never substituted for it: if the two disagree, that disagreement is a finding,
 * and silently preferring either one would hide it.
 */
function toEntry(r) {
  const email = r.email ? String(r.email).trim().toLowerCase() : null;
  return {
    domain: r.domain_key,
    projectId: r.project_id || null,
    email,
    builder: r.enrollment_name || null,
    storedBuilder: r.stored_builder || null,
    enrollmentId: r.enrollment_id || null,
    enrollmentStatus: r.enrollment_status || null,
    joinedAt: r.joined_at || null,
    repoUrl: r.repo_url || null,
    lastSyncAt: r.last_sync_at || null,
    // An enrollment behind the project. May be staff, so this is NOT "an intern is on it".
    backed: Boolean(email),
    // An intern is named and an enrollment backs them. This is the one mail routes on.
    assigned: Boolean(email) && Boolean(r.stored_builder),
  };
}

/** Load the roster. `q(sql)` is the caller's query function. */
async function loadRoster(q) {
  const rows = await q(ROSTER_SQL);
  return (rows || []).map(toEntry);
}

/** Domains an intern is actually building. The predicate for routing mail and chasing work. */
const assigned = (roster) => roster.filter((r) => r.assigned);

/** Domains whose project has an enrollment behind it, intern or staff. */
const backed = (roster) => roster.filter((r) => r.backed);

/**
 * Email to the domains that address owns, as an ARRAY.
 *
 * An array rather than one entry because one person really does own several: measured in
 * production, `reese@colaberry.com` holds executive, learner success and website. A `Map` of
 * email to a single entry keeps whichever was iterated last and loses the rest without a word,
 * which is the failure this module exists to stop making.
 *
 * Defaults to ASSIGNED domains only. Routing inbound mail over `backed` instead would file a
 * staff member's email onto an agent ticket.
 */
function byEmail(roster, { includeUnassigned = false } = {}) {
  const m = new Map();
  for (const r of includeUnassigned ? backed(roster) : assigned(roster)) {
    if (!m.has(r.email)) m.set(r.email, []);
    m.get(r.email).push(r);
  }
  return m;
}

/** Anyone holding more than one domain. Not an error; a thing a caller must decide about. */
function ownerCollisions(roster, opts) {
  const out = [];
  for (const [email, entries] of byEmail(roster, opts)) {
    if (entries.length > 1) out.push({ email, domains: entries.map((e) => e.domain) });
  }
  return out;
}

/** Domain key to entry, including domains nobody is assigned to. */
function byDomain(roster) {
  const m = new Map();
  for (const r of roster) m.set(r.domain, r);
  return m;
}

/**
 * Read a domain key out of an agent ticket title: "Ellis - the product experience agent (Mihret)".
 *
 * This is the mapping the sync has always used, kept because the Basecamp ticket carries no
 * domain field to replace it with. What changes is that it is no longer trusted on its own.
 */
function domainFromTitle(title) {
  const m = String(title || '').match(/^(\S+)\s+-\s+the\s+(.+?)\s+agent/i);
  return m ? m[2].trim().replace(/\s+/g, '_').toLowerCase() : null;
}

/** The agent's name, which is the first word of the ticket title. */
function agentFromTitle(title) {
  const m = String(title || '').match(/^(\S+)\s+-\s+the\s+/i);
  return m ? m[1] : null;
}

/** The builder named in parentheses at the end of the title, if there is one. */
function builderFromTitle(title) {
  const m = String(title || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

/**
 * Match Basecamp agent tickets to roster domains, and SAY WHAT DID NOT MATCH.
 *
 * The sync used to do this inline and skip a domain with no ticket after printing one line into a
 * cron log nobody reads. A silently skipped domain is the exact failure this ticket exists to
 * prevent - an agent that stops being reported on looks identical to an agent with nothing to
 * report. So every problem is returned as data:
 *
 *   - a ticket whose title names a domain the roster has never heard of
 *   - an assigned domain with no ticket at all
 *   - a ticket whose parenthesised builder disagrees with the enrollment behind the project
 *
 * The third is the one that catches a reassignment nobody finished: the work moved to a new
 * intern and the ticket still says the old name, or the other way round.
 */
function matchTickets(todos, roster) {
  const domains = byDomain(roster);
  const byDomainKey = new Map();
  const problems = [];

  for (const t of todos || []) {
    const domain = domainFromTitle(t.title);
    if (!domain) continue;
    if (!domains.has(domain)) {
      problems.push({
        kind: 'ticket_for_unknown_domain',
        ticketId: t.id,
        title: t.title,
        domain,
      });
      continue;
    }
    byDomainKey.set(domain, {
      id: t.id,
      title: t.title,
      agent: agentFromTitle(t.title),
      dueOn: t.due_on || null,
    });

    const named = builderFromTitle(t.title);
    const entry = domains.get(domain);
    if (named && entry.builder && named.toLowerCase() !== String(entry.builder).toLowerCase()) {
      problems.push({
        kind: 'ticket_builder_disagrees',
        ticketId: t.id,
        domain,
        ticketSays: named,
        enrollmentSays: entry.builder,
        email: entry.email,
      });
    }
  }

  // Only ASSIGNED domains are expected to have a ticket. Demanding one for a domain nobody is
  // on would print three problems on every single run, and a report that is always wrong about
  // three things is a report people stop reading.
  for (const r of assigned(roster)) {
    if (!byDomainKey.has(r.domain)) {
      problems.push({ kind: 'assigned_domain_without_ticket', domain: r.domain, email: r.email });
    }
  }

  return { byDomain: byDomainKey, problems };
}

/**
 * Where the stored display name has drifted from the enrollment it points at.
 *
 * Not an error on its own - somebody may simply have changed their name - but it is the first
 * symptom of a reassignment that was done in one place and not the other, so it is surfaced
 * rather than smoothed over.
 */
function builderDrift(roster) {
  return assigned(roster)
    .filter((r) => r.storedBuilder && r.builder
      && r.storedBuilder.trim().toLowerCase() !== String(r.builder).trim().toLowerCase())
    .map((r) => ({
      domain: r.domain, stored: r.storedBuilder, enrollment: r.builder, email: r.email,
    }));
}

/* ───────────────────────────── AF10.8: who counts as programme traffic ───── */

/**
 * Senders whose mail belongs on an agent ticket when a builder is only copied.
 *
 * The builders themselves are always in scope and are added by `selectMessage`; this list is
 * everyone ELSE whose mail about a builder is programme traffic.
 *
 * Measured over 90 days on 2026-11-01: 114 messages have a builder in TO or CC and were
 * structurally unselectable. Sorted by sender, the decision writes itself -- 68 are Ali's own
 * sent mail, 26 are Dhee (Pip's main user), 8 are Kes, 3 are PaySimple receipts, and the tail is
 * ones and twos. So the fix is NOT "anyone who copied a builder", which would file payment
 * receipts and call recaps onto agent tickets. It is an allowlist.
 *
 * DELIBERATELY EXCLUDED, each for its own reason:
 *   ali@colaberry.com   his own sent mail; it is the other side of a conversation already filed
 *   paysimple@          payment receipts, not programme traffic
 *   jackie@, cora@      one message each, neither about an agent
 */
const PROGRAMME_SENDERS = Object.freeze([
  'kes@colaberry.com',
  'dhee@colaberry.com',
  'aleem@colaberry.com',
]);

/**
 * Pull the bare address out of a recipient entry.
 *
 * THE SHAPE IS AN OBJECT, NOT A STRING. Measured in production 2026-11-01: `to_addresses` and
 * `cc_addresses` hold `[{ "name": "Ali Muwwakkil", "address": "ali@colaberry.com" }]`. The
 * AF10.8 ticket named two schema traps and this is a third, which the first dry run found the
 * hard way -- the SQL matched Kes's messages as candidates, because
 * `jsonb_array_elements_text` stringifies the whole object and the address is inside that text,
 * and then this function read every one of them as `[object Object]` and reported "no builder
 * in from, to or cc" for the exact eight the ticket exists to catch. A candidate that the
 * predicate then silently refuses is worse than one it never selected.
 *
 * Also handles the plain `a@b.com` and `Display Name <a@b.com>` forms, because a column that
 * holds objects today is not a promise about every row. Containment alone would be too loose --
 * `kes@colaberry.com` is contained in `fakekes@colaberry.com` -- so the address is extracted and
 * then compared whole.
 */
function bareAddress(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return String(entry.address || entry.email || '').trim().toLowerCase();
  }
  const s = String(entry == null ? '' : entry).trim().toLowerCase();
  const angled = /<([^>]+)>/.exec(s);
  return (angled ? angled[1] : s).trim();
}

/**
 * Does this message belong on an agent ticket, and whose?
 *
 * PURE. No database, no Basecamp, no clock -- so the rule that decides what gets filed onto
 * somebody's ticket can be tested exhaustively, which is the point: a predicate change that no
 * test can tell apart from the old one is not a change anybody can trust.
 *
 * ## The defect this replaces
 *
 * The sweep selected `lower(from_address) = ANY($builders)`: FROM only, builders only. So
 * "builder sends to anyone" was caught and "Kes writes to Ali with a builder copied" was not a
 * candidate in any window, over any range, ever. Eight of Kes's messages about Ellis -- the
 * agent's BRD and handover roadmap, the most important documents anyone has produced about it --
 * had never been filed and never could be.
 *
 * ## Why the owner is not the sender
 *
 * On a widened match the sender is Kes and the ticket is Quincy's. Routing by sender would file
 * Kes's mail to a Kes ticket that does not exist. The owner is the BUILDER found among the
 * recipients, so the first builder in TO then CC wins, and `ambiguous` is reported rather than
 * guessed when more than one builder is copied.
 *
 * @param {{from: string, to?: string[], cc?: string[]}} msg
 * @param {{builderEmails: string[], programmeSenders?: string[]}} scope
 * @returns {{selected: boolean, owner: string|null, via: string, reason: string,
 *            otherBuilders: string[]}}
 */
function selectMessage(msg, scope) {
  const builders = new Set((scope.builderEmails || []).map((e) => String(e).toLowerCase()));
  const senders = new Set([
    ...builders,
    ...((scope.programmeSenders || PROGRAMME_SENDERS).map((e) => String(e).toLowerCase())),
  ]);
  const from = bareAddress(msg.from);
  const recipients = [...(msg.to || []), ...(msg.cc || [])].map(bareAddress).filter(Boolean);
  const copiedBuilders = [...new Set(recipients.filter((a) => builders.has(a)))];

  /* A builder's own mail. The original predicate, unchanged, so widening cannot regress it. */
  if (builders.has(from)) {
    return {
      selected: true, owner: from, via: 'sender', otherBuilders: copiedBuilders,
      reason: 'sent by a builder',
    };
  }

  if (!copiedBuilders.length) {
    return {
      selected: false, owner: null, via: 'none', otherBuilders: [],
      reason: 'no builder in from, to or cc',
    };
  }

  /* A builder IS copied, so the only question left is whether this sender's mail belongs on an
     agent ticket at all. Absence from the allowlist is a decision, not an oversight. */
  if (!senders.has(from)) {
    return {
      selected: false, owner: null, via: 'none', otherBuilders: copiedBuilders,
      reason: `builder copied but ${from || '(no sender)'} is not a programme sender`,
    };
  }

  return {
    selected: true,
    owner: copiedBuilders[0],
    via: copiedBuilders.length > 1 ? 'recipient-ambiguous' : 'recipient',
    otherBuilders: copiedBuilders.slice(1),
    reason: copiedBuilders.length > 1
      ? `${from} copied ${copiedBuilders.length} builders; filed to the first`
      : `${from} is a programme sender and copied a builder`,
  };
}

module.exports = {
  ROSTER_SQL,
  loadRoster,
  toEntry,
  assigned,
  backed,
  byEmail,
  ownerCollisions,
  byDomain,
  domainFromTitle,
  agentFromTitle,
  builderFromTitle,
  matchTickets,
  builderDrift,
  PROGRAMME_SENDERS,
  bareAddress,
  selectMessage,
};
