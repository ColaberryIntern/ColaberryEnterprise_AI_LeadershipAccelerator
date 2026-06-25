/**
 * One-shot local dev seed — creates a cohort + 10 dummy executive enrollments
 * with pre-set portal tokens so you can log in without an email flow.
 *
 * Run ONCE before starting the backend for the first time:
 *   npx ts-node backend/src/seeds/seedLocalDev.ts
 *   (from repo root)
 *
 * Then start the backend (npm run dev:backend) — it will auto-seed curriculum
 * and live sessions for the cohort via seedProgramCurriculum().
 *
 * Login URLs printed at the end. Visit them in the browser to enter the portal.
 * Idempotent: safe to re-run; findOrCreate prevents duplicates.
 */

import { randomUUID } from 'crypto';
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';
import Enrollment from '../models/Enrollment';

const COHORT_NAME = 'Cohort - June 2026';

const DUMMY_STUDENTS = [
  { full_name: 'Alexandra Chen',   email: 'a.chen@localdev.test',    company: 'Meridian Health Systems', title: 'Chief Digital Officer' },
  { full_name: 'Marcus Johnson',   email: 'm.johnson@localdev.test',  company: 'Apex Financial Group',    title: 'SVP of Operations' },
  { full_name: 'Priya Nair',       email: 'p.nair@localdev.test',     company: 'GlobalTech Industries',   title: 'VP of Strategy' },
  { full_name: 'David Okafor',     email: 'd.okafor@localdev.test',   company: 'Lakewood Manufacturing',  title: 'CTO' },
  { full_name: 'Sarah Brennan',    email: 's.brennan@localdev.test',  company: 'Vantage Logistics',       title: 'Director of AI Initiatives' },
  { full_name: 'James Park',       email: 'j.park@localdev.test',     company: 'Summit Capital Partners', title: 'Managing Director' },
  { full_name: 'Elena Vasquez',    email: 'e.vasquez@localdev.test',  company: 'Northstar Retail Group',  title: 'Chief Innovation Officer' },
  { full_name: 'Robert Ndlovu',    email: 'r.ndlovu@localdev.test',   company: 'Clearview Energy',        title: 'VP of Digital Transformation' },
  { full_name: 'Meena Pillai',     email: 'm.pillai@localdev.test',   company: 'Horizon Healthcare',      title: 'COO' },
  { full_name: 'Thomas Fitzgerald',email: 't.fitzgerald@localdev.test',company: 'Eastwood Media Group',   title: 'Chief Strategy Officer' },
];

async function run(): Promise<void> {
  await connectDatabase();
  await sequelize.sync();

  // Create cohort
  const [cohort, cohortCreated] = await Cohort.findOrCreate({
    where: { name: COHORT_NAME },
    defaults: {
      name: COHORT_NAME,
      start_date: '2026-06-01',
      core_day: 'Thursday',
      core_time: '1:00–3:00 PM EST',
      optional_lab_day: 'Tuesday',
      max_seats: 20,
      seats_taken: 10,
      status: 'open' as const,
    },
  });

  console.log(`Cohort: ${cohortCreated ? 'created' : 'already exists'} — ${cohort.name} (${cohort.id})`);

  console.log('\n--- Enrollments ---');
  const loginUrls: string[] = [];

  for (const student of DUMMY_STUDENTS) {
    const existingByEmail = await Enrollment.findOne({ where: { email: student.email } });

    if (existingByEmail) {
      const token = existingByEmail.portal_token;
      console.log(`[SKIP] ${student.full_name} — already enrolled`);
      loginUrls.push(`http://localhost:3000/portal/verify?token=${token}  (${student.full_name})`);
      continue;
    }

    const token = randomUUID();
    const tokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    await Enrollment.create({
      full_name: student.full_name,
      email: student.email,
      company: student.company,
      title: student.title,
      cohort_id: cohort.id,
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'test',
      status: 'active',
      portal_enabled: true,
      portal_token: token,
      portal_token_expires_at: tokenExpiry,
      intake_completed: true,
      maturity_level: 1,
    });

    console.log(`[CREATED] ${student.full_name} (${student.email})`);
    loginUrls.push(`http://localhost:3000/portal/verify?token=${token}  (${student.full_name})`);
  }

  console.log('\n=== LOCAL DEV LOGIN URLS ===');
  console.log('Visit any of these in your browser after starting the frontend:\n');
  loginUrls.forEach(url => console.log(url));
  console.log('\nNext step: npm run dev:backend (seeds curriculum automatically), then npm run dev:frontend');

  process.exit(0);
}

run().catch((err) => {
  console.error('[seedLocalDev] FATAL:', err.message);
  process.exit(1);
});
