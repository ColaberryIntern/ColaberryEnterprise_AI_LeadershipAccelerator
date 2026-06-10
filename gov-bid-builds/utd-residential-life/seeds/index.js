// Seed entry point. Populates the demo with realistic fake data so
// visitors see a working system, not empty tables.
//
// Run: npm run seed
//
// SEED_RESET=true wipes existing data first (set in .env.example).

'use strict';
const db = require('../app/db');

const RESET = process.env.SEED_RESET === 'true';

if (RESET) {
  console.log('[seed] Resetting tables…');
  db.exec('DELETE FROM notifications; DELETE FROM incident_reports; DELETE FROM users;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('notifications','incident_reports','users');");
}

const existingCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (existingCount > 0 && !RESET) {
  console.log('[seed] Database already seeded. Use SEED_RESET=true to reseed.');
  process.exit(0);
}

// ── Users ─────────────────────────────────────────────────────────────────────
const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (name, email, role, building) VALUES (?, ?, ?, ?)'
);

const USERS = [
  { name: 'Dr. Sarah Chen',    email: 'sarah.chen@utd.edu',    role: 'residence_director',   building: 'All Buildings' },
  { name: 'Marcus Williams',   email: 'marcus.williams@utd.edu', role: 'community_coordinator', building: 'Andrews Hall' },
  { name: 'Priya Patel',       email: 'priya.patel@utd.edu',   role: 'community_coordinator', building: 'Caruth Hall' },
  { name: 'Jake Thompson',     email: 'jake.thompson@utd.edu', role: 'student_staff',         building: 'Andrews Hall' },
  { name: 'Aisha Johnson',     email: 'aisha.johnson@utd.edu', role: 'student_staff',         building: 'Berkner Hall' },
  { name: 'Diego Ramirez',     email: 'diego.ramirez@utd.edu', role: 'student_staff',         building: 'Hillhouse' },
  { name: 'Emma Lee',          email: 'emma.lee@utd.edu',      role: 'student_staff',         building: 'Caruth Hall' },
];

for (const u of USERS) insertUser.run(u.name, u.email, u.role, u.building);

const allUsers = db.prepare('SELECT id, role, building FROM users ORDER BY id').all();
const rd  = allUsers.find(u => u.role === 'residence_director');
const ccs = allUsers.filter(u => u.role === 'community_coordinator');
const sss = allUsers.filter(u => u.role === 'student_staff');

const rdId  = rd?.id;
const ccId  = ccs[0]?.id;
const cc2Id = ccs[1]?.id;
const ss0Id = sss[0]?.id;
const ss1Id = sss[1]?.id;
const ss2Id = sss[2]?.id;
const ss3Id = sss[3]?.id;

