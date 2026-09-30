#!/usr/bin/env node
/**
 * exportApolloLeadReserve.js
 *
 * Read-only exporter for the "Apollo Lead Reserve" — the bucket of leads we have
 * ALREADY paid Apollo credits for. Reuse this reserve before pulling any new
 * leads from Apollo. (Apollo pulls are disabled by default and require Ali's
 * explicit permission — see directives/apollo-lead-reserve.md and the
 * APOLLO_ENABLED kill switch in backend/src/services/apolloService.ts.)
 *
 * Categorizes every source='apollo' lead into a reuse tier + seniority band and
 * writes a Sheets-importable CSV. Pure SELECTs — no writes, safe to re-run.
 *
 * Usage:
 *   node exportApolloLeadReserve.js [--out <path.csv>]
 *   (reads DATABASE_URL from the environment — run inside accelerator-backend)
 *
 * Tiers:
 *   A_fresh_never_contacted  pipeline_stage='new_lead'   -> highest reuse value
 *   B_worked_cold            already contacted, no convert -> reusable with care
 *   SUPPRESS_do_not_contact  status='unsubscribed'        -> never contact again
 */

const fs = require('fs');
const { Client } = require('pg');

const QUERY = `
  WITH camp AS (
    SELECT cl.lead_id, COUNT(DISTINCT cl.campaign_id) AS campaigns_used
    FROM campaign_leads cl GROUP BY cl.lead_id
  )
  SELECT
    CASE WHEN l.status='unsubscribed' THEN 'SUPPRESS_do_not_contact'
         WHEN l.pipeline_stage='new_lead' THEN 'A_fresh_never_contacted'
         ELSE 'B_worked_cold' END AS reserve_tier,
    CASE WHEN l.title ~* '(chief| ceo|cto|cio|cfo|coo|cmo|cdo|founder|owner|president|svp|evp| vp |vice president)' THEN 'exec'
         WHEN l.title ~* '(director|head of|principal|vp)' THEN 'director'
         ELSE 'other' END AS seniority,
    l.lead_score, l.name, l.email, l.phone, l.title, l.company, l.industry,
    l.employee_count, l.annual_revenue, l.linkedin_url, l.apollo_id,
    CASE WHEN l.ghl_contact_id IS NOT NULL AND l.ghl_contact_id<>'' THEN 'yes' ELSE 'no' END AS in_ghl_crm,
    COALESCE(c.campaigns_used, 0) AS campaigns_used,
    l.created_at::date AS added
  FROM leads l
  LEFT JOIN camp c ON c.lead_id = l.id
  WHERE l.source='apollo'
  ORDER BY reserve_tier, seniority, l.lead_score DESC NULLS LAST
`;

const COLUMNS = [
  'reserve_tier', 'seniority', 'lead_score', 'name', 'email', 'phone', 'title',
  'company', 'industry', 'employee_count', 'annual_revenue', 'linkedin_url',
  'apollo_id', 'in_ghl_crm', 'campaigns_used', 'added',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function outPathFromArgs() {
  const i = process.argv.indexOf('--out');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const d = new Date().toISOString().slice(0, 10);
  return `apollo-lead-reserve-${d}.csv`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[reserve] DATABASE_URL not set — run inside the accelerator-backend container.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(QUERY);
    const outPath = outPathFromArgs();

    const lines = [COLUMNS.join(',')];
    const tierCounts = {};
    for (const r of rows) {
      lines.push(COLUMNS.map((c) => csvCell(r[c])).join(','));
      tierCounts[r.reserve_tier] = (tierCounts[r.reserve_tier] || 0) + 1;
    }
    fs.writeFileSync(outPath, lines.join('\n') + '\n');

    console.log(`[reserve] wrote ${rows.length} leads -> ${outPath}`);
    for (const tier of Object.keys(tierCounts).sort()) {
      console.log(`[reserve]   ${tier}: ${tierCounts[tier]}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[reserve] failed:', err.message);
  process.exit(1);
});
