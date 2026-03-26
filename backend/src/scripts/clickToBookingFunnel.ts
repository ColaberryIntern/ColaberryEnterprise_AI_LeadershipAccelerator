/**
 * Click-to-Booking Conversion Funnel Analysis
 * Run inside Docker: node dist/scripts/clickToBookingFunnel.js
 */
import '../models'; // init sequelize + associations
import { sequelize } from '../config/database';

const SEP = '\n' + '═'.repeat(70) + '\n';

async function run() {
  console.log(SEP + '  CLICK-TO-BOOKING CONVERSION FUNNEL ANALYSIS' + SEP);
  console.log(`  Generated: ${new Date().toISOString()}\n`);

  // ─── 1. Unique clickers in last 7 days ──────────────────────────────
  console.log('─── 1. UNIQUE CLICKERS (last 7 days) ───────────────────────────────');
  const [clickersRaw] = await sequelize.query(`
    SELECT
      COUNT(DISTINCT io.lead_id) as clickers
    FROM interaction_outcomes io
    WHERE io.outcome = 'clicked'
    AND io.created_at > NOW() - interval '7 days'
  `);
  const clickers = (clickersRaw as any[])[0]?.clickers || 0;

  const [bookersRaw] = await sequelize.query(`
    SELECT
      COUNT(DISTINCT sc.lead_id) as bookers
    FROM strategy_calls sc
    WHERE sc.created_at > NOW() - interval '7 days'
  `);
  const bookers = (bookersRaw as any[])[0]?.bookers || 0;

  console.log(`  Unique leads who clicked:  ${clickers}`);
  console.log(`  Unique leads who booked:   ${bookers}`);
  console.log(`  Click-to-book rate:        ${clickers > 0 ? ((Number(bookers) / Number(clickers)) * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log();

  // ─── 2. URL patterns clicked ────────────────────────────────────────
  console.log('─── 2. CLICKED URLS (last 7 days) ──────────────────────────────────');
  const [urls] = await sequelize.query(`
    SELECT
      metadata->>'url' as url,
      COUNT(*) as cnt
    FROM interaction_outcomes
    WHERE outcome = 'clicked'
    AND created_at > NOW() - interval '7 days'
    AND metadata->>'url' IS NOT NULL
    GROUP BY url
    ORDER BY cnt DESC
    LIMIT 20
  `);
  if ((urls as any[]).length === 0) {
    console.log('  No click URLs recorded in the last 7 days.');
  } else {
    for (const row of urls as any[]) {
      console.log(`  [${String(row.cnt).padStart(4)}]  ${row.url}`);
    }
  }
  console.log();

  // ─── 3. Booking link clickers vs actual bookings ────────────────────
  console.log('─── 3. BOOKING LINK CLICKS vs ACTUAL BOOKINGS (last 7 days) ───────');
  const [bookingFunnel] = await sequelize.query(`
    SELECT
      COUNT(DISTINCT io.lead_id) as clicked_booking,
      COUNT(DISTINCT sc.lead_id) as actually_booked
    FROM interaction_outcomes io
    LEFT JOIN strategy_calls sc ON sc.lead_id = io.lead_id
    WHERE io.outcome = 'clicked'
    AND (io.metadata->>'url' LIKE '%ai-architect%' OR io.metadata->>'url' LIKE '%book%')
    AND io.created_at > NOW() - interval '7 days'
  `);
  const bf = (bookingFunnel as any[])[0] || {};
  console.log(`  Clicked booking/ai-architect link:  ${bf.clicked_booking || 0}`);
  console.log(`  Actually booked:                    ${bf.actually_booked || 0}`);
  console.log(`  Booking conversion rate:            ${Number(bf.clicked_booking) > 0 ? ((Number(bf.actually_booked) / Number(bf.clicked_booking)) * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log();

  // ─── 4. Recent strategy_calls ───────────────────────────────────────
  console.log('─── 4. RECENT STRATEGY CALLS (last 10) ─────────────────────────────');
  const [calls] = await sequelize.query(`
    SELECT
      id, lead_id, status,
      scheduled_at,
      created_at,
      SUBSTRING(notes, 1, 80) as notes_preview
    FROM strategy_calls
    ORDER BY created_at DESC
    LIMIT 10
  `);
  if ((calls as any[]).length === 0) {
    console.log('  No strategy calls found.');
  } else {
    for (const row of calls as any[]) {
      console.log(`  ID=${row.id} | lead=${row.lead_id} | status=${row.status} | scheduled=${row.scheduled_at || 'N/A'} | created=${row.created_at}`);
      if (row.notes_preview) console.log(`    notes: ${row.notes_preview}`);
    }
  }
  console.log();

  // ─── 5. Extended: All interaction outcomes breakdown ─────────────────
  console.log('─── 5. INTERACTION OUTCOMES BREAKDOWN (last 7 days) ─────────────────');
  const [outcomes] = await sequelize.query(`
    SELECT
      outcome,
      COUNT(*) as cnt,
      COUNT(DISTINCT lead_id) as unique_leads
    FROM interaction_outcomes
    WHERE created_at > NOW() - interval '7 days'
    GROUP BY outcome
    ORDER BY cnt DESC
  `);
  for (const row of outcomes as any[]) {
    console.log(`  ${String(row.outcome).padEnd(20)} ${String(row.cnt).padStart(6)} events  ${String(row.unique_leads).padStart(6)} unique leads`);
  }
  console.log();

  // ─── 6. Click timeline (by day) ────────────────────────────────────
  console.log('─── 6. CLICK TIMELINE (last 7 days, by day) ────────────────────────');
  const [timeline] = await sequelize.query(`
    SELECT
      DATE(created_at) as day,
      COUNT(*) as total_clicks,
      COUNT(DISTINCT lead_id) as unique_clickers
    FROM interaction_outcomes
    WHERE outcome = 'clicked'
    AND created_at > NOW() - interval '7 days'
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `);
  if ((timeline as any[]).length === 0) {
    console.log('  No clicks in the last 7 days.');
  } else {
    for (const row of timeline as any[]) {
      console.log(`  ${row.day}  |  ${String(row.total_clicks).padStart(4)} clicks  |  ${String(row.unique_clickers).padStart(4)} unique leads`);
    }
  }
  console.log();

  // ─── 7. Leads who clicked but did NOT book ──────────────────────────
  console.log('─── 7. CLICKERS WHO DID NOT BOOK (last 7 days, top 10) ─────────────');
  const [nonBookers] = await sequelize.query(`
    SELECT
      l.id, l.email, l.first_name, l.last_name, l.company,
      COUNT(io.id) as click_count,
      MAX(io.created_at) as last_click
    FROM interaction_outcomes io
    JOIN leads l ON l.id = io.lead_id
    WHERE io.outcome = 'clicked'
    AND io.created_at > NOW() - interval '7 days'
    AND io.lead_id NOT IN (SELECT lead_id FROM strategy_calls WHERE lead_id IS NOT NULL)
    GROUP BY l.id, l.email, l.first_name, l.last_name, l.company
    ORDER BY click_count DESC
    LIMIT 10
  `);
  if ((nonBookers as any[]).length === 0) {
    console.log('  All clickers have booked, or no clicks recorded.');
  } else {
    for (const row of nonBookers as any[]) {
      console.log(`  ${row.first_name} ${row.last_name} (${row.email}) @ ${row.company || 'N/A'} — ${row.click_count} clicks, last: ${row.last_click}`);
    }
  }
  console.log();

  console.log(SEP + '  END OF FUNNEL ANALYSIS' + SEP);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
