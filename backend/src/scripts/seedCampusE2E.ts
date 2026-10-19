/**
 * Seed the four campus audiences into the LOCAL e2e database. Never production.
 *
 *   member    standard enrollment, paid
 *   explorer  enrollment_type 'explorer'
 *   business  owner of an organization
 *   staff     community member with role 'staff' and mgmt_role 'admin'
 *
 * All in one cohort named "campus-e2e-marker"; the e2e reads that name back through
 * GET /api/portal/profile to prove the running backend is reading THIS database.
 *
 * Idempotent: fixed ids and emails, find-or-create, then update to the fixed shape. Running it twice
 * leaves the same rows. Prints the participant JWTs as JSON (to --out when given, else stdout).
 *
 * Failure modes: the guard refuses anything but the local campus_e2e database and exits 2 BEFORE
 * any model is imported (importing models opens the connection). A database error exits 1 with the
 * error class; nothing is retried, because a rerun is safe.
 *
 * Usage (from backend/): DATABASE_URL=postgres://campus:campus@127.0.0.1:55452/campus_e2e \
 *   node <ts-node> --transpile-only src/scripts/seedCampusE2E.ts --out ../tmp/campus-e2e-tokens.json
 */
import fs from 'fs';
import path from 'path';
import { checkCampusE2EDatabase } from './lib/campusE2EGuard';

export const MARKER_COHORT = 'campus-e2e-marker';
const COHORT_ID = '0e2e0000-0000-4000-8000-000000000001';
const ORG_ID = '0e2e0000-0000-4000-8000-0000000000a1';

export interface AudienceSeed {
  key: 'member' | 'explorer' | 'business' | 'staff';
  id: string;
  email: string;
  full_name: string;
  enrollment_type: 'standard' | 'explorer';
}

export const AUDIENCES: readonly AudienceSeed[] = [
  { key: 'member', id: '0e2e0000-0000-4000-8000-000000000101', email: 'campus-e2e-member@colaberry.test', full_name: 'Morgan Member', enrollment_type: 'standard' },
  { key: 'explorer', id: '0e2e0000-0000-4000-8000-000000000102', email: 'campus-e2e-explorer@colaberry.test', full_name: 'Ellis Explorer', enrollment_type: 'explorer' },
  { key: 'business', id: '0e2e0000-0000-4000-8000-000000000103', email: 'campus-e2e-business@colaberry.test', full_name: 'Blair Business', enrollment_type: 'standard' },
  { key: 'staff', id: '0e2e0000-0000-4000-8000-000000000104', email: 'campus-e2e-staff@colaberry.test', full_name: 'Sasha Staff', enrollment_type: 'standard' },
];

async function seed(): Promise<Record<string, { enrollment_id: string; jwt: string }>> {
  // Imported only after the guard passed: these open the database connection.
  const { Enrollment, Cohort, CommunityMember, Organization, AiAgent } = await import('../models');
  const { signParticipantJwt } = await import('../services/participantService');

  const { seedAgentRegistry } = await import('../services/agentRegistrySeed');

  const [cohort] = await Cohort.findOrCreate({
    where: { id: COHORT_ID },
    defaults: { id: COHORT_ID, name: MARKER_COHORT, start_date: '2026-10-05', core_day: 'Thursday', core_time: '6:00 PM', max_seats: 30, seats_taken: 4, status: 'open' },
  });
  await cohort.update({ name: MARKER_COHORT, status: 'open' });

  const out: Record<string, { enrollment_id: string; jwt: string }> = {};
  for (const a of AUDIENCES) {
    const fields = {
      full_name: a.full_name, email: a.email, company: 'Campus E2E', cohort_id: COHORT_ID,
      enrollment_type: a.enrollment_type, payment_status: 'paid' as const, payment_method: 'invoice' as const, status: 'active' as const, portal_enabled: true,
    };
    const [row] = await Enrollment.findOrCreate({ where: { id: a.id }, defaults: { id: a.id, ...fields } });
    await row.update(fields);
    out[a.key] = { enrollment_id: a.id, jwt: signParticipantJwt({ id: row.id, email: row.email, cohort_id: row.cohort_id ?? null }) };
  }

  const staff = AUDIENCES.find((a) => a.key === 'staff')!;
  const [member] = await CommunityMember.findOrCreate({
    where: { enrollment_id: staff.id },
    defaults: { enrollment_id: staff.id, display_name: staff.full_name },
  });
  await member.update({ display_name: staff.full_name, role: 'staff', mgmt_role: 'admin' });

  const business = AUDIENCES.find((a) => a.key === 'business')!;
  const [org] = await Organization.findOrCreate({
    where: { id: ORG_ID },
    defaults: { id: ORG_ID, name: 'Campus E2E Co', owner_enrollment_id: business.id },
  });
  await org.update({ owner_enrollment_id: business.id, status: 'active' });

  // The desks (S4): the agent registry, which creates the Reese and Dara agent rows and then their
  // identities (seedReeseIdentity / seedDaraIdentity need the registry row first). The same idempotent
  // find-or-create production uses. Maya needs no row; her desk follows the Growth Journey flags.
  await seedAgentRegistry();
  // The registry ships Dara disabled; on THIS throwaway database both desks are switched on so the e2e can reach them.
  // A running backend caches the desk identities: restart it after the first seed (campus-stack.md).
  await AiAgent.update({ enabled: true }, { where: { agent_name: ['Reese', 'Dara'] } });

  return out;
}

async function main(): Promise<void> {
  const guard = checkCampusE2EDatabase(process.env);
  if (!guard.ok) {
    console.error(JSON.stringify({ event: 'campus_e2e_seed_refused', outcome: 'failure', error_class: 'ValidationError', reason: guard.reason }));
    process.exit(2);
  }
  try {
    const tokens = await seed();
    const outIdx = process.argv.indexOf('--out');
    const body = JSON.stringify({ cohort: MARKER_COHORT, users: tokens }, null, 2);
    if (outIdx > -1 && process.argv[outIdx + 1]) {
      const file = path.resolve(process.argv[outIdx + 1]);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      console.log(JSON.stringify({ event: 'campus_e2e_seeded', outcome: 'success', out: file, users: Object.keys(tokens) }));
    } else {
      console.log(body);
    }
    const { sequelize } = await import('../config/database');
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    const e = err as Error;
    console.error(JSON.stringify({ event: 'campus_e2e_seed_failed', outcome: 'failure', error_class: e.name || 'DatabaseError', message: e.message }));
    process.exit(1);
  }
}

if (require.main === module) void main();
