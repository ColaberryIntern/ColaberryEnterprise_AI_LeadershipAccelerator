/**
 * CH1.2 Communications Hub access for named staff (Ali, 2026-11-20: "Jackie should have access and Taiwo can have access").
 *
 * The goal is EFFECTIVE access to the `comms_hub` section, made with the smallest change:
 * - a member whose management role already grants it (Jackie, community_organizer, after CH1.1) needs nothing;
 * - anyone else gets `comms_hub` added to `mgmt_extra_sections`, keeping their role and every extra they already hold
 *   (Taiwo: lead_intake + {agents} becomes lead_intake + {agents, comms_hub}).
 * It never creates a member, never changes a management role and never touches a non-staff account (a second, student
 * account with the same name exists on prod). Writes go through the CommunityMember model with normalizeExtraSections,
 * the same rule as PATCH /api/admin/community/members/:memberId/mgmt-extra-sections.
 *
 * Run (prod, after deploy):  node dist/scripts/grantCommsHubAccess.js            dry run, prints the plan
 *                            node dist/scripts/grantCommsHubAccess.js --apply    writes, saves the before-values
 *                            node dist/scripts/grantCommsHubAccess.js --revert <before.json>
 */
import { effectiveSections, normalizeExtraSections } from '../services/access/mgmtRoles';

export const SECTION = 'comms_hub';
export const GRANT_EMAILS = ['jackie@colaberry.com', 'taiwo@colaberry.com'] as const;

export interface MemberRow { id: string; email: string; role: string; mgmt_role: string | null; mgmt_extra_sections: string[] }
export interface MemberStore {
  findByEmail(email: string): Promise<MemberRow[]>;
  findById(id: string): Promise<MemberRow | null>;
  setExtras(id: string, extras: string[]): Promise<void>;
}
export interface GrantStep { email: string; member_id: string; mgmt_role: string; before: string[]; after: string[]; change: boolean }
export class GrantRefusedError extends Error {}

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
  return { email, member_id: m.id, mgmt_role: m.mgmt_role, before, after, change: true };
}

export async function plan(store: MemberStore, emails: readonly string[] = GRANT_EMAILS): Promise<GrantStep[]> {
  const out: GrantStep[] = [];
  for (const e of emails) out.push(planFor(e, await store.findByEmail(e)));
  return out;
}

/** Apply a plan. Returns the steps actually written (empty on a second run). */
export async function apply(store: MemberStore, steps: GrantStep[]): Promise<GrantStep[]> {
  const written: GrantStep[] = [];
  for (const s of steps) {
    if (!s.change) continue;
    await store.setExtras(s.member_id, s.after);
    written.push(s);
  }
  return written;
}

/** Undo exactly what apply wrote. Refuses a member whose extras changed since, so a later edit is never clobbered. */
export async function revert(store: MemberStore, written: GrantStep[]): Promise<string[]> {
  const restored: string[] = [];
  for (const s of written) {
    const now = await store.findById(s.member_id);
    if (!now) throw new GrantRefusedError(`${s.email}: member ${s.member_id} no longer exists`);
    const same = JSON.stringify([...now.mgmt_extra_sections].sort()) === JSON.stringify([...s.after].sort());
    if (!same) throw new GrantRefusedError(`${s.email}: extras changed since the grant (${now.mgmt_extra_sections.join(',')}); revert by hand`);
    await store.setExtras(s.member_id, s.before);
    restored.push(s.email);
  }
  return restored;
}

/** The real store: enrollments.email -> community_members, through the models. */
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
      const ids = enrollments.map((e) => e.get('id') as string);
      const members = await CommunityMember.findAll({ where: { enrollment_id: ids } });
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
        const out = `/tmp/comms-hub-grant-before-${Date.now()}.json`;
        fs.writeFileSync(out, JSON.stringify(written, null, 1));
        console.log(JSON.stringify({ written: written.map((s) => s.email), revert_file: out }));
      }
    }
    await sequelize.close();
    process.exit(0);
  })().catch((err) => {
    console.error(JSON.stringify({ level: 'error', event: 'comms_hub_grant_failed', error_class: err?.constructor?.name, message: err?.message }));
    process.exit(1);
  });
}
