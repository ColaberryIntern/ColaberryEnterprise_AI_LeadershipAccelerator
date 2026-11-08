/**
 * The decision half of Phase 3A of the Explorer GoHighLevel backfill: given the contacts the
 * Phase 1 matcher found, which lead rows is it SAFE to write a link onto.
 *
 * Pure on purpose. It performs no I/O, holds no credential and imports nothing, so the rule
 * that decides what gets written to production can be tested without a database, a mock or a
 * GoHighLevel key. The driver that reads and writes is `../explorerGhlLinkRepair.ts`.
 *
 * ── THE RULE, AND THE PRODUCTION CASE THAT FORCED IT ───────────────────────
 *
 * The 196 matches measured on 2026-11-07 resolve to only 192 DISTINCT contact ids. Four
 * contacts are each matched by two different lead rows - one by email, one by phone, adjacent
 * lead ids, same source, same account. That is one person who registered twice with two email
 * addresses and one phone number: `leads` carries a unique index on LOWER(email), so two
 * registrations become two rows while GoHighLevel holds them as one contact.
 *
 * Writing one contact id onto two lead rows would fan a customer-facing record across two of
 * ours, and the next campaign sync would then update that single contact from two sources. So:
 *
 *   one lead matched it            -> link it
 *   several, exactly one by email  -> the email match wins, the rest wait for a human merge
 *   several, otherwise             -> withhold all of them; nothing here ranks one above another
 *   another lead already holds it  -> withhold; that row's owner has evidence this run does not
 *
 * Preferring the email match is not a tie-break of convenience: it is the address GoHighLevel
 * itself holds for that contact, which is strictly better evidence than a phone number two
 * people can share. It is also the order Phase 1 searched in.
 */

/** A candidate that the Phase 1 matcher located in GoHighLevel. */
export interface MatchRow {
  enrollment_id: string;
  lead_id: number;
  source: string | null;
  account: string;
  matched_by: 'email' | 'phone';
  contact_id: string;
  callable: boolean;
  consent_contact: boolean;
}

export interface PlannedLink extends MatchRow {
  /** Always null: the cohort is defined by `ghl_contact_id IS NULL`, re-asserted at write time. */
  previous_contact_id: null;
}

export type WithheldReason =
  /** Several leads matched this contact and the exact-email match won. */
  | 'duplicate_person_withheld'
  /** Several leads matched this contact and nothing broke the tie. */
  | 'collision_unresolved'
  /** Some OTHER lead row already carries this contact id. */
  | 'already_linked_elsewhere';

export interface WithheldRow extends MatchRow {
  reason: WithheldReason;
  /** The lead rows this one collided with, so a human can open them side by side. */
  collided_with: number[];
}

export interface RepairPlan {
  link: PlannedLink[];
  withheld: WithheldRow[];
}

/**
 * Decide, for every match, whether it is safe to write.
 *
 * `existingLinks` maps a contact id to the lead rows that already carry it, which is the one
 * collision the in-batch grouping cannot see on its own.
 *
 * Post-conditions the caller asserts before writing: the contact ids in `link` are distinct
 * (see `fanOutViolations`), and every input row appears exactly once across the two lists.
 */
export function planLinks(matches: MatchRow[], existingLinks: Map<string, number[]>): RepairPlan {
  const byContact = new Map<string, MatchRow[]>();
  for (const m of matches) {
    const group = byContact.get(m.contact_id) || [];
    group.push(m);
    byContact.set(m.contact_id, group);
  }

  const link: PlannedLink[] = [];
  const withheld: WithheldRow[] = [];

  const others = (group: MatchRow[], self: MatchRow): number[] =>
    group.filter((g) => g !== self).map((g) => g.lead_id);

  for (const [contactId, group] of byContact) {
    // A concurrent write could link one of these rows between the lookup and the plan, so the
    // group's own lead ids are excluded: they are not another owner.
    const otherLeads = (existingLinks.get(contactId) || []).filter(
      (id) => !group.some((g) => g.lead_id === id)
    );
    if (otherLeads.length > 0) {
      for (const m of group) {
        withheld.push({ ...m, reason: 'already_linked_elsewhere', collided_with: otherLeads });
      }
      continue;
    }

    if (group.length === 1) {
      link.push({ ...group[0], previous_contact_id: null });
      continue;
    }

    const byEmail = group.filter((m) => m.matched_by === 'email');
    if (byEmail.length === 1) {
      link.push({ ...byEmail[0], previous_contact_id: null });
      for (const m of group) {
        if (m !== byEmail[0]) {
          withheld.push({ ...m, reason: 'duplicate_person_withheld', collided_with: others(group, m) });
        }
      }
      continue;
    }

    for (const m of group) {
      withheld.push({ ...m, reason: 'collision_unresolved', collided_with: others(group, m) });
    }
  }

  return { link, withheld };
}

/**
 * The invariant that makes the write safe: one contact id, one lead row.
 *
 * Returns the offending contact ids, so the driver can name them and abort rather than discover
 * the fan-out later in a CRM that is being worked by hand.
 */
export function fanOutViolations(link: PlannedLink[]): string[] {
  const seen = new Map<string, number>();
  for (const l of link) seen.set(l.contact_id, (seen.get(l.contact_id) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}
