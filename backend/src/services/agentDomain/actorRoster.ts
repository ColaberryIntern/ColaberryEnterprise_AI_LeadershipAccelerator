/**
 * actorRoster — the people a tool request is allowed to name as acting on its output.
 *
 * ## Why this exists, in Ali's words
 *
 * Ali, 16 Nov 2026, on the design-token drift capability that reached seven builders' boards:
 * *"what good is judging 50 colors and why are we judging them - are we replacing them? What's the
 * goal here - it's not clearly defined... That sounds like a waste of time. Also I need to approve
 * these functionalities because I'm seeing that people are proposing things we don't even need."*
 *
 * Measured against main on 16 Nov 2026, that capability would produce a list of 1,571 distinct
 * colors outside the approved palette across 3,088 styled files. **Nobody was named as acting on
 * that list.** It reached seven builders because nothing in the request path ever asked, and a list
 * nobody reads is indistinguishable from a list nobody needed.
 *
 * `task_unblocked` already names the WORK. It cannot name the PERSON, and the difference is the
 * whole point: "the daily signal triage pass" is a task that can sit unowned forever, where
 * "Sohail" is a person who will either read the output on Monday or will not.
 *
 * ## Why a ROSTER rather than a text field
 *
 * The ticket's wording is *"a named person, resolved against a real people record, not a role and
 * not free text."* Free text would accept `"marketing"`, `"the team"`, `"TBD"` and `"me"`, each of
 * which reads as an answer and names nobody. A role is worse than a blank, because a blank is
 * visibly unanswered.
 *
 * So this is a positive lookup against records we keep, which is the same shape — and for the same
 * stated reason — as `resolveRecordedHumans`: a denylist cannot establish that somebody exists.
 *
 * ## Why BOTH tables, which is not symmetry for its own sake
 *
 * `resolveRecordedHumans` consults `admin_users` and `org_members` and its header records why:
 * *"An intern is an `org_members` row in the agent-domain org; Ali is an `admin_users` row.
 * Checking only one would have silently excluded whichever group it left out."* The same is true
 * here and it bites harder, because the people a tool's output is FOR are mostly not the people
 * filing the request. Sohail, Taiwo, Swati and Roselyn are the accountable humans on the domain
 * projects; the builders are Sarbjit, Mihret, Quincy and the rest. A roster that held only
 * builders would refuse every honest answer to "who acts on this".
 *
 * Measured in production on 16 Nov 2026: 50 `admin_users` rows and 37 `org_members` rows.
 *
 * ## What this module is NOT
 *
 * It is not an authorization check. Naming somebody as the reader of an output grants them nothing
 * and asks them for nothing; `agentToolGrantService` is the only thing that grants, and it has its
 * own separation-of-duties rule. This roster answers exactly one question: is the person named a
 * person we hold a record of.
 *
 * It also deliberately returns no names, titles or roles — only emails, which is the identity
 * currency every other table in this subtree already uses (`requested_by_identity`,
 * `approved_by_identity`, `decided_by`). A second spelling of a person's identity is a second
 * thing to keep in agreement.
 *
 * ## The split, which is the one the rest of this subtree uses
 *
 * The I/O is here and the judgment is in `toolRequestContract.ts`, so every refusal stays testable
 * without a database. `loadActorRoster` **never rejects**: an unreadable roster comes back as
 * `roster_absent: true` and the CALLER decides what that means. The gate turns it into
 * `actor_roster_absent` and REFUSES, because an empty roster that waved a request through would
 * mean the first request filed during a database hiccup is the one that got an unchecked answer —
 * a check that is decorative at exactly the moment it matters. `datasetCatalog.ts` records the same
 * reasoning for the same decision.
 */

import { QueryTypes, type Sequelize } from 'sequelize';
import { AGENT_DOMAIN_ORG_ID } from './agentDomainRegistry';

export interface ActorRoster {
  /**
   * Every email we hold a record of, as STORED. Lowercasing happens at comparison time rather than
   * here, so the spelling written onto a request is the spelling the record carries and the
   * approver reads a person rather than a normalized string.
   */
  readonly emails: ReadonlyArray<string>;
  /**
   * TRUE when the roster could not be read, or came back empty.
   *
   * Both are one fact for a gate's purposes — there is nobody to check a name against — and
   * collapsing them here means no caller has to handle two. The distinction survives in the log
   * line below, where it is a diagnosis rather than a decision.
   */
  readonly roster_absent: boolean;
}

interface RosterRow {
  email: string | null;
}

/**
 * Read the roster. NEVER REJECTS.
 *
 * Filing a tool request must not fail because a people table is briefly unavailable; it must be
 * REFUSED, by name, with a sentence the person filing can act on. A throw here would surface as a
 * 500 and teach a builder that the form is broken rather than that the roster is.
 *
 * The `enrollments` join is carried over from `resolveRecordedHumans` rather than reinvented: an
 * `org_members` row can hold the enrollment's email rather than its own, and dropping the join
 * would quietly shorten the roster by exactly the interns whose record is shaped that way.
 */
export async function loadActorRoster(sequelize: Sequelize): Promise<ActorRoster> {
  try {
    const rows = await sequelize.query<RosterRow>(
      `SELECT au.email AS email FROM admin_users au WHERE au.email IS NOT NULL
        UNION
       SELECT COALESCE(om.email, e.email) AS email
         FROM org_members om
         LEFT JOIN enrollments e ON e.id = om.enrollment_id
        WHERE om.org_id = $1
          AND COALESCE(om.email, e.email) IS NOT NULL`,
      { bind: [AGENT_DOMAIN_ORG_ID], type: QueryTypes.SELECT },
    );

    const emails = rows
      .map((r) => (typeof r.email === 'string' ? r.email.trim() : ''))
      .filter((e) => e.length > 0);

    // De-duplicated on the LOWERCASED form, keeping the first spelling seen. `UNION` already
    // de-duplicates exact matches; it cannot see that `Sohail@colaberry.com` and
    // `sohail@colaberry.com` are one person, and a roster carrying both would let two requests
    // name the same reader in two spellings.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const email of emails) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(email);
    }

    if (unique.length === 0) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'actor_roster_empty',
        outcome: 'failure',
        error_class: 'EmptyRoster',
        context: { rows_returned: rows.length },
      }));
    }

    return { emails: unique, roster_absent: unique.length === 0 };
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'actor_roster_unreadable',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { emails: [], roster_absent: true };
  }
}

/** The roster as the gate takes it: a plain list of emails. */
export function actorEmails(roster: ActorRoster): string[] {
  return [...roster.emails];
}
