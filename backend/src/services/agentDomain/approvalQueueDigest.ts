/**
 * Compose the daily "approvals you owe" digest. PURE: no database, no mail, no clock.
 *
 * ## Why this exists
 *
 * Step 3 of every capability ladder ends at a human decision, and its acceptance criterion is
 * explicit that an undecided request does not count: *"A named human other than the builder has
 * recorded a decision on it. A decline counts; an undecided request does not."*
 *
 * Measured on production 2026-11-13, the day the ladder went live on all ten boards:
 *
 *   - **1** change request has ever been filed, and **0** have ever been decided.
 *   - `agent_domain_tool_request_decisions` holds **0** rows.
 *   - `POST /api/admin/agent-domain-change-requests/:id/decide` has never been called.
 *   - `agent_domain_build_authorizations` holds **0** rows and `accountable_identity_id` is
 *     unpopulated on all 553 live stories, so **no decider is recorded anywhere in data**.
 *
 * Seven builders are now each pointed at one capability. Every one of them reaches that decision
 * within a few days. The queue page exists and nobody opens it, so this pushes instead of waiting
 * to be pulled.
 *
 * ## Two deliberate differences from the existing queue page
 *
 *   1. **Oldest first.** `listAllChangeRequests` orders `requested_at DESC`, which puts the
 *      request most needing a decision at the bottom of the page. A queue sorted newest-first is
 *      sorted backwards.
 *   2. **Age is stated.** The page prints an absolute timestamp and leaves the arithmetic to the
 *      reader. Nothing in the change-request stack computes an age today.
 *
 * ## What it refuses to do
 *
 * It never implies a decision. The digest reports what is waiting and who can act; approving is a
 * human act through the admin UI, and nothing here links to a one-click approve.
 */

/** One open request, as the sender reads it. Emails, not uuids: the table stores emails. */
export interface OpenRequest {
  readonly id: string;
  readonly domain_key: string;
  readonly title: string;
  readonly requested_by_identity: string;
  readonly requested_at: string | Date;
  readonly kind: string | null;
}

/**
 * Who decides for one domain, and whether they can actually act.
 *
 * `email` comes from `agent_domain_projects.manager_identity_id` joined to `org_members.email`,
 * which is the string the auth gate matches a token against. It deliberately does NOT come from
 * the capability matrix's `accountable_human` (a display NAME, e.g. "Sohail Syed") nor from
 * `agentDomainRegistry.manager_email`, whose own docblock says nothing should start trusting it.
 *
 * ## `canDecide` is NOT `manager_can_reach`, and the difference is the whole point
 *
 * `agent_domain_projects.manager_can_reach` is `true` for all ten domains. It answers "can this
 * person open the admin UI". But BOTH the queue list endpoint and the decide endpoint are
 * `requireAdmin`, which reads the token's role -- so reaching the UI is not deciding.
 *
 * Measured 2026-11-13: three of the ten named managers hold **no admin role at all** --
 * platform (kes@), product_experience (aleem@) and sales (roselen@). For them
 * `manager_can_reach` says `true` and the truth is that they cannot act. Worse, they do not see
 * an error: `AdminChangeRequestsPage` swallows the 403 and renders no queue, so the page looks
 * empty rather than forbidden.
 *
 * So `canDecide` is computed from the admin role, and a request whose named owner cannot decide
 * is routed to somebody who can rather than mailed daily to somebody who cannot.
 */
export interface DomainDecider {
  readonly domainKey: string;
  readonly email: string | null;
  /** Admin or super_admin on `admin_users`. The predicate `requireAdmin` actually applies. */
  readonly canDecide: boolean;
  /** Why not, when known. Reported so a reader can fix the access rather than guess. */
  readonly blocker: string | null;
}

export interface DigestLine {
  readonly id: string;
  readonly domainKey: string;
  readonly title: string;
  readonly requestedBy: string;
  readonly ageDays: number;
  readonly requestedAtIso: string;
}

export interface ComposedDigest {
  /** The intended mailbox. The sender resolves the delivered address separately. */
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly lines: ReadonlyArray<DigestLine>;
  /** True when this went to the admin fallback rather than to a domain's own decider. */
  readonly isFallback: boolean;
  /** Domains whose named owner cannot decide, as "domain (email)", for the fallback to name. */
  readonly ownerCannotDecide: ReadonlyArray<string>;
}

