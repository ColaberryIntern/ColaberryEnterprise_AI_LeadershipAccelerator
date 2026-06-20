// pullAiPilotLeads.js — pull a verified ICP list for the AI ROI Pilot from Apollo.
// ICP = "a CEO like Ryan and Percy": owner-led, small (~3-50 employees),
// OPERATIONS-HEAVY US companies. See docs/AI_ROI_PILOT_GTM_STRATEGY.md.
//
// Apollo's industry keyword filter is soft, so we also POST-FILTER by industry
// (blocklist of finance/consulting/IT/etc.) and by team size, to keep the list
// close to the LandJet profile. Self-contained: needs only APOLLO_API_KEY (prod).
//
// Modes (idempotent):
//   node pullAiPilotLeads.js            DRY-RUN: search + filter only (cheap). Prints
//                                       candidates + counts; writes list WITHOUT emails.
//   node pullAiPilotLeads.js --enrich   Enrich filtered candidates to reveal verified
//                                       emails, up to TARGET kept. Writes review JSON+CSV.
//
// Env: TARGET (default 100 kept), PAGES (default 8 search pages of 25),
//   ENRICH_MAX (default 180 enrich calls cap), MIN_EMP (3), MAX_EMP (50), OUT_DIR (./tmp).

const fs = require('fs');
const path = require('path');

const APOLLO_BASE_URL = 'https://api.apollo.io';
const API_KEY = process.env.APOLLO_API_KEY || '';
const ENRICH = process.argv.includes('--enrich');
const TARGET = parseInt(process.env.TARGET || '100', 10);
const PAGES = parseInt(process.env.PAGES || '8', 10);
const ENRICH_MAX = parseInt(process.env.ENRICH_MAX || '180', 10);
const MIN_EMP = parseInt(process.env.MIN_EMP || '3', 10);
const MAX_EMP = parseInt(process.env.MAX_EMP || '50', 10);
const OUT_DIR = process.env.OUT_DIR || path.resolve(process.cwd(), 'tmp');

// ── ICP search parameters (the soft Apollo filter) ──
const ICP = {
  person_titles: ['CEO', 'Founder', 'Co-Founder', 'Owner', 'President', 'COO', 'Managing Partner', 'Managing Director'],
  person_seniorities: ['owner', 'founder', 'c_suite'],
  q_organization_industries: [
    'transportation', 'logistics & supply chain', 'trucking', 'construction', 'building materials',
    'facilities services', 'mechanical or industrial engineering', 'food & beverages', 'food production',
    'restaurants', 'hospitality', 'real estate', 'environmental services', 'warehousing', 'wholesale',
    'consumer services', 'automotive', 'farming',
  ],
  organization_num_employees_ranges: ['1,10', '11,20', '21,50'],
  person_locations: ['United States'],
  contact_email_status: ['verified'],
};

// ── Hard post-filter: industries that are NOT the ops-heavy LandJet profile ──
const BLOCK_INDUSTRIES = [
  'venture capital', 'private equity', 'investment', 'financial services', 'banking',
  'management consulting', 'marketing & advertising', 'market research', 'information technology',
  'computer software', 'computer games', 'internet', 'accounting', 'e-learning',
  'education management', 'higher education', 'nonprofit', 'non-profit', 'law practice', 'legal',
];
function isBlocked(industry) {
  if (!industry) return false; // unknown -> decide after enrich
  const lo = industry.toLowerCase();
  return BLOCK_INDUSTRIES.some((b) => lo.includes(b));
}
function sizeOk(emp) {
  if (!emp) return true; // unknown -> keep
  return emp >= MIN_EMP && emp <= MAX_EMP;
}

const delays = [500, 1500, 4000];
async function fetchWithRetry(url, options, { retries = 3, label = 'Apollo' } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) await new Promise((r) => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
      else throw new Error(`[${label}] failed after ${retries + 1} attempts: ${err.message}`);
    }
  }
  throw new Error(`[${label}] unreachable`);
}

