import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { normalizeEmail } from './identityResolution';

/**
 * Resolving whatever identifier an admin surface happens to hold into a person.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Ali, 2026-09-09: "Everytime we are on the admin side of the app and you see a
 * lead/student/person's name, then clicking on them should take you to the 360
 * dashboard."
 *
 * The 360 profile is keyed on email, because email is the only identifier the
 * production data proves unique (see identityResolution.ts). But almost every
 * admin surface that shows a person's name holds only a `lead_id` — the leads
 * table, the pipeline board, the dashboard, opportunities, communications,
 * visitors, the payments ledger and the war room all carry an integer and no
 * address. Some cohort and attendance surfaces hold only an `enrollment_id`.
 *
 * Without this resolver, "link every name to the 360" would mean either adding
 * an email column to a dozen API responses, or linking only the handful of
 * surfaces that already carry one. This is the third option: accept the id the
 * caller has and look the person up once, here.
 *
 * ── THE REF FORMAT ──────────────────────────────────────────────────────────
 *
 *   somebody@example.com      an email — used directly
 *   lead:24945               a leads.id
 *   enrollment:<uuid>        an enrollments.id
 *
 * A bare integer is also accepted as a lead id, because the compatibility
 * redirect from /admin/leads/:id has nothing else to hand over.
 *
 * ── WHY IT RETURNS NULL RATHER THAN GUESSING ────────────────────────────────
 *
 * A lead or enrolment with no usable email cannot be resolved to a person, and
 * this returns null instead of inventing a key. That is the same asymmetry
 * identityResolution.ts enforces: refusing to resolve costs a reader one click;
 * resolving to the wrong person shows them somebody else's history.
 */

export type PersonRefKind = 'email' | 'lead' | 'enrollment';

export interface ParsedPersonRef {
  kind: PersonRefKind;
  value: string;
}

/** Parse a ref string. Returns null when it is not a shape we recognise. */
export function parsePersonRef(raw: string | null | undefined): ParsedPersonRef | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase().startsWith('lead:')) {
    const id = trimmed.slice(5).trim();
    return /^\d+$/.test(id) ? { kind: 'lead', value: id } : null;
  }

  if (trimmed.toLowerCase().startsWith('enrollment:')) {
    const id = trimmed.slice(11).trim();
    // Bounded to a UUID shape so the value cannot smuggle anything into a query.
    return /^[0-9a-fA-F-]{36}$/.test(id) ? { kind: 'enrollment', value: id } : null;
  }

  // A bare integer is a lead id — the shape the /admin/leads/:id redirect sends.
  if (/^\d+$/.test(trimmed)) return { kind: 'lead', value: trimmed };

  const email = normalizeEmail(trimmed);
  if (!email) return null;

  // A local part AND a domain. normalizeEmail only normalises — it accepts
  // '@example.com', which is not an identity and would resolve to nobody. The
  // frontend's personPath already refuses that shape, and the two ends must
  // agree about what counts as an address or a link can be built that this
  // parser then rejects.
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return null;

  return { kind: 'email', value: email };
}

/**
 * The person's canonical email for a ref, or null when none can be established.
 *
 * One query per kind, and no fallback chain: if a lead has no email there is
 * nothing further to try, because email is the only key the profile is built on.
 */
export async function resolveRefToEmail(raw: string | null | undefined): Promise<string | null> {
  const parsed = parsePersonRef(raw);
  if (!parsed) return null;

  if (parsed.kind === 'email') return parsed.value;

  if (parsed.kind === 'lead') {
    const rows = await sequelize.query<{ email: string | null }>(
      `SELECT email FROM leads WHERE id = :id LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { id: Number(parsed.value) } },
    );
    return normalizeEmail(rows[0]?.email ?? null);
  }

  const rows = await sequelize.query<{ email: string | null }>(
    `SELECT email FROM enrollments WHERE id = :id LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: parsed.value } },
  );
  return normalizeEmail(rows[0]?.email ?? null);
}