/** Whole days elapsed, floored. An hour-old request reads as 0 days, which is honest. */
export function ageInDays(requestedAt: string | Date, asOf: Date): number {
  const then = requestedAt instanceof Date ? requestedAt : new Date(requestedAt);
  const ms = asOf.getTime() - then.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

function ageWords(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day old';
  return `${days} days old`;
}

function toLine(r: OpenRequest, asOf: Date): DigestLine {
  const then = r.requested_at instanceof Date ? r.requested_at : new Date(r.requested_at);
  return {
    id: r.id,
    domainKey: r.domain_key,
    title: r.title,
    requestedBy: r.requested_by_identity,
    ageDays: ageInDays(r.requested_at, asOf),
    requestedAtIso: Number.isNaN(then.getTime()) ? '' : then.toISOString(),
  };
}

/** Oldest first, then by domain so the order is stable when two requests share a day. */
function oldestFirst(a: DigestLine, b: DigestLine): number {
  if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
  return a.domainKey.localeCompare(b.domainKey);
}

function body(lines: ReadonlyArray<DigestLine>, opts: {
  isFallback: boolean;
  ownerCannotDecide: ReadonlyArray<string>;
  baseUrl: string;
}): string {
  const out: string[] = [];
  out.push(lines.length === 1
    ? 'One capability request is waiting on a decision.'
    : `${lines.length} capability requests are waiting on a decision.`);
  out.push('');
  out.push('A builder cannot finish step 3 of a capability until somebody decides. A decline');
  out.push('counts and closes the story; leaving it open does not.');
  out.push('');

  for (const l of lines) {
    out.push(`- ${l.title}`);
    out.push(`  ${l.domainKey} | filed by ${l.requestedBy} | ${ageWords(l.ageDays)}`);
  }

  out.push('');
  out.push(`Decide them here: ${opts.baseUrl}/admin/change-requests`);

  if (opts.isFallback) {
    out.push('');
    out.push('This came to you because these requests have no owner who can act on them.');
  }

  if (opts.ownerCannotDecide.length > 0) {
    out.push('');
    out.push('The named owner of these domains holds no admin role, so they cannot decide and');
    out.push('cannot even see the queue: the page returns 403 and renders empty rather than');
    out.push('saying it is forbidden.');
    for (const d of opts.ownerCannotDecide) out.push(`  ${d}`);
    out.push('');
    out.push('Either decide these yourself, or give those accounts the access and they will');
    out.push('appear in their own digest tomorrow instead of yours.');
  }

  return out.join('\n');
}

export interface ComposeArgs {
  readonly open: ReadonlyArray<OpenRequest>;
  readonly deciders: ReadonlyArray<DomainDecider>;
  readonly asOf: Date;
  readonly baseUrl: string;
  /** Where a domain with no resolvable decider goes. Empty means those requests are dropped. */
  readonly fallbackRecipients: ReadonlyArray<string>;
}

export interface ComposeResult {
  readonly digests: ReadonlyArray<ComposedDigest>;
  /** Requests nobody will hear about, because there was no decider and no fallback. */
  readonly orphaned: ReadonlyArray<DigestLine>;
}

/**
 * One digest per mailbox that owes a decision, plus one fallback digest when a domain has no
 * decider. A mailbox owning two domains gets ONE mail listing both, never two.
 */
export function composeApprovalDigests(args: ComposeArgs): ComposeResult {
  const byDomain = new Map<string, DomainDecider>(
    args.deciders.map((d) => [d.domainKey, d]),
  );

  const perMailbox = new Map<string, DigestLine[]>();
  const fallbackLines: DigestLine[] = [];
  /** "domain (email)" for every domain whose named owner holds no admin role. */
  const cannotDecide = new Set<string>();

  for (const r of args.open) {
    const line = toLine(r, args.asOf);
    const decider = byDomain.get(r.domain_key);
    const email = decider?.email?.trim().toLowerCase() || '';

    // No decider recorded at all.
    if (!email) {
      fallbackLines.push(line);
      continue;
    }

    // The named owner cannot act. Mailing them daily about a queue they cannot open or decide
    // is how a digest teaches its reader to ignore it, so this goes to somebody with authority
    // and names the domain and the person so the access can be fixed instead.
    if (decider && !decider.canDecide) {
      fallbackLines.push(line);
      cannotDecide.add(`${r.domain_key} (${email})`);
      continue;
    }

    // Nobody decides their own request. The service refuses it anyway; this keeps the digest
    // from asking.
    if (email === String(r.requested_by_identity).trim().toLowerCase()) {
      fallbackLines.push(line);
      continue;
    }

    const bucket = perMailbox.get(email) ?? [];
    bucket.push(line);
    perMailbox.set(email, bucket);
  }

  const digests: ComposedDigest[] = [];

  for (const [email, lines] of [...perMailbox].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...lines].sort(oldestFirst);
    digests.push({
      to: email,
      subject: subjectFor(sorted),
      text: body(sorted, { isFallback: false, ownerCannotDecide: [], baseUrl: args.baseUrl }),
      lines: sorted,
      isFallback: false,
      ownerCannotDecide: [],
    });
  }

  if (fallbackLines.length > 0 && args.fallbackRecipients.length > 0) {
    const sorted = [...fallbackLines].sort(oldestFirst);
    const blocked = [...cannotDecide].sort();
    for (const to of args.fallbackRecipients) {
      digests.push({
        to: to.trim().toLowerCase(),
        subject: subjectFor(sorted),
        text: body(sorted, { isFallback: true, ownerCannotDecide: blocked, baseUrl: args.baseUrl }),
        lines: sorted,
        isFallback: true,
        ownerCannotDecide: blocked,
      });
    }
  }

  return {
    digests,
    orphaned: args.fallbackRecipients.length === 0
      ? [...fallbackLines].sort(oldestFirst)
      : [],
  };
}

/** The oldest item sets the urgency, because that is the one the queue is failing. */
export function subjectFor(lines: ReadonlyArray<DigestLine>): string {
  const n = lines.length;
  const oldest = lines.reduce((m, l) => Math.max(m, l.ageDays), 0);
  const noun = n === 1 ? 'request' : 'requests';
  if (oldest >= 2) return `${n} capability ${noun} waiting, oldest ${oldest} days`;
  return `${n} capability ${noun} waiting on your decision`;
}
