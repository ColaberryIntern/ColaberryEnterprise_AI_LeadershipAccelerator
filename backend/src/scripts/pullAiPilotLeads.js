// pullAiPilotLeads.js — pull a verified ICP list for the AI ROI Pilot initiative
// from Apollo. The ICP is "a CEO like Ryan and Percy": owner-led, small (~5-50
// employees), operations-heavy US companies. See docs/AI_ROI_PILOT_GTM_STRATEGY.md.
//
// Self-contained: only needs APOLLO_API_KEY in env (set in the prod backend
// container). Mirrors the search/enrich/backoff logic in
// backend/src/services/apolloService.ts but writes a reviewable file instead of
// importing to the DB, so Ali can approve batch 1 before any outreach.
//
// Modes (idempotent; safe to re-run):
//   node pullAiPilotLeads.js                 DRY-RUN: search only (cheap, no enrich
//                                            credits). Prints candidates + counts,
//                                            writes the candidate list WITHOUT emails.
//   node pullAiPilotLeads.js --enrich        Also enrich up to LIMIT candidates to
//                                            reveal verified emails. Writes the
//                                            review-ready JSON + CSV. Costs credits.
//
// Env knobs: LIMIT (default 50 enriched), PAGES (default 3 search pages of 25),
//   OUT_DIR (default ./tmp).

const fs = require('fs');
const path = require('path');

const APOLLO_BASE_URL = 'https://api.apollo.io';
const API_KEY = process.env.APOLLO_API_KEY || '';
const ENRICH = process.argv.includes('--enrich');
const LIMIT = parseInt(process.env.LIMIT || '50', 10);
const PAGES = parseInt(process.env.PAGES || '3', 10);
const OUT_DIR = process.env.OUT_DIR || path.resolve(process.cwd(), 'tmp');

// ── ICP search parameters (tunable). These map 1:1 to the Apollo people search. ──
const ICP = {
  person_titles: ['CEO', 'Founder', 'Co-Founder', 'Owner', 'President', 'COO', 'Managing Partner', 'Managing Director'],
  person_seniorities: ['owner', 'founder', 'c_suite'],
  // Operations-heavy verticals where manual workflows are expensive. Tune freely.
  q_organization_industries: [
    'transportation', 'logistics & supply chain', 'trucking', 'construction',
    'facilities services', 'staffing & recruiting', 'professional training & coaching',
    'real estate', 'hospital & health care', 'consumer services',
  ],
  organization_num_employees_ranges: ['1,10', '11,20', '21,50'],
  person_locations: ['United States'],
  contact_email_status: ['verified'],
};

const delays = [500, 1500, 4000];
async function fetchWithRetry(url, options, { retries = 3, label = 'Apollo' } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const d = delays[Math.min(attempt, delays.length - 1)];
        console.warn(`[${label}] HTTP ${res.status} attempt ${attempt + 1}. retry in ${d}ms`);
        await new Promise((r) => setTimeout(r, d));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        const d = delays[Math.min(attempt, delays.length - 1)];
        console.warn(`[${label}] network error attempt ${attempt + 1}: ${err.message}. retry in ${d}ms`);
        await new Promise((r) => setTimeout(r, d));
      } else {
        throw new Error(`[${label}] failed after ${retries + 1} attempts: ${err.message}`);
      }
    }
  }
  throw new Error(`[${label}] unreachable`);
}

async function searchPage(page) {
  const body = {
    per_page: 25,
    page,
    person_titles: ICP.person_titles,
    person_seniorities: ICP.person_seniorities,
    q_organization_industries: ICP.q_organization_industries,
    organization_num_employees_ranges: ICP.organization_num_employees_ranges,
    person_locations: ICP.person_locations,
    contact_email_status: ICP.contact_email_status,
  };
  const res = await fetchWithRetry(`${APOLLO_BASE_URL}/v1/mixed_people/api_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
    body: JSON.stringify(body),
  }, { label: 'Apollo Search' });
  if (!res.ok) throw new Error(`Apollo search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { people: data.people || [], total: data.pagination?.total_entries || data.total_entries || 0 };
}

async function enrichById(id) {
  const res = await fetchWithRetry(`${APOLLO_BASE_URL}/v1/people/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
    body: JSON.stringify({ id }),
  }, { label: 'Apollo Enrich' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.person || null;
}

function toRow(p) {
  const org = p.organization || {};
  return {
    apollo_id: p.id,
    first_name: p.first_name || '',
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title || '',
    email: p.email || '',
    company: org.name || '',
    industry: org.industry || '',
    employees: org.estimated_num_employees || '',
    linkedin_url: p.linkedin_url || '',
  };
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

(async () => {
  if (!API_KEY) {
    console.error('FAILED: APOLLO_API_KEY not set. Run inside the prod backend container.');
    process.exit(1);
  }
  console.log(`MODE: ${ENRICH ? 'ENRICH (reveals emails, costs credits)' : 'DRY-RUN (search only)'}`);
  console.log(`ICP titles: ${ICP.person_titles.join(', ')}`);
  console.log(`ICP size ranges: ${ICP.organization_num_employees_ranges.join(' | ')}\n`);

  // 1. Search (deduped by apollo_id across pages).
  const byId = new Map();
  let total = 0;
  for (let page = 1; page <= PAGES; page++) {
    const { people, total: t } = await searchPage(page);
    total = t;
    for (const p of people) if (p.id && !byId.has(p.id)) byId.set(p.id, toRow(p));
    console.log(`[search] page ${page}: +${people.length} (unique so far ${byId.size}, est total ${total})`);
    if (people.length < 25) break;
  }
  let rows = Array.from(byId.values());

  // 2. Optionally enrich up to LIMIT to reveal verified emails.
  if (ENRICH) {
    const slice = rows.slice(0, LIMIT);
    console.log(`\n[enrich] enriching ${slice.length} candidates (LIMIT=${LIMIT})...`);
    for (let i = 0; i < slice.length; i++) {
      const enriched = await enrichById(slice[i].apollo_id);
      if (enriched) Object.assign(slice[i], toRow(enriched));
      await new Promise((r) => setTimeout(r, 250)); // gentle pacing
    }
    rows = slice.filter((r) => r.email && /@/.test(r.email));
    console.log(`[enrich] ${rows.length} candidates now have a verified email.`);
  }

  // 3. Write outputs.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = (process.env.RUN_DATE || new Date().toISOString().slice(0, 10));
  const jsonPath = path.join(OUT_DIR, `ai-pilot-leads-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  console.log(`\n[out] wrote ${rows.length} rows -> ${jsonPath}`);

  if (ENRICH) {
    const headers = ['name', 'title', 'company', 'industry', 'employees', 'email', 'linkedin_url'];
    const csv = [headers.join(',')]
      .concat(rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')))
      .join('\n');
    const csvPath = path.join(OUT_DIR, `ai-pilot-leads-${stamp}.csv`);
    fs.writeFileSync(csvPath, csv);
    console.log(`[out] wrote review CSV -> ${csvPath}`);
  }

  // 4. Preview.
  console.log('\nSAMPLE:');
  for (const r of rows.slice(0, 8)) {
    console.log(`  ${r.name} | ${r.title} | ${r.company} | ${r.employees} emp${r.email ? ' | ' + r.email : ''}`);
  }
  console.log(`\nDONE. ${ENRICH ? 'Review the CSV, then run sendAiPilotOutreach.js.' : 'Re-run with --enrich to reveal emails for the reviewed batch.'}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
