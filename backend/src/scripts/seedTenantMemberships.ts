import * as fs from 'fs';
import { AdminUser, Brand, PlatformIdentity, PlatformIdentityLink, Tenant, TenantMembership } from '../models';
import { ensurePlatformIdentity, grantTenantMembership, linkIdentity } from '../modules/identity/platformIdentityService';
import {
  buildMembershipPlan,
  renderMembershipPlan,
  type MembershipPlan,
  type PlannedPerson,
} from '../services/growthJourney/access/membershipPlan';

/**
 * The membership seed tool (Phase 4 T413): tenant access for a roster of
 * admins - and the lock-out list, before anything is written.
 *
 * ─── WHY THE LOCK-OUT LIST IS THE POINT ─────────────────────────────────────
 *
 * While `tenant_memberships` is empty every admin reads every tenant (the
 * migration ramp in `adminScopeBridge`); the first row closes that ramp for
 * EVERYBODY. So this tool prints how many admins will hold no membership after
 * the write, and refuses `--confirm-production` unless `--acknowledge-lockout`
 * names that exact number. Emails are counted, never printed: the lock-out
 * list is admin ids.
 *
 * ─── DRY RUN BY DEFAULT; THE WRITE IS IDEMPOTENT BY THE SERVICE'S OWN KEYS ──
 *
 * No flag is a dry run. A write goes through `platformIdentityService`'s three
 * functions and nothing else - `ensurePlatformIdentity` (keyed on email),
 * `linkIdentity('admin_user')` (keyed on the admin id; an admin already linked
 * to ANOTHER identity is a conflict it reports and never reassigns, and that
 * person's memberships are then skipped, since the admin's token resolves to
 * the other identity - and a conflict the plan already knows skips the identity
 * step too, so no stray `platform_identities` row is minted) and
 * `grantTenantMembership({ status: 'active' })` (keyed
 * on identity, tenant, brand, role). None takes a transaction, so a run that
 * fails midway is completed by running it again. Platform super-admins are
 * granted FIRST, so a run that dies after the first row never leaves the
 * operator locked out of the tool's own consequences - and a super-admin whose
 * admin row is ALREADY linked to a different identity refuses the write outright,
 * because their memberships would be skipped and the first row would close the
 * ramp with the operator behind it. Existing links are read at plan time, so the
 * dry run names every conflict (by admin id) before anything is written.
 *
 * Nothing in the loop runs this against production; that run is Ali's.
 *
 * Usage:
 *   node dist/scripts/seedTenantMemberships.js --roster roster.json
 *   node dist/scripts/seedTenantMemberships.js --roster roster.json --confirm-production --acknowledge-lockout 4
 */

export interface Args {
  rosterPath: string | null;
  dryRun: boolean;
  confirmProduction: boolean;
  acknowledgeLockout: number | null;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { rosterPath: null, dryRun: false, confirmProduction: false, acknowledgeLockout: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--roster') { out.rosterPath = argv[i + 1] ?? null; i += 1; }
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') out.confirmProduction = true;
    else if (a === '--acknowledge-lockout') {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n < 0) throw new Error('--acknowledge-lockout must be a whole number');
      out.acknowledgeLockout = n;
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!out.rosterPath) throw new Error('--roster <path to a JSON roster> is required');
  if (!out.dryRun && !out.confirmProduction) out.dryRun = true;
  return out;
}

/** No production write without the explicit flag (CLAUDE.md) - the guard the other operator tools carry, copied not shared. */
export function assertSafeTarget(args: Args): void {
  if (args.dryRun) return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /accelerator_prod|prod/i.test(url) && !/dev|local|test/i.test(url);
  if (looksProd && !args.confirmProduction) {
    throw new Error('Refusing to write to what looks like production without --confirm-production.');
  }
}

/** The acknowledgement must name the lock-out count EXACTLY - a stale number from an older roster does not count. */
export function assertLockoutAcknowledged(args: Args, plan: MembershipPlan): void {
  if (args.dryRun) return;
  if (args.acknowledgeLockout === null || args.acknowledgeLockout !== plan.counts.lockouts) {
    throw new Error(
      `refusing to write: ${plan.counts.lockouts} admin(s) will hold no membership after this write. ` +
        `Re-run with --acknowledge-lockout ${plan.counts.lockouts} if that is intended.`,
    );
  }
}

/** A platform super-admin already linked to a DIFFERENT identity would be skipped - and the first row would close the ramp with the operator behind it. */
export function assertNoSuperAdminConflict(plan: MembershipPlan): void {
  const conflicted = new Set(plan.link_conflict_admin_ids);
  const supers = plan.people.filter((p) => conflicted.has(p.admin_id) && p.memberships.some((m) => m.role === 'platform_super_admin'));
  if (supers.length) {
    throw new Error(
      `refusing to write: platform super-admin ${supers.map((p) => p.admin_id).join(', ')} is linked to a different identity, ` +
        'so this write would grant them nothing and close the ramp with the operator behind it. Resolve the link by hand, then re-run.',
    );
  }
}

/* ── the reads ──────────────────────────────────────────────────────────────── */

