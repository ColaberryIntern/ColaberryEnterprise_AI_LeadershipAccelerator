// Creates three behavioral_trigger campaigns in DRAFT status, wired to
// existing follow_up_sequences. Idempotent: skips campaigns that already
// exist by name. Read state safe to run multiple times. Activation is a
// separate step (status flip from draft to active) requiring human approval.

const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

const ALI_PERSONAL_SEQUENCE_ID = '93344025-bc37-48f9-b7a2-5908f1fb836a';
const ADVISOR_ENTRY_SEQUENCE_ID = '6cc422c0-b81a-4ed9-a8f9-37d0bef7e507';
const WARM_NURTURE_SEQUENCE_ID = '62833da9-d999-4aac-9b4f-aa28f1e8ba48';

const CAMPAIGNS = [
  {
    name: 'Behavioral Trigger: Hot Lead Personal Reach',
    description: 'Auto-enrolls visitors with intent_score >= 75 (and no booking yet) into the Ali Personal Outreach 3-step sequence. Catches identified high-intent leads who are engaging with the site but have not booked. Cooldown 168h (7 days).',
    sequence_id: ALI_PERSONAL_SEQUENCE_ID,
    targeting_criteria: {
      min_intent_score: 75,
      exclude_identified: false,
      require_all_rules: false,
      cooldown_hours: 168,
      auto_start_chat: false,
    },
    settings: {
      sender_email: 'ali@colaberry.com',
      sender_name: 'Ali Muwwakkil',
      agent_name: 'Ali Muwwakkil',
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 5,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
      ali_signature: true,
    },
    goals: 'Convert hot leads (intent_score >= 75) who have not booked into booked strategy calls via personal outreach from Ali. Acts on the 25 hot leads currently sitting unactioned in the system.',
  },
  {
    name: 'Behavioral Trigger: Advisory Page Deep Engagement',
    description: 'Auto-enrolls visitors who hit the AI Workforce Designer / advisory pages AND show engagement depth (long_session OR multi_page_session). Sends the AI Workforce Designer Entry 3-step sequence (welcome, recommended path, strategy call). Cooldown 72h.',
    sequence_id: ADVISOR_ENTRY_SEQUENCE_ID,
    targeting_criteria: {
      trigger_rules: [
        { signal_type: 'advisory_page_visit', min_count: 1 },
        { signal_type: 'long_session', min_count: 1 },
      ],
      require_all_rules: true,
      min_intent_score: 40,
      exclude_identified: false,
      cooldown_hours: 72,
      auto_start_chat: false,
    },
    settings: {
      test_mode_enabled: false,
      max_leads_per_cycle: 10,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
    },
    goals: 'Convert advisory-page visitors who showed engagement depth (long session or multi-page navigation) into booked strategy calls. Currently catches the 15-19 unique visitors per week who hit advisory pages and spend real time but get no follow-up.',
  },
  {
    name: 'Behavioral Trigger: Returning Engaged Visitor',
    description: 'Auto-enrolls visitors who returned to the site at least twice in the last 7 days, indicating sustained interest. Sends the Inbound Warm Lead Nurture 6-step multi-channel sequence. Cooldown 96h to avoid over-touching.',
    sequence_id: WARM_NURTURE_SEQUENCE_ID,
    targeting_criteria: {
      trigger_rules: [
        { signal_type: 'return_visit', min_count: 2 },
      ],
      require_all_rules: true,
      min_intent_score: 35,
      exclude_identified: false,
      cooldown_hours: 96,
      auto_start_chat: false,
    },
    settings: {
      test_mode_enabled: false,
      max_leads_per_cycle: 10,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
    },
    goals: 'Convert returning visitors (2+ return visits) into engaged leads via the warm-nurture sequence. Currently catches the 22 unique visitors per week showing return-visit behavior with no follow-up automation.',
  },
];

(async () => {
  await sequelize.authenticate();
  console.log('[Seed] Connected to Postgres\n');

  // Verify the referenced sequences exist
  for (const c of CAMPAIGNS) {
    const seq = await sequelize.query(
      `SELECT id, name FROM follow_up_sequences WHERE id = :id LIMIT 1`,
      { replacements: { id: c.sequence_id }, type: QueryTypes.SELECT }
    );
    if (seq.length === 0) {
      throw new Error(`Sequence ${c.sequence_id} for campaign "${c.name}" does not exist`);
    }
    console.log(`[Seed] sequence verified: "${seq[0].name}" -> "${c.name}"`);
  }
  console.log('');

  // Find an admin user to attribute creation to
  const admins = await sequelize.query(
    `SELECT id FROM admin_users LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  const adminId = admins[0]?.id || null;

  for (const c of CAMPAIGNS) {
    const existing = await sequelize.query(
      `SELECT id, status FROM campaigns WHERE name = :name LIMIT 1`,
      { replacements: { name: c.name }, type: QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      console.log(`[Seed] SKIP existing: ${c.name} (id=${existing[0].id}, status=${existing[0].status})`);
      continue;
    }

    const inserted = await sequelize.query(
      `INSERT INTO campaigns
        (id, name, description, type, status, sequence_id, targeting_criteria, channel_config, settings, goals, created_by, created_at, updated_at)
       VALUES
        (gen_random_uuid(), :name, :description, 'behavioral_trigger', 'draft', :sequence_id, :targeting_criteria::jsonb, :channel_config::jsonb, :settings::jsonb, :goals, :created_by, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          name: c.name,
          description: c.description,
          sequence_id: c.sequence_id,
          targeting_criteria: JSON.stringify(c.targeting_criteria),
          channel_config: JSON.stringify({
            email: { enabled: true, daily_limit: c.settings.max_leads_per_cycle || 10 },
            voice: { enabled: false },
            sms: { enabled: false },
          }),
          settings: JSON.stringify(c.settings),
          goals: c.goals,
          created_by: adminId,
        },
        type: QueryTypes.INSERT,
      }
    );

    const newId = inserted[0]?.[0]?.id || '(unknown)';
    console.log(`[Seed] CREATED draft campaign: ${c.name} -> id=${newId}`);
  }

  console.log('\n[Seed] Done. All campaigns created in DRAFT status.');
  console.log('[Seed] To activate, update status from "draft" to "active" via admin UI or SQL.');
  await sequelize.close();
})().catch(e => { console.error('[Seed] FAILED:', e.message); process.exit(1); });