// ── Reports ───────────────────────────────────────────────────────────────────
const insertReport = db.prepare(`
  INSERT INTO incident_reports
    (form_type, status, reporter_id, building, room_number, description,
     occurred_at, form_data, escalated_to_id, escalation_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const REPORTS = [
  // Noise complaints
  {
    form_type: 'noise_complaint', status: 'escalated',
    reporter_id: ss0Id, building: 'Andrews Hall', room_number: '214',
    description: 'Loud music and shouting from room 214. Knocked twice — residents refused to turn it down. Music audible from hallway on two floors.',
    occurred_at: '2026-06-09T23:15:00',
    form_data: { noise_type: 'loud music', resident_notified: 'attempted' },
    escalated_to_id: rdId,
    escalation_reason: 'Noise complaint filed during quiet hours (10 PM – 8 AM)',
  },
  {
    form_type: 'noise_complaint', status: 'resolved',
    reporter_id: ccId, building: 'Caruth Hall', room_number: '108',
    description: 'Unscheduled party in common area, approximately 15 residents. Dispersed after single warning. Area cleaned by midnight.',
    occurred_at: '2026-06-07T22:45:00',
    form_data: { noise_type: 'party', resident_notified: 'yes' },
    escalated_to_id: rdId,
    escalation_reason: 'Noise complaint filed during quiet hours (10 PM – 8 AM)',
  },
  {
    form_type: 'noise_complaint', status: 'open',
    reporter_id: ss1Id, building: 'Berkner Hall', room_number: '301',
    description: 'Neighbor complaint: TV volume very high. Third complaint this week from the same neighbor. Attempted contact — no answer.',
    occurred_at: '2026-06-10T14:30:00',
    form_data: { noise_type: 'television', resident_notified: 'attempted' },
    escalated_to_id: null, escalation_reason: null,
  },
  {
    form_type: 'noise_complaint', status: 'in_progress',
    reporter_id: ss2Id, building: 'Hillhouse', room_number: '410',
    description: 'Electric guitar being played at 11:30 PM. Resident reminded of quiet hours and agreed to stop.',
    occurred_at: '2026-06-06T23:30:00',
    form_data: { noise_type: 'instrument', resident_notified: 'yes' },
    escalated_to_id: rdId,
    escalation_reason: 'Noise complaint filed during quiet hours (10 PM – 8 AM)',
  },

  // Lockouts
  {
    form_type: 'lockout', status: 'resolved',
    reporter_id: ss0Id, building: 'Andrews Hall', room_number: '412',
    description: 'Student locked out after forgetting key at the dining hall. University ID verified. Entry granted.',
    occurred_at: '2026-06-08T19:20:00',
    form_data: { student_name: 'Alex Kim', student_id: 'ATD-2024-0892', id_verified: 'yes' },
    escalated_to_id: null, escalation_reason: null,
  },
  {
    form_type: 'lockout', status: 'resolved',
    reporter_id: ss2Id, building: 'Hillhouse', room_number: '205',
    description: 'Student locked out — key snapped inside lock. Facilities notified for lock replacement. Student relocated to guest room for the night.',
    occurred_at: '2026-06-10T08:05:00',
    form_data: { student_name: 'Briana Foster', student_id: 'ATD-2024-1133', id_verified: 'yes' },
    escalated_to_id: null, escalation_reason: null,
  },
  {
    form_type: 'lockout', status: 'open',
    reporter_id: ss3Id, building: 'Caruth Hall', room_number: '317',
    description: 'Student locked out while taking out trash. Left key inside. Entry granted after ID check.',
    occurred_at: '2026-06-10T20:45:00',
    form_data: { student_name: 'Theo Nguyen', student_id: 'ATD-2025-0044', id_verified: 'yes' },
    escalated_to_id: null, escalation_reason: null,
  },

  // On-call logs
  {
    form_type: 'on_call_log', status: 'resolved',
    reporter_id: ss0Id, building: 'Andrews Hall', room_number: null,
    description: 'Completed 10 PM – 2 AM rounds on all 4 floors. Two lockouts assisted (rooms 214, 412). One noise complaint escalated to RD. Common areas checked — all clear.',
    occurred_at: '2026-06-09T22:00:00',
    form_data: { duty_type: 'RA on duty', rounds_completed: 'yes', follow_up_needed: 'yes' },
    escalated_to_id: null, escalation_reason: null,
  },
  {
    form_type: 'on_call_log', status: 'open',
    reporter_id: ss3Id, building: 'Caruth Hall', room_number: null,
    description: 'Currently on duty 8 PM – midnight. Minor liquid spill on 2nd floor common area — cleaned up immediately. Rounds in progress.',
    occurred_at: '2026-06-10T20:00:00',
    form_data: { duty_type: 'RA on duty', rounds_completed: 'partial', follow_up_needed: 'no' },
    escalated_to_id: null, escalation_reason: null,
  },

  // Roommate agreements
  {
    form_type: 'roommate_agreement', status: 'resolved',
    reporter_id: ccId, building: 'Andrews Hall', room_number: '320',
    description: 'Fall 2026 roommate agreement completed. Both residents present and in agreement. Copy filed in ResLife office.',
    occurred_at: '2026-06-01T10:00:00',
    form_data: {
      roommate_names: 'Alex Kim, Jordan Park',
      quiet_hours: '11 PM – 9 AM',
      guest_policy: 'Guests allowed up to 3 consecutive nights; 24-hour notice required',
      cleaning_schedule: 'Alternating weeks for bathroom; common area cleaned together every Sunday',
      additional_agreements: 'No cooking in room; thermostat between 70–74°F; desk lamps only after midnight',
    },
    escalated_to_id: null, escalation_reason: null,
  },
  {
    form_type: 'roommate_agreement', status: 'resolved',
    reporter_id: cc2Id, building: 'Caruth Hall', room_number: '215',
    description: 'Mid-semester agreement update after conflict mediation. Previous agreement revised to address study hours and guest frequency.',
    occurred_at: '2026-05-15T14:00:00',
    form_data: {
      roommate_names: 'Mia Torres, Priya Singh',
      quiet_hours: '10 PM – 8 AM',
      guest_policy: 'No overnight guests on weeknights',
      cleaning_schedule: 'Weekly rotation tracked on door whiteboard',
      additional_agreements: 'Study hour quiet zone 7–10 PM; no phone calls in room after 10 PM',
    },
    escalated_to_id: null, escalation_reason: null,
  },

  // Performance evaluations
  {
    form_type: 'evaluation', status: 'resolved',
    reporter_id: ccId, building: null, room_number: null,
    description: 'Spring 2026 performance review for Jake Thompson. Strong event planning and resident relations. Documentation needs improvement — two incident reports filed late this semester.',
    occurred_at: '2026-06-05T14:00:00',
    form_data: {
      evaluatee_name: 'Jake Thompson',
      evaluation_period: 'Spring 2026',
      overall_rating: '4',
      communication_rating: '4',
      event_planning_rating: '5',
      crisis_response_rating: '3',
      recommendations: 'Complete incident report training module by July 1. Strong candidate for CC role next year — excellent peer relationships.',
    },
    escalated_to_id: null, escalation_reason: null,
  },
  {
    form_type: 'evaluation', status: 'resolved',
    reporter_id: cc2Id, building: null, room_number: null,
    description: 'Spring 2026 evaluation for Emma Lee. Consistent performer across all areas. Demonstrated exceptional crisis response during the February flooding incident.',
    occurred_at: '2026-06-05T16:00:00',
    form_data: {
      evaluatee_name: 'Emma Lee',
      evaluation_period: 'Spring 2026',
      overall_rating: '5',
      communication_rating: '5',
      event_planning_rating: '4',
      crisis_response_rating: '5',
      recommendations: 'Nominate for ResLife Staff Excellence Award. Ready for senior RA responsibilities in Fall 2026.',
    },
    escalated_to_id: null, escalation_reason: null,
  },
];

const insertNotification = db.prepare(
  'INSERT INTO notifications (user_id, report_id, message) VALUES (?, ?, ?)'
);

for (const r of REPORTS) {
  const result = insertReport.run(
    r.form_type, r.status, r.reporter_id, r.building, r.room_number,
    r.description, r.occurred_at, JSON.stringify(r.form_data),
    r.escalated_to_id, r.escalation_reason
  );
  const reportId = result.lastInsertRowid;

  // Seed notifications for escalated reports
  if (r.escalated_to_id && rdId) {
    insertNotification.run(
      rdId, reportId,
      `Escalated ${r.form_type.replace(/_/g, ' ')} #${reportId} at ${r.building || 'unknown'} — ${r.escalation_reason}`
    );
  }
  // Seed lockout notification for CC
  if (r.form_type === 'lockout' && ccId) {
    insertNotification.run(
      ccId, reportId,
      `Lockout #${reportId} at ${r.building || 'unknown'} Rm ${r.room_number || '?'} — please assist`
    );
  }
}

console.log(`[seed] ${USERS.length} users, ${REPORTS.length} reports seeded.`);
console.log(`[seed] Sign in at http://localhost:3000/login`);
process.exit(0);
