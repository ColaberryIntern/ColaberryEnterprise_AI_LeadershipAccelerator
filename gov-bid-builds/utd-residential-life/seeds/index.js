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
  db.exec('DELETE FROM program_proposals; DELETE FROM curriculum_outcomes;');
  db.exec('DELETE FROM shift_swaps; DELETE FROM shifts;');
  db.exec('DELETE FROM notifications; DELETE FROM incident_reports; DELETE FROM users;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('program_proposals','curriculum_outcomes','shift_swaps','shifts','notifications','incident_reports','users');");
}

const existingCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
const skipUsersReports = existingCount > 0 && !RESET;
if (skipUsersReports) {
  console.log('[seed] Users/reports already seeded — skipping to shifts check.');
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

if (!skipUsersReports) {
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
} // end if (!skipUsersReports)

// ── Shifts ────────────────────────────────────────────────────────────────────
const shiftCount = db.prepare('SELECT COUNT(*) AS c FROM shifts').get().c;
if (shiftCount === 0 || RESET) {
  if (RESET) {
    db.exec('DELETE FROM shift_swaps; DELETE FROM shifts;');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('shift_swaps','shifts');");
  }

  const insertShift = db.prepare(`
    INSERT INTO shifts (shift_type, assigned_user_id, start_time, end_time, notes, status, created_by_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Week of 2026-06-15 (Mon) – 2026-06-21 (Sun), plus next Mon 6/22 and two completed from prior week
  const SHIFTS = [
    // Mon 6/15
    { t: 'front_desk', u: ss0Id, s: '2026-06-15T08:00:00', e: '2026-06-15T16:00:00', n: 'Andrews Hall front desk', st: 'scheduled' },
    { t: 'on_call',    u: ss1Id, s: '2026-06-15T22:00:00', e: '2026-06-16T06:00:00', n: 'Berkner Hall overnight', st: 'scheduled' },
    // Tue 6/16
    { t: 'front_desk', u: ss1Id, s: '2026-06-16T08:00:00', e: '2026-06-16T16:00:00', n: 'Andrews Hall front desk', st: 'scheduled' },
    { t: 'on_call',    u: ss2Id, s: '2026-06-16T22:00:00', e: '2026-06-17T06:00:00', n: 'Hillhouse overnight', st: 'scheduled' },
    // Wed 6/17
    { t: 'front_desk', u: ss2Id, s: '2026-06-17T08:00:00', e: '2026-06-17T16:00:00', n: 'Andrews Hall front desk', st: 'scheduled' },
    { t: 'on_call',    u: ss3Id, s: '2026-06-17T22:00:00', e: '2026-06-18T06:00:00', n: 'Caruth Hall overnight', st: 'scheduled' },
    // Thu 6/18
    { t: 'front_desk', u: ss3Id, s: '2026-06-18T08:00:00', e: '2026-06-18T16:00:00', n: 'Andrews Hall front desk', st: 'scheduled' },
    { t: 'on_call',    u: ss0Id, s: '2026-06-18T22:00:00', e: '2026-06-19T06:00:00', n: 'Andrews Hall overnight', st: 'scheduled' },
    // Fri 6/19 — Jake (ss0Id) has this front desk; seeded swap request references it (index 8)
    { t: 'front_desk', u: ss0Id, s: '2026-06-19T08:00:00', e: '2026-06-19T16:00:00', n: 'Andrews Hall front desk', st: 'scheduled' },
    { t: 'on_call',    u: ss1Id, s: '2026-06-19T22:00:00', e: '2026-06-20T06:00:00', n: 'Berkner Hall overnight', st: 'scheduled' },
    // Sat 6/20
    { t: 'ra_duty',    u: ccId,  s: '2026-06-20T10:00:00', e: '2026-06-20T22:00:00', n: 'Weekend CC coverage — all buildings', st: 'scheduled' },
    { t: 'on_call',    u: ss2Id, s: '2026-06-20T22:00:00', e: '2026-06-21T06:00:00', n: 'Hillhouse overnight', st: 'scheduled' },
    // Sun 6/21
    { t: 'ra_duty',    u: cc2Id, s: '2026-06-21T10:00:00', e: '2026-06-21T22:00:00', n: 'Weekend CC coverage — all buildings', st: 'scheduled' },
    { t: 'on_call',    u: ss3Id, s: '2026-06-21T22:00:00', e: '2026-06-22T06:00:00', n: 'Caruth Hall overnight', st: 'scheduled' },
    // Next Mon 6/22
    { t: 'front_desk', u: ss1Id, s: '2026-06-22T08:00:00', e: '2026-06-22T16:00:00', n: 'Andrews Hall front desk', st: 'scheduled' },
    { t: 'on_call',    u: ss0Id, s: '2026-06-22T22:00:00', e: '2026-06-23T06:00:00', n: 'Andrews Hall overnight', st: 'scheduled' },
    // Prior week — completed
    { t: 'front_desk', u: ss3Id, s: '2026-06-13T08:00:00', e: '2026-06-13T16:00:00', n: 'Andrews Hall front desk', st: 'completed' },
    { t: 'on_call',    u: ss0Id, s: '2026-06-13T22:00:00', e: '2026-06-14T06:00:00', n: 'Andrews Hall overnight', st: 'completed' },
  ];

  const shiftIds = SHIFTS.map(s =>
    insertShift.run(s.t, s.u, s.s, s.e, s.n, s.st, rdId).lastInsertRowid
  );

  // Pending swap: Jake (ss0Id) wants to swap his Fri 6/19 front desk (index 8) with Aisha (ss1Id)
  const swapShiftId = shiftIds[8];
  db.prepare(`
    INSERT INTO shift_swaps (shift_id, requester_id, swap_with_user_id, reason, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(swapShiftId, ss0Id, ss1Id, 'Academic exam Friday morning — need front desk coverage');

  // Notifications for the seeded swap
  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    ss1Id, 'Jake Thompson requested you cover their Front Desk shift on Fri, Jun 19 (8 AM – 4 PM)'
  );
  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    ccId, "Swap request pending: Jake Thompson's Front Desk on Fri, Jun 19 needs your approval"
  );

  console.log(`[seed] ${SHIFTS.length} shifts seeded, 1 swap request seeded.`);
} else {
  console.log('[seed] Shifts already seeded, skipping.');
}

// ── Curriculum Outcomes ───────────────────────────────────────────────────────
const outcomeCount = db.prepare('SELECT COUNT(*) AS c FROM curriculum_outcomes').get().c;
if (outcomeCount === 0 || RESET) {
  const insertOutcome = db.prepare(
    'INSERT OR IGNORE INTO curriculum_outcomes (code, title, description, category) VALUES (?, ?, ?, ?)'
  );
  const OUTCOMES = [
    ['CB-01', 'Community Connection',    'Residents build meaningful relationships with peers and staff through intentional programming and shared experiences.', 'community_building'],
    ['AS-01', 'Academic Engagement',     'Residents access campus academic resources, develop study habits, and connect with faculty and tutoring support.', 'academic_success'],
    ['WL-01', 'Personal Wellness',       'Residents practice self-care, stress management, and healthy lifestyle habits during their college years.', 'wellness'],
    ['DI-01', 'Inclusive Community',     'Residents engage with diverse identities, perspectives, and cultures to create a welcoming living environment.', 'diversity_inclusion'],
    ['LD-01', 'Leadership Development',  'Residents identify leadership strengths, contribute to community decision-making, and develop professional skills.', 'leadership'],
  ];
  for (const [code, title, desc, cat] of OUTCOMES) insertOutcome.run(code, title, desc, cat);
  console.log(`[seed] ${OUTCOMES.length} curriculum outcomes seeded.`);
}

const outcomes = db.prepare('SELECT id, code FROM curriculum_outcomes').all();
const outcomeId = code => outcomes.find(o => o.code === code)?.id;

// ── Program Proposals ─────────────────────────────────────────────────────────
const proposalCount = db.prepare('SELECT COUNT(*) AS c FROM program_proposals').get().c;
if (proposalCount === 0 || RESET) {
  const insertProposal = db.prepare(`
    INSERT INTO program_proposals
      (title, description, target_audience, proposed_date, budget_estimate,
       expected_outcomes, outcome_id, submitter_id, status, reviewed_by_id, review_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const PROPOSALS = [
    {
      title: 'Finals Week Survival Kit Night',
      description: 'Pop-up event providing snacks, school supplies, and stress-relief activities during finals week. Includes a designated quiet study corner.',
      target_audience: 'All Andrews Hall residents',
      proposed_date: '2026-07-28',
      budget: 180,
      expected_outcomes: 'Residents feel supported during a high-stress period; 30+ attendees; positive feedback on community survey.',
      outcome_code: 'WL-01',
      submitter_id: ss0Id,
      status: 'approved',
      reviewed_by_id: rdId,
      review_notes: 'Great idea — aligns well with our wellness pillar. Coordinate with Dining Services for donation.',
      created_at: '2026-06-01T10:00:00',
    },
    {
      title: 'Diversity Dinner: Around the World',
      description: 'Residents bring or prepare a dish from their cultural background and share its significance. Short "story-behind-the-dish" cards displayed at each station.',
      target_audience: 'All residents across buildings',
      proposed_date: '2026-07-15',
      budget: 250,
      expected_outcomes: 'Cross-cultural dialogue; residents learn about at least 3 new cultural traditions; 20+ dishes represented.',
      outcome_code: 'DI-01',
      submitter_id: ccId,
      status: 'approved',
      reviewed_by_id: rdId,
      review_notes: 'Approved — excellent cross-building collaboration opportunity. Request photos for our Instagram.',
      created_at: '2026-06-03T11:30:00',
    },
    {
      title: 'Resume + LinkedIn Headshot Workshop',
      description: 'Partner with Career Services for a drop-in resume review session. Student photographer available for free professional headshots.',
      target_audience: 'Sophomores and juniors in Caruth Hall',
      proposed_date: '2026-07-22',
      budget: 75,
      expected_outcomes: 'Residents leave with an updated resume draft and LinkedIn headshot; 15+ participants expected.',
      outcome_code: 'LD-01',
      submitter_id: cc2Id,
      status: 'pending',
      reviewed_by_id: null,
      review_notes: null,
      created_at: '2026-06-08T09:15:00',
    },
    {
      title: 'Mid-Semester Study Groups Launch',
      description: 'Facilitate formation of peer study groups by matching residents based on shared courses. Provide snacks and dedicated study space.',
      target_audience: 'First-year residents in all buildings',
      proposed_date: '2026-07-10',
      budget: 60,
      expected_outcomes: 'At least 8 study groups formed; follow-up survey at finals shows improved academic confidence.',
      outcome_code: 'AS-01',
      submitter_id: ss2Id,
      status: 'pending',
      reviewed_by_id: null,
      review_notes: null,
      created_at: '2026-06-09T14:00:00',
    },
    {
      title: 'Berkner Hall Game Night',
      description: 'Informal board game and card game night in the Berkner common area. No structured activities — just time for residents to meet each other.',
      target_audience: 'Berkner Hall residents',
      proposed_date: '2026-07-05',
      budget: 40,
      expected_outcomes: 'New residents meet neighbors; low-pressure social event; 15+ attendees.',
      outcome_code: 'CB-01',
      submitter_id: ss1Id,
      status: 'rejected',
      reviewed_by_id: rdId,
      review_notes: 'Hillhouse already has a community game night scheduled this month — combine efforts with Diego to avoid duplication.',
      created_at: '2026-06-05T16:30:00',
    },
    {
      title: 'Mindfulness & Meditation Morning',
      description: 'Guided 30-minute morning meditation session in the courtyard. Partner with the Campus Recreation wellness team to lead.',
      target_audience: 'All residents — optional drop-in',
      proposed_date: null,
      budget: 0,
      expected_outcomes: 'Residents experience a structured mindfulness practice; open to all skill levels.',
      outcome_code: 'WL-01',
      submitter_id: ss3Id,
      status: 'draft',
      reviewed_by_id: null,
      review_notes: null,
      created_at: '2026-06-11T08:45:00',
    },
  ];

  for (const p of PROPOSALS) {
    insertProposal.run(
      p.title, p.description, p.target_audience,
      p.proposed_date || null,
      p.budget ?? null,
      p.expected_outcomes,
      outcomeId(p.outcome_code) || null,
      p.submitter_id,
      p.status,
      p.reviewed_by_id || null,
      p.review_notes || null,
      p.created_at,
    );
  }
  console.log(`[seed] ${PROPOSALS.length} program proposals seeded.`);
}

console.log('[seed] Done. Sign in at http://localhost:3000/login');
process.exit(0);