export async function loadWorld(): Promise<{
  admins: { id: string; email: string; is_ai_operated: boolean }[];
  tenants: { id: string; slug: string }[];
  brands: { id: string; slug: string; tenant_id: string }[];
  alreadyCoveredAdminIds: string[];
  membershipTableEmpty: boolean;
  existingLinks: { admin_id: string; identity_email: string }[];
}> {
  const [admins, tenants, brands, membershipCount, links, active] = await Promise.all([
    AdminUser.findAll({ attributes: ['id', 'email', 'is_ai_operated'], raw: true }),
    Tenant.findAll({ attributes: ['id', 'slug'], raw: true }),
    Brand.findAll({ attributes: ['id', 'slug', 'tenant_id'], raw: true }),
    TenantMembership.count(),
    PlatformIdentityLink.findAll({ where: { link_type: 'admin_user' }, attributes: ['platform_identity_id', 'linked_entity_id'], raw: true }),
    TenantMembership.findAll({ where: { status: 'active' }, attributes: ['platform_identity_id'], raw: true }),
  ]);
  const linkRows = links as unknown as { platform_identity_id: string; linked_entity_id: string }[];
  const identitiesWithAccess = new Set((active as unknown as { platform_identity_id: string }[]).map((m) => m.platform_identity_id));
  const alreadyCoveredAdminIds = linkRows
    .filter((l) => identitiesWithAccess.has(l.platform_identity_id))
    .map((l) => String(l.linked_entity_id));
  // The linked identities' emails, read only for the ids that are linked: a link to another address is a conflict.
  const identityIds = [...new Set(linkRows.map((l) => l.platform_identity_id))];
  const identities = identityIds.length
    ? ((await PlatformIdentity.findAll({ where: { id: identityIds }, attributes: ['id', 'primary_email'], raw: true })) as unknown as { id: string; primary_email: string }[])
    : [];
  const emailById = new Map(identities.map((i) => [i.id, i.primary_email]));
  const existingLinks = linkRows.map((l) => ({ admin_id: String(l.linked_entity_id), identity_email: emailById.get(l.platform_identity_id) ?? '' }));
  return {
    admins: (admins as unknown as { id: string; email: string; is_ai_operated: boolean | null }[]).map((a) => ({ id: String(a.id), email: a.email, is_ai_operated: Boolean(a.is_ai_operated) })),
    tenants: (tenants as unknown as { id: string; slug: string }[]).map((t) => ({ id: t.id, slug: t.slug })),
    brands: (brands as unknown as { id: string; slug: string; tenant_id: string }[]).map((b) => ({ id: b.id, slug: b.slug, tenant_id: b.tenant_id })),
    alreadyCoveredAdminIds,
    membershipTableEmpty: membershipCount === 0,
    existingLinks,
  };
}

/* ── the write ──────────────────────────────────────────────────────────────── */

export interface SeedResult {
  identities_created: number;
  identities_existing: number;
  links_created: number;
  links_existing: number;
  link_conflicts: number;
  memberships_created: number;
  memberships_existing: number;
}

/** Platform super-admins first: the first row closes the ramp, and the operator must not be behind it. */
export function writeOrder(people: readonly PlannedPerson[]): PlannedPerson[] {
  const isSuper = (p: PlannedPerson) => p.memberships.some((m) => m.role === 'platform_super_admin');
  return [...people.filter(isSuper), ...people.filter((p) => !isSuper(p))];
}

export async function applyPlan(plan: MembershipPlan): Promise<SeedResult> {
  const r: SeedResult = { identities_created: 0, identities_existing: 0, links_created: 0, links_existing: 0, link_conflicts: 0, memberships_created: 0, memberships_existing: 0 };
  const knownConflicts = new Set(plan.link_conflict_admin_ids);
  for (const person of writeOrder(plan.people)) {
    if (knownConflicts.has(person.admin_id)) {
      r.link_conflicts += 1; // known at plan time: no identity row is minted for an address that would hold nothing
      continue;
    }
    const { identity, created } = await ensurePlatformIdentity({ email: person.email });
    if (created) r.identities_created += 1;
    else r.identities_existing += 1;

    const link = await linkIdentity({ platformIdentityId: identity.id, linkType: 'admin_user', linkedEntityId: person.admin_id, linkSource: 'manual' });
    if (link.conflictWithIdentityId) {
      // The admin's token resolves to the OTHER identity; memberships granted here would grant nothing. Reported, never reassigned.
      r.link_conflicts += 1;
      continue;
    }
    if (link.created) r.links_created += 1;
    else r.links_existing += 1;

    for (const m of person.memberships) {
      const granted = await grantTenantMembership({ platformIdentityId: identity.id, tenantId: m.tenant_id, brandId: m.brand_id, role: m.role, status: 'active' });
      if (granted.created) r.memberships_created += 1;
      else r.memberships_existing += 1;
    }
  }
  return r;
}

export async function run(args: Args, out: (line: string) => void = (l) => console.log(l), readRoster: (p: string) => string = (p) => fs.readFileSync(p, 'utf8')): Promise<number> {
  assertSafeTarget(args);
  let roster: unknown;
  try {
    roster = JSON.parse(readRoster(args.rosterPath as string));
  } catch {
    out('the roster is not readable JSON');
    return 2;
  }
  const world = await loadWorld();
  const plan = buildMembershipPlan({ roster, ...world });
  for (const line of renderMembershipPlan(plan, args.dryRun ? 'dry-run' : 'write')) out(line);
  if (args.dryRun) {
    out(`[dry-run] nothing written. To write: --confirm-production --acknowledge-lockout ${plan.counts.lockouts}`);
    return 0;
  }
  assertLockoutAcknowledged(args, plan);
  assertNoSuperAdminConflict(plan);
  const r = await applyPlan(plan);
  out(`written: identities created=${r.identities_created} existing=${r.identities_existing}; links created=${r.links_created} existing=${r.links_existing} conflicts=${r.link_conflicts}; memberships created=${r.memberships_created} existing=${r.memberships_existing}`);
  if (r.link_conflicts) out(`${r.link_conflicts} admin(s) are linked to a different identity: their memberships were NOT granted; resolve the link by hand.`);
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return run(parseArgs(argv));
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('seedTenantMemberships failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
