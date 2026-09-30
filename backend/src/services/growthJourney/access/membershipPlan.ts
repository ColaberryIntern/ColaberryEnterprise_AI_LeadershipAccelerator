import { isKnownRole, TENANT_ROLES } from '../../../modules/tenancy/tenantRoles';

/**
 * The membership seed plan (Phase 4 T413): what granting tenant access to a
 * roster of admins WOULD do - and, above all, who it would lock out.
 *
 * ─── THE FIRST ROW CLOSES THE DOOR FOR EVERYONE ─────────────────────────────
 *
 * `adminScopeBridge` lets every admin read every tenant while
 * `tenant_memberships` is COMPLETELY EMPTY (`membershipSystemIsUnpopulated`),
 * and that ramp is self-closing by design: the moment the first membership row
 * exists, every admin without one is `denied`. So seeding memberships for
 * three people is also a decision about the other four, and this plan makes
 * that decision visible: `lockouts` is every `admin_users` row the roster does
 * not cover. The script refuses to write unless the operator acknowledges that
 * number exactly - the count, never the addresses (emails are counted, never
 * printed, anywhere in this module's output).
 *
 * ─── REFUSED BEFORE ANY PLAN ────────────────────────────────────────────────
 *
 * An unknown role, an unknown tenant or brand, a brand from another tenant, a
 * roster email that matches no admin, or a malformed entry is a validation
 * error and there is no plan at all: a partly valid roster seeded partly is
 * how access ends up half-granted with nobody sure which half.
 *
 * Pure: the roster, the admins, the tenants and the brands are handed in.
 */

export interface RosterEntry {
  email: string;
  tenant_slug: string;
  /** null grants every brand in the tenant (one membership row, not one per brand). */
  brand_slug: string | null;
  role: string;
}

export interface PlanAdmin {
  id: string;
  email: string;
  /** `ai_staff` rows are agents, not people; counted apart so the lock-out number is legible. */
  is_ai_operated: boolean;
}

export interface PlanTenant {
  id: string;
  slug: string;
}

export interface PlanBrand {
  id: string;
  slug: string;
  tenant_id: string;
}

/** An `admin_user` link that already exists, with the linked identity's email. */
export interface ExistingAdminLink {
  admin_id: string;
  identity_email: string;
}

export interface PlannedPerson {
  admin_id: string;
  /** Normalised; held for the write only and never rendered. */
  email: string;
  memberships: Array<{ tenant_id: string; brand_id: string | null; role: string }>;
}

export interface MembershipPlan {
  people: PlannedPerson[];
  /** True when `tenant_memberships` is empty NOW: this write is the one that closes the ramp for everyone. */
  closes_ramp: boolean;
  counts: {
    identities: number;
    links: number;
    memberships: number;
    lockouts: number;
    lockouts_human: number;
    lockouts_ai_operated: number;
  };
  /** Admin ids (never emails) the roster does not cover - each loses access at the first write. */
  lockout_admin_ids: string[];
  /** Admin ids already linked to a DIFFERENT identity: the service keeps that link, so their memberships are not granted. */
  link_conflict_admin_ids: string[];
}

export class RosterValidationError extends Error {
  readonly error_class = 'ValidationError';
  constructor(readonly problems: string[]) {
    super(`roster refused: ${problems.length} problem(s) - ${problems.join('; ')}`);
    this.name = 'RosterValidationError';
  }
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** The shape of one roster entry, checked field by field; the messages name the row, never its email. */
function shapeProblems(entry: unknown, index: number): string[] {
  const at = `entry ${index + 1}`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [`${at}: not an object`];
  const e = entry as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof e.email !== 'string' || !e.email.includes('@')) problems.push(`${at}: email missing or malformed`);
  if (typeof e.tenant_slug !== 'string' || !e.tenant_slug) problems.push(`${at}: tenant_slug missing`);
  if (!(e.brand_slug === null || (typeof e.brand_slug === 'string' && e.brand_slug.length > 0))) problems.push(`${at}: brand_slug must be a slug or null`);
  if (typeof e.role !== 'string') problems.push(`${at}: role missing`);
  const extra = Object.keys(e).filter((k) => !['email', 'tenant_slug', 'brand_slug', 'role'].includes(k));
  if (extra.length) problems.push(`${at}: unexpected field(s) ${extra.sort().join(', ')}`);
  return problems;
}

export interface BuildMembershipPlanArgs {
  roster: unknown;
  admins: readonly PlanAdmin[];
  tenants: readonly PlanTenant[];
  brands: readonly PlanBrand[];
  /** Admins who ALREADY hold an active membership (an earlier seed): not locked out by this roster. */
  alreadyCoveredAdminIds?: readonly string[];
  /** Is `tenant_memberships` empty right now? */
  membershipTableEmpty: boolean;
  /** The `admin_user` links that already exist - a link to another address is a conflict the write will not resolve. */
  existingLinks?: readonly ExistingAdminLink[];
}

