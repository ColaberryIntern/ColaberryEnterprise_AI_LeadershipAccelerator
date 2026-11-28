/**
 * AO1.3 Admissions & Ops Command Center access for Taiwo (M0 Q2 and Q3 defaults, Ali's list 10553095637).
 *
 * Gives Taiwo EFFECTIVE access to the `admissions_ops` section with the smallest change: `admissions_ops` is added to
 * her `mgmt_extra_sections`, keeping her management role and every extra she already holds. Owner and admin already
 * hold the section through their roles, so they need nothing. Same guarantees as grantCommsHubAccess.ts, whose
 * section-agnostic apply/revert this reuses: never creates a member, never changes a management role, never touches a
 * non-staff account, writes through the CommunityMember model with normalizeExtraSections, and --revert refuses when
 * the extras changed since the grant.
 *
 * Run (prod, after the Release 1 deploy):
 *   node dist/scripts/grantAdmissionsOpsAccess.js            dry run, prints the plan
 *   node dist/scripts/grantAdmissionsOpsAccess.js --apply    writes, saves the before-values
 *   node dist/scripts/grantAdmissionsOpsAccess.js --revert <before.json>
 */
import { effectiveSections, normalizeExtraSections } from '../services/access/mgmtRoles';
import { apply, revert, GrantRefusedError, type GrantStep, type MemberRow, type MemberStore } from './grantCommsHubAccess';

export const SECTION = 'admissions_ops';
export const GRANT_EMAILS = ['taiwo@colaberry.com'] as const;

/** The plan for one person. Throws GrantRefusedError rather than guessing. */
export function planFor(email: string, rows: MemberRow[]): GrantStep {
  const staff = rows.filter((r) => r.role === 'staff');
  if (staff.length !== 1) throw new GrantRefusedError(`${email}: expected exactly one staff member, found ${staff.length}`);
  const m = staff[0];
  if (!m.mgmt_role) throw new GrantRefusedError(`${email}: no management role; give one in /admin/community-roles first`);
  const before = [...(m.mgmt_extra_sections ?? [])];
  if (effectiveSections(m.mgmt_role, before).includes(SECTION)) {
    return { email, member_id: m.id, mgmt_role: m.mgmt_role, before, after: before, change: false };
  }
  const after = normalizeExtraSections(m.mgmt_role, [...before, SECTION]);
  if (!after.includes(SECTION)) throw new GrantRefusedError(`${email}: ${SECTION} is not a known section key`);
  return { email, member_id: m.id, mgmt_role: m.mgmt_role, before, after, change: true };
}

export async function plan(store: MemberStore, emails: readonly string[] = GRANT_EMAILS): Promise<GrantStep[]> {
  const out: GrantStep[] = [];
  for (const e of emails) out.push(planFor(e, await store.findByEmail(e)));
  return out;
}

export { apply, revert };

async function modelStore(): Promise<MemberStore> {
  const { Op } = await import('sequelize');
  const { default: CommunityMember } = await import('../models/CommunityMember');
  const { default: Enrollment } = await import('../models/Enrollment');
  const toRow = (m: InstanceType<typeof CommunityMember>, email: string): MemberRow => ({
    id: m.id, email, role: m.role, mgmt_role: m.mgmt_role, mgmt_extra_sections: m.mgmt_extra_sections ?? [],
  });
  return {
    async findByEmail(email) {
      const enrollments = await Enrollment.findAll({ where: { email: { [Op.iLike]: email } }, attributes: ['id', 'email'] });
      if (!enrollments.length) return [];
      const members = await CommunityMember.findAll({ where: { enrollment_id: enrollments.map((e) => e.get('id') as string) } });
      return members.map((m) => toRow(m, email));
    },
    async findById(id) {
      const m = await CommunityMember.findByPk(id);
      return m ? toRow(m, '') : null;
    },
    async setExtras(id, extras) {
      await CommunityMember.update({ mgmt_extra_sections: extras }, { where: { id } });
    },
  };
}

if (require.main === module) {
  (async () => {
    const fs = await import('fs');
    const { sequelize } = await import('../config/database');
    await sequelize.authenticate();
    const store = await modelStore();
    const args = process.argv.slice(2);
    if (args[0] === '--revert') {
      const written: GrantStep[] = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      console.log(JSON.stringify({ reverted: await revert(store, written) }));
    } else {
      const steps = await plan(store);
      console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', steps }, null, 1));
      if (args.includes('--apply')) {
        const written = await apply(store, steps);
        const out = `/tmp/admissions-ops-grant-before-${Date.now()}.json`;
        fs.writeFileSync(out, JSON.stringify(written, null, 1));
        console.log(JSON.stringify({ written: written.map((s) => s.email), revert_file: out }));
      }
    }
    await sequelize.close();
    process.exit(0);
  })().catch((err) => {
    console.error(JSON.stringify({ level: 'error', event: 'admissions_ops_grant_failed', error_class: err?.constructor?.name, message: err?.message }));
    process.exit(1);
  });
}
