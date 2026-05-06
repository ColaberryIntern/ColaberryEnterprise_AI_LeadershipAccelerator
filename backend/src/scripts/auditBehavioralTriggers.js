// Audits behavioral_trigger campaigns in production:
//   - which exist, status, configured criteria
//   - how many leads they have actually enrolled in the last 30 days
//   - how many behavioral signals are firing system-wide
// Read-only. No writes.

const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

(async () => {
  await sequelize.authenticate();
  console.log('[Audit] Connected to Postgres\n');

  console.log('========================================');
  console.log('1. BEHAVIORAL_TRIGGER CAMPAIGNS');
  console.log('========================================\n');

  const campaigns = await sequelize.query(
    `SELECT id, name, status, targeting_criteria, sequence_id, created_at, updated_at
     FROM campaigns
     WHERE type = 'behavioral_trigger'
     ORDER BY status DESC, name ASC`,
    { type: QueryTypes.SELECT }
  );

  if (campaigns.length === 0) {
    console.log('NONE. No behavioral_trigger campaigns exist in this database.\n');
  } else {
    console.log(`Total: ${campaigns.length}\n`);
    for (const c of campaigns) {
      const crit = c.targeting_criteria || {};
      console.log(`  [${c.status.toUpperCase()}] ${c.name}`);
      console.log(`    id: ${c.id}`);
      console.log(`    created: ${c.created_at?.toISOString?.() || c.created_at}`);
      console.log(`    updated: ${c.updated_at?.toISOString?.() || c.updated_at}`);
      console.log(`    sequence_id: ${c.sequence_id || '(none)'}`);
      const rules = (crit.trigger_rules || []).map(r => `${r.signal_type}>=${r.min_count}`).join(', ');
      console.log(`    rules: ${rules || '(none)'}`);
      console.log(`    min_intent_score: ${crit.min_intent_score ?? '(unset)'}`);
      console.log(`    require_all_rules: ${crit.require_all_rules ?? '(unset)'}`);
      console.log(`    cooldown_hours: ${crit.cooldown_hours ?? '(unset)'}`);
      console.log('');
    }
  }

  console.log('========================================');
  console.log('2. ENROLLMENT ACTIVITY (last 30 days)');
  console.log('========================================\n');

  const enrolls = await sequelize.query(
    `SELECT c.id, c.name, c.status,
            COUNT(cl.id) FILTER (WHERE cl.enrolled_at >= NOW() - INTERVAL '30 days') AS enrolled_30d,
            COUNT(cl.id) FILTER (WHERE cl.enrolled_at >= NOW() - INTERVAL '7 days') AS enrolled_7d,
            COUNT(cl.id) AS enrolled_total,
            MAX(cl.enrolled_at) AS last_enrolled_at
     FROM campaigns c
     LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
     WHERE c.type = 'behavioral_trigger'
     GROUP BY c.id, c.name, c.status
     ORDER BY enrolled_30d DESC, enrolled_total DESC`,
    { type: QueryTypes.SELECT }
  );

  if (enrolls.length === 0) {
    console.log('No behavioral_trigger campaigns to audit.\n');
  } else {
    for (const e of enrolls) {
      console.log(`  [${e.status.toUpperCase()}] ${e.name}`);
      console.log(`    enrolled in last 7d:  ${e.enrolled_7d}`);
      console.log(`    enrolled in last 30d: ${e.enrolled_30d}`);
      console.log(`    enrolled all-time:    ${e.enrolled_total}`);
      console.log(`    last enrollment:      ${e.last_enrolled_at?.toISOString?.() || e.last_enrolled_at || '(never)'}`);
      console.log('');
    }
  }

  console.log('========================================');
  console.log('3. BEHAVIORAL SIGNALS FIRING (last 7 days)');
  console.log('========================================\n');

  const signals = await sequelize.query(
    `SELECT signal_type, COUNT(*) AS cnt, COUNT(DISTINCT visitor_id) AS unique_visitors
     FROM behavioral_signals
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY signal_type
     ORDER BY cnt DESC
     LIMIT 30`,
    { type: QueryTypes.SELECT }
  );

  if (signals.length === 0) {
    console.log('No behavioral signals fired in the last 7 days.\n');
  } else {
    console.log(`Total signal types firing: ${signals.length}\n`);
    for (const s of signals) {
      console.log(`  ${s.signal_type.padEnd(35)}  count=${s.cnt}  unique_visitors=${s.unique_visitors}`);
    }
    console.log('');
  }

  console.log('========================================');
  console.log('4. INTENT SCORE DISTRIBUTION (current visitor population, last 30d active)');
  console.log('========================================\n');

  const intent = await sequelize.query(
    `SELECT
        COUNT(*) FILTER (WHERE score >= 75) AS hot,
        COUNT(*) FILTER (WHERE score >= 50 AND score < 75) AS warm,
        COUNT(*) FILTER (WHERE score >= 25 AND score < 50) AS cool,
        COUNT(*) FILTER (WHERE score < 25) AS cold,
        COUNT(*) AS total,
        AVG(score)::numeric(5,1) AS avg_score
     FROM intent_scores
     WHERE updated_at >= NOW() - INTERVAL '30 days'`,
    { type: QueryTypes.SELECT }
  );

  const i = intent[0] || {};
  console.log(`  total scored visitors (active 30d): ${i.total || 0}`);
  console.log(`  hot   (>=75):  ${i.hot || 0}`);
  console.log(`  warm  (50-74): ${i.warm || 0}`);
  console.log(`  cool  (25-49): ${i.cool || 0}`);
  console.log(`  cold  (<25):   ${i.cold || 0}`);
  console.log(`  avg score:     ${i.avg_score || 0}`);
  console.log('');

  console.log('========================================');
  console.log('5. HOT/WARM VISITORS WITH NO BOOKING (the gap Ram named)');
  console.log('========================================\n');

  const unconverted = await sequelize.query(
    `SELECT v.id, v.lead_id, l.email, l.first_name, l.last_name, l.company,
            v.total_pageviews, v.total_sessions, isc.score AS intent_score
     FROM visitors v
     JOIN intent_scores isc ON isc.visitor_id = v.id
     LEFT JOIN leads l ON l.id = v.lead_id
     LEFT JOIN bookings b ON b.lead_id = v.lead_id
     WHERE isc.score >= 50
       AND v.last_seen_at >= NOW() - INTERVAL '30 days'
       AND b.id IS NULL
     ORDER BY isc.score DESC
     LIMIT 25`,
    { type: QueryTypes.SELECT }
  ).catch(e => {
    console.log(`  (query failed - ${e.message?.slice(0, 200)})`);
    return [];
  });

  if (unconverted.length === 0) {
    console.log('  No hot/warm visitors without bookings (or query failed above).\n');
  } else {
    console.log(`  ${unconverted.length} visitors with intent_score >= 50 and no booking:\n`);
    for (const v of unconverted) {
      const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || '(anonymous)';
      const company = v.company || '';
      console.log(`    score=${v.intent_score}  ${name}${company ? ' ('+company+')' : ''}  ${v.email || '(no email)'}  pv=${v.total_pageviews} ses=${v.total_sessions}`);
    }
    console.log('');
  }

  await sequelize.close();
  console.log('[Audit] Done. Read-only, no writes performed.');
})().catch(e => { console.error('Audit failed:', e.message); process.exit(1); });