export function buildMembershipPlan(args: BuildMembershipPlanArgs): MembershipPlan {
  if (!Array.isArray(args.roster) || args.roster.length === 0) throw new RosterValidationError(['the roster must be a non-empty array']);

  // 1. Shape, then every reference - all problems at once, and no plan while any stand.
  const problems = args.roster.flatMap(shapeProblems);
  if (problems.length) throw new RosterValidationError(problems);
  const roster = args.roster as RosterEntry[];

  const adminByEmail = new Map(args.admins.map((a) => [normalizeEmail(a.email), a]));
  const tenantBySlug = new Map(args.tenants.map((t) => [t.slug, t]));
  const brandBySlug = new Map(args.brands.map((b) => [b.slug, b]));
  roster.forEach((entry, i) => {
    const at = `entry ${i + 1}`;
    if (!isKnownRole(entry.role)) problems.push(`${at}: unknown role ${JSON.stringify(entry.role)}`);
    if (!adminByEmail.has(normalizeEmail(entry.email))) problems.push(`${at}: no admin_users row for this email`);
    const tenant = tenantBySlug.get(entry.tenant_slug);
    if (!tenant) problems.push(`${at}: unknown tenant ${entry.tenant_slug}`);
    if (entry.brand_slug !== null) {
      const brand = brandBySlug.get(entry.brand_slug);
      if (!brand) problems.push(`${at}: unknown brand ${entry.brand_slug}`);
      else if (tenant && brand.tenant_id !== tenant.id) problems.push(`${at}: brand ${entry.brand_slug} is not in tenant ${entry.tenant_slug}`);
    }
    // A platform super-admin is cross-tenant by its own right: one row, never narrowed to a brand.
    if (entry.role === TENANT_ROLES.PLATFORM_SUPER_ADMIN && entry.brand_slug !== null) {
      problems.push(`${at}: ${TENANT_ROLES.PLATFORM_SUPER_ADMIN} is granted with brand_slug null`);
    }
  });
  if (problems.length) throw new RosterValidationError(problems);

  // 2. One person per admin; memberships de-duplicated on the service's own key (identity, tenant, brand, role).
  const byAdmin = new Map<string, PlannedPerson>();
  for (const entry of roster) {
    const admin = adminByEmail.get(normalizeEmail(entry.email)) as PlanAdmin;
    const tenant = tenantBySlug.get(entry.tenant_slug) as PlanTenant;
    const brand_id = entry.brand_slug === null ? null : (brandBySlug.get(entry.brand_slug) as PlanBrand).id;
    const person = byAdmin.get(admin.id) ?? { admin_id: admin.id, email: normalizeEmail(admin.email), memberships: [] };
    const key = `${tenant.id}/${brand_id ?? '*'}/${entry.role}`;
    if (!person.memberships.some((m) => `${m.tenant_id}/${m.brand_id ?? '*'}/${m.role}` === key)) {
      person.memberships.push({ tenant_id: tenant.id, brand_id, role: entry.role });
    }
    byAdmin.set(admin.id, person);
  }
  const people = [...byAdmin.values()];

  // 3. Plan-time link conflicts: an admin already linked to a different identity keeps that link (the
  //    service never reassigns), so the roster's memberships for them would grant nothing they can use.
  const linkedEmail = new Map((args.existingLinks ?? []).map((l) => [l.admin_id, normalizeEmail(l.identity_email)]));
  const conflicted = people.filter((p) => linkedEmail.has(p.admin_id) && linkedEmail.get(p.admin_id) !== p.email);
  const conflictIds = new Set(conflicted.map((p) => p.admin_id));

  // 4. The lock-out list: every admin with no membership AFTER this write - not in the roster (or in it
  //    but conflicted) and not already covered by an earlier seed.
  const granted = people.filter((p) => !conflictIds.has(p.admin_id)).map((p) => p.admin_id);
  const covered = new Set([...granted, ...(args.alreadyCoveredAdminIds ?? [])]);
  const locked = args.admins.filter((a) => !covered.has(a.id));
  return {
    people,
    closes_ramp: args.membershipTableEmpty,
    counts: {
      identities: people.length,
      links: people.length,
      memberships: people.reduce((n, p) => n + p.memberships.length, 0),
      lockouts: locked.length,
      lockouts_human: locked.filter((a) => !a.is_ai_operated).length,
      lockouts_ai_operated: locked.filter((a) => a.is_ai_operated).length,
    },
    lockout_admin_ids: locked.map((a) => a.id).sort(),
    link_conflict_admin_ids: conflicted.map((p) => p.admin_id).sort(),
  };
}

/** The operator's view: counts and admin ids, never an email. */
export function renderMembershipPlan(plan: MembershipPlan, mode: 'dry-run' | 'write' = 'dry-run'): string[] {
  const c = plan.counts;
  return [
    mode === 'dry-run' ? 'membership seed plan (dry run — nothing written)' : 'membership seed (writing)',
    `  identities: ${c.identities}`,
    `  admin links: ${c.links}`,
    `  memberships: ${c.memberships}`,
    plan.closes_ramp
      ? '  tenant_memberships is EMPTY now: this write closes the migration ramp for EVERY admin'
      : '  tenant_memberships already has rows: the ramp is closed; this write changes access only for the roster',
    `  LOCK-OUT: ${c.lockouts} admin(s) will hold no membership after this write and are denied every tenant (${c.lockouts_human} human, ${c.lockouts_ai_operated} AI-operated)`,
    ...(plan.lockout_admin_ids.length ? [`  lock-out admin ids: ${plan.lockout_admin_ids.join(', ')}`] : []),
    ...(plan.link_conflict_admin_ids.length
      ? [`  LINK CONFLICT: ${plan.link_conflict_admin_ids.length} admin(s) already linked to a different identity - the link stays, and their memberships above will NOT be granted: ${plan.link_conflict_admin_ids.join(', ')}`]
      : []),
  ];
}