async function searchPage(page) {
  const body = {
    per_page: 25, page,
    person_titles: ICP.person_titles, person_seniorities: ICP.person_seniorities,
    q_organization_industries: ICP.q_organization_industries,
    organization_num_employees_ranges: ICP.organization_num_employees_ranges,
    person_locations: ICP.person_locations, contact_email_status: ICP.contact_email_status,
  };
  const res = await fetchWithRetry(`${APOLLO_BASE_URL}/v1/mixed_people/api_search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY }, body: JSON.stringify(body),
  }, { label: 'Apollo Search' });
  if (!res.ok) throw new Error(`Apollo search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { people: data.people || [], total: data.pagination?.total_entries || data.total_entries || 0 };
}

async function enrichById(id) {
  const res = await fetchWithRetry(`${APOLLO_BASE_URL}/v1/people/match`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY }, body: JSON.stringify({ id }),
  }, { label: 'Apollo Enrich' });
  if (!res.ok) return null;
  return (await res.json()).person || null;
}

function toRow(p) {
  const org = p.organization || {};
  return {
    apollo_id: p.id, first_name: p.first_name || '',
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title || '', email: p.email || '', company: org.name || '',
    industry: org.industry || '', employees: org.estimated_num_employees || '', linkedin_url: p.linkedin_url || '',
  };
}
function csvEscape(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

(async () => {
  if (!API_KEY) { console.error('FAILED: APOLLO_API_KEY not set. Run inside the prod backend container.'); process.exit(1); }
  console.log(`MODE: ${ENRICH ? 'ENRICH (reveals emails, costs credits)' : 'DRY-RUN (search + filter only)'}`);
  console.log(`ICP: SMB CEO/Founder/Owner/COO, ${MIN_EMP}-${MAX_EMP} emp, ops-heavy verticals. TARGET=${TARGET}\n`);

  // 1. Search + dedup.
  const byId = new Map();
  for (let page = 1; page <= PAGES; page++) {
    const { people, total } = await searchPage(page);
    for (const p of people) if (p.id && !byId.has(p.id)) byId.set(p.id, toRow(p));
    console.log(`[search] page ${page}: +${people.length} (unique ${byId.size}, est total ${total})`);
    if (people.length < 25) break;
  }

  // 2. Pre-filter by industry/size where known (saves enrich credits).
  let candidates = Array.from(byId.values()).filter((r) => !isBlocked(r.industry) && sizeOk(Number(r.employees) || 0));
  console.log(`[filter] ${candidates.length} of ${byId.size} pass the ops-heavy / size pre-filter`);

  let rows = candidates;
  // 3. Enrich until TARGET kept (re-applying the filter once industry/size are known).
  if (ENRICH) {
    const kept = [];
    let used = 0;
    for (const c of candidates) {
      if (kept.length >= TARGET || used >= ENRICH_MAX) break;
      used++;
      const e = await enrichById(c.apollo_id);
      const row = e ? toRow(e) : c;
      await new Promise((r) => setTimeout(r, 250));
      if (!row.email || !/@/.test(row.email)) continue;
      if (isBlocked(row.industry)) continue;
      if (!sizeOk(Number(row.employees) || 0)) continue;
      kept.push(row);
      if (kept.length % 20 === 0) console.log(`[enrich] kept ${kept.length}/${TARGET} (enriched ${used})`);
    }
    rows = kept;
    console.log(`[enrich] final kept ${rows.length} (enriched ${used}, cap ${ENRICH_MAX})`);
  }

  // 4. Write outputs.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = process.env.RUN_DATE || new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `ai-pilot-leads-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  console.log(`\n[out] wrote ${rows.length} rows -> ${jsonPath}`);
  if (ENRICH) {
    const headers = ['name', 'title', 'company', 'industry', 'employees', 'email', 'linkedin_url'];
    const csv = [headers.join(',')].concat(rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))).join('\n');
    const csvPath = path.join(OUT_DIR, `ai-pilot-leads-${stamp}.csv`);
    fs.writeFileSync(csvPath, csv);
    console.log(`[out] wrote review CSV -> ${csvPath}`);
  }
  console.log('\nSAMPLE:');
  for (const r of rows.slice(0, 8)) console.log(`  ${r.name} | ${r.title} | ${r.company} | ${r.industry} | ${r.employees} emp${r.email ? ' | ' + r.email : ''}`);
  console.log(`\nDONE. ${ENRICH ? 'Review the CSV, then run sendAiPilotOutreach.js.' : 'Re-run with --enrich to reveal emails.'}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
