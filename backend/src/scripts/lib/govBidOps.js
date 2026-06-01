// Gov bid operations: scrap (trash a todolist) + add (create new bid with
// standard task template).
//
// Used by:
//   - One-off CLI runs (this session: scrap 5 + add 5)
//   - @CB tools: scrap_gov_bid + add_gov_bid (next session)
//   - Future v1.1 auto-runner

const PROJECT_ID = 47346103; // Gov Contracts
const BASE = `https://3.basecampapi.com/3945211`;

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da').replace(/^bearer\s+/i, '');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry GovBidOps', Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { headers: bcHeaders() }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : `${BASE}${p}`;
  const out = [];
  while (n) {
    const r = await fetch(n, { headers: bcHeaders() });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}
async function bcPost(p, body) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'POST', headers: bcHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPut(p, body) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'PUT', headers: bcHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// =============================================================================
// SCRAP a gov bid (trash the todolist)
// =============================================================================
async function scrapBid(matchName) {
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);
  const matchLower = matchName.toLowerCase();
  const matches = lists.filter((l) => (l.name || '').toLowerCase().includes(matchLower));
  if (matches.length === 0) throw new Error(`No bid matched "${matchName}". Available: ${lists.slice(0, 10).map((l) => l.name).join(' | ')}`);
  if (matches.length > 1) throw new Error(`Multiple bids matched "${matchName}": ${matches.map((l) => l.name).join(' | ')}. Be more specific.`);
  const list = matches[0];
  // Trash the recording (Basecamp keeps it recoverable for 30 days)
  await bcPut(`/buckets/${PROJECT_ID}/recordings/${list.id}/status/trashed.json`, {});
  return { trashed: list.id, name: list.name, app_url: list.app_url };
}

// =============================================================================
// ADD a new gov bid with the standard 14-task template
// =============================================================================
const STANDARD_TEMPLATE = [
  { content: 'Read RFP in full + extract requirements matrix', note: 'Read every document in the RFP package. Build a requirements matrix tagged by source doc, owner, and acceptance evidence.', tier: 'AI' },
  { content: 'Bid / no-bid decision (qualification gate)', note: 'Confirm: (a) US-only delivery if required, (b) tech-stack fit, (c) ability to meet security controls, (d) competitive landscape. Document GO/NO-GO.', tier: 'HUMAN' },
  { content: 'Attend pre-proposal conference', note: 'Date/time from RFP. Take notes on what the buyer emphasizes - that informs proposal positioning.', tier: 'HUMAN' },
  { content: 'Submit written questions via Bonfire', note: 'Questions go ONLY through Bonfire Q&A tab. Likely topics: integration scope, data migration, SLA, security controls, evaluation criteria.', tier: 'HUMAN' },
  { content: 'Respond to Functional Requirements (per-row marking)', note: 'For each requirement: Out of the Box / Configuration Required / Customization Required / Cannot Be Met.', tier: 'AI' },
  { content: 'Respond to Technical Requirements + reference architecture questionnaire', note: 'Technical capability responses + any supplied xlsx questionnaire.', tier: 'AI' },
  { content: 'Complete IT Vendor Controls + Cybersecurity Acknowledgement Form', note: 'Sign-required compliance form.', tier: 'HUMAN' },
  { content: 'Complete compliance forms (MWBE + HUB + Insurance + Vendor Disclosure + Tax + Wage)', note: 'Bundle of buyer-specific forms. Typically requires signatures.', tier: 'HUMAN' },
  { content: 'Draft executive summary', note: 'One-page why-us narrative. Lead with the differentiator + 3 bullet proof points.', tier: 'AI' },
  { content: 'Draft capability statement', note: 'Past performance + team bios + relevant case studies. Standard Colaberry capability deck.', tier: 'AI' },
  { content: 'Draft proposal narrative (main response)', note: 'Detailed proposal per RFP outline. Pull from requirements matrix + functional + technical responses.', tier: 'AI' },
  { content: 'Pricing schedule', note: 'Per pricing template in RFP. Reference comparable comps. Negotiate margin internally.', tier: 'HUMAN' },
  { content: 'Internal review + sign-off (Phase 4)', note: 'Ali + delivery lead + finance review. Final sign-off before submission.', tier: 'HUMAN' },
  { content: 'Submit via Bonfire portal', note: 'Final action. Bonfire upload of all required documents. Confirm receipt.', tier: 'HUMAN' },
];

async function addBid({ displayTitle, deadline, opportunityUuid, fitThesis, agencyName }) {
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');

  // Create the todolist
  const description = [
    `<div><strong>${displayTitle}</strong></div>`,
    deadline ? `<div>Submission deadline: ${deadline}</div>` : '',
    opportunityUuid ? `<div>Opportunity UUID: ${opportunityUuid}</div>` : '',
    agencyName ? `<div>Agency: ${agencyName}</div>` : '',
    fitThesis ? `<div><br></div><div><strong>Fit thesis:</strong> ${fitThesis}</div>` : '',
    `<div><br></div>`,
    `<div>Standard 14-task template applied. Edit individual tasks in Basecamp as the RFP requirements solidify.</div>`,
  ].filter(Boolean).join('');

  const newList = await bcPost(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`, {
    name: displayTitle,
    description,
  });

  // Distribute task due dates evenly working backward from (deadline - 1 day)
  let datesPerTask = null;
  if (deadline) {
    const submissionTarget = new Date(deadline);
    submissionTarget.setUTCDate(submissionTarget.getUTCDate() - 1);
    const today = new Date();
    const daysAvailable = Math.max(STANDARD_TEMPLATE.length, Math.round((submissionTarget.getTime() - today.getTime()) / 86400000));
    const step = Math.max(1, Math.floor(daysAvailable / STANDARD_TEMPLATE.length));
    datesPerTask = STANDARD_TEMPLATE.map((_, i) => {
      const reverseIndex = STANDARD_TEMPLATE.length - 1 - i;
      const d = new Date(submissionTarget);
      d.setUTCDate(d.getUTCDate() - reverseIndex * step);
      const iso = d.toISOString().slice(0, 10);
      const todayIso = today.toISOString().slice(0, 10);
      return iso < todayIso ? todayIso : iso;
    });
  }

  // Create tasks in order
  const createdTasks = [];
  for (let i = 0; i < STANDARD_TEMPLATE.length; i++) {
    const t = STANDARD_TEMPLATE[i];
    const body = {
      content: t.content,
      description: `<div>${t.note}</div><div><br></div><div><em>Standard template task ${i + 1}/${STANDARD_TEMPLATE.length}. Tier: ${t.tier}</em></div>`,
    };
    if (datesPerTask) body.due_on = datesPerTask[i];
    const todo = await bcPost(`/buckets/${PROJECT_ID}/todolists/${newList.id}/todos.json`, body);
    createdTasks.push({ id: todo.id, content: t.content, tier: t.tier, due_on: datesPerTask?.[i] });
  }

  return {
    listId: newList.id,
    listName: newList.name,
    appUrl: newList.app_url,
    tasksCreated: createdTasks.length,
    tasks: createdTasks,
  };
}

// =============================================================================
// POST a Gov-Contracts Message Board UPDATE with download instructions.
// This is step 1 of the two-step "add bids" flow:
//   1. propose_gov_bids_download_instructions(count) -> posts MB update with
//      Opportunity Pulse + Bonfire links, step-by-step instructions
//   2. Ali downloads the RFP zips manually
//   3. Ali comments back with the bid list (title + deadline + agency per bid)
//   4. CB calls addBid() per item to create the real todolist
// =============================================================================

// Opportunity Pulse is the internal admin tool at http://95.216.199.47/admin/bonfire/.
// Login is via session cookie (Ali's browser already has it). The "strategic"
// feed is the ranked opportunities view. Per-opportunity submission-readiness
// pages live at /admin/bonfire/<uuid>/submission-readiness.
//
// Bonfire (the public vendor portal) is where actual RFP zips live. Two accounts:
//   - Colaberry's vendor account (https://vendor.bonfirehub.com - Euna Supplier
//     Network invitation route, Colaberry-only proposals)
//   - Que's account (Detroit-style joint route)
// Per-agency portals at {agency}.bonfirehub.com/opportunities/{numeric_id}.
const OPPORTUNITY_PULSE_BASE = process.env.OPPORTUNITY_PULSE_BASE || 'http://95.216.199.47';
const OPPORTUNITY_PULSE_STRATEGIC = `${OPPORTUNITY_PULSE_BASE}/admin/bonfire/strategic`;
const OPPORTUNITY_PULSE_ALL = `${OPPORTUNITY_PULSE_BASE}/admin/bonfire`;
const BONFIRE_ACCOUNT_LOGIN = 'https://account.bonfirehub.com/login';
const BONFIRE_VENDOR_HUB = 'https://vendor.bonfirehub.com/opportunities';

function _escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _fmtMoney(n) {
  if (!n) return '';
  const v = parseInt(n, 10);
  if (isNaN(v)) return '';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v;
}

function _readTopOpportunities(count) {
  const fs = require('fs');
  const path = require('path');
  const allOppsPath = path.resolve(__dirname, '../../../../tmp/op-pulse/all-opps.json');
  try {
    const allOpps = JSON.parse(fs.readFileSync(allOppsPath, 'utf8'));
    const today = new Date();
    const active = (allOpps.data || []).filter((o) => o.closeDate && new Date(o.closeDate) > today);
    const top = active.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)).slice(0, count);
    return { ok: true, top, activeTotal: active.length, dataFreshness: (allOpps.data?.[0]?.enrichedAt || '').slice(0, 10) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function postGovBidDownloadInstructions({ count, criteriaSummary }) {
  // Fetch the message board id from the project dock
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const mb = proj.dock.find((d) => d.name === 'message_board');
  if (!mb) throw new Error('Message board not found on Gov Contracts project');

  const subject = `Top ${count} active opportunit${count === 1 ? 'y' : 'ies'} from Opportunity Pulse`;

  // Pull top N from the cached Opp Pulse strategic feed (priority-ranked).
  // Per Ali 2026-06-01: focus on the actual contracts, breathing room between
  // cards, emojis for fast visual scan, very explicit upload note.
  const oppResult = _readTopOpportunities(count);
  const _daysUntil = (iso) => { if (!iso) return null; const d=new Date(iso); const t=new Date(); return Math.round((d-t)/86400000); };
  const _urgencyEmoji = (d) => d == null ? '' : d <= 3 ? '🔥' : d <= 14 ? '⏰' : '📅';
  let cardsHtml = '';
  if (oppResult.ok) {
    cardsHtml = oppResult.top.map((o, i) => {
      const oppPulseUrl = `https://op.colaberry.ai/admin/bonfire/${o.id}/submission-readiness`;
      const bonfireUrl = o.sourceUrl || '';
      const signals = (o.signals || []).filter(s => s).slice(0, 3).join(' &middot; ');
      const summary = o.rawText && o.rawText !== o.title ? o.rawText : (o.description || '');
      const valueStr = _fmtMoney(o.estimatedValue);
      const days = _daysUntil(o.closeDate);
      const dueLabel = days != null ? (days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `in ${days}d`) : '';
      return `
<div style="border:1px solid #cbd5e1;border-radius:10px;padding:22px 24px;margin:24px 0;background:#ffffff;box-shadow:0 1px 3px rgba(15,23,42,0.05)">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700">Bid ${i + 1} of ${count}</div>
  <div style="font-size:17px;font-weight:800;color:#0f172a;margin-top:8px;line-height:1.3">${_escape(o.title)}</div>
  <div style="margin-top:14px;font-size:13px;color:#475569;line-height:1.8">
    🏛️ &nbsp;<strong style="color:#0f172a">${_escape(o.agency || 'Unknown agency')}</strong><br>
    ${_urgencyEmoji(days)} &nbsp;Deadline: <strong style="color:#0f172a">${(o.closeDate || '').slice(0, 10)}</strong>${dueLabel ? ` <span style="color:#64748b">(${dueLabel})</span>` : ''}${valueStr ? `<br>💰 &nbsp;Est value: <strong style="color:#0f172a">${valueStr}</strong>` : ''}
  </div>
  <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9;font-size:12px;color:#475569;line-height:1.8">
    ⚙️ &nbsp;Category: <strong>${_escape(o.aiCategory || '-')}</strong><br>
    🚀 &nbsp;Recommended product: <strong>${_escape(o.recommendedProduct || '-')}</strong><br>
    🎯 &nbsp;Scores: priority <strong>${o.priorityScore ?? '?'}</strong> &middot; fit <strong>${o.fitScore ?? '?'}</strong> &middot; automation <strong>${o.automationPotential ?? '?'}</strong>${signals ? `<br>✨ &nbsp;Signals: <strong>${signals}</strong>` : ''}
  </div>
  ${summary ? `<div style="margin-top:16px;padding:12px 14px;background:#f8fafc;border-radius:6px;font-size:13px;color:#1f2937;font-style:italic;line-height:1.5">"${_escape(summary).slice(0, 280)}${summary.length > 280 ? '...' : ''}"</div>` : ''}
  <div style="margin-top:18px;display:block">
    <a href="${oppPulseUrl}" style="display:inline-block;background:#1a365d;color:white;padding:9px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;margin-right:8px">📂 Opp Pulse readiness &rarr;</a>
    <a href="${bonfireUrl}" style="display:inline-block;background:#ffffff;color:#1a365d;padding:9px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:1.5px solid #1a365d">🔗 Bonfire opportunity &rarr;</a>
  </div>
</div>`;
    }).join('');
  } else {
    cardsHtml = `<div style="border:1px solid #fee2e2;border-radius:10px;padding:22px 24px;margin:24px 0;background:#fef2f2;color:#7f1d1d;font-size:13px">Could not read the cached Opp Pulse strategic feed (${_escape(oppResult.error)}). Open <a href="${OPPORTUNITY_PULSE_STRATEGIC}" style="color:#7f1d1d">${OPPORTUNITY_PULSE_STRATEGIC}</a> directly to pick ${count} ${criteriaSummary || 'opportunities'} and proceed with the upload flow below.</div>`;
  }
  const activeTotal = oppResult.ok ? oppResult.activeTotal : 0;
  const dataFreshness = oppResult.ok ? (oppResult.dataFreshness || 'recently') : 'unknown';

  const content = `<div style="font-size:14px;color:#1a202c;line-height:1.6">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:22px 24px;border-radius:10px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">🎯 Top ${count} active opportunit${count === 1 ? 'y' : 'ies'}</div>
  <div style="font-size:18px;font-weight:700;margin-top:6px">From Opportunity Pulse, ranked by priority score${criteriaSummary ? ` (${_escape(criteriaSummary)})` : ''}</div>
  <div style="font-size:13px;color:#cbd5e0;margin-top:6px">${activeTotal} active total in the strategic feed. Showing the ${count} highest-priority below.</div>
</div>

${cardsHtml}

<div style="margin-top:32px;padding:20px 22px;background:#fffbeb;border:2px solid #f59e0b;border-radius:10px">
  <div style="font-size:12px;font-weight:700;color:#78350f;letter-spacing:2px;text-transform:uppercase">⚠️ Before I can add these as projects</div>
  <div style="font-size:14px;color:#78350f;margin-top:10px;font-weight:600">For each bid you want to pursue, do this in Opp Pulse:</div>
  <ol style="font-size:13px;color:#1f2937;margin:14px 0 0;padding-left:24px;line-height:1.9">
    <li>📂 Click the <strong>Opp Pulse readiness</strong> button on the card above to open the per-bid page.</li>
    <li>⬇️ Download the RFP zip from the Bonfire link on that page.</li>
    <li>⬆️ Upload the zip to the <strong>Documents section of that opportunity in Opp Pulse</strong>. <strong style="color:#7f1d1d">NOT to Basecamp.</strong> Upload in Opp Pulse only.</li>
  </ol>
  <div style="margin-top:16px;padding:12px 14px;background:#ffffff;border-radius:6px;border-left:4px solid #f59e0b;font-size:13px;color:#1f2937;line-height:1.6">
    ✅ &nbsp;Once docs are in Opp Pulse, reply on this thread with the bid numbers you want, e.g. <code style="background:#fef3c7;padding:2px 6px;border-radius:3px;font-weight:700">@CB add bids 1, 3, 5</code> - I'll build the Basecamp projects with the 14-task template, due dates back-distributed from the deadline, and feasibility scoring.
  </div>
  <div style="margin-top:12px;font-size:12px;color:#78350f;font-weight:700;text-align:center">
    🚫 I cannot add a bid that does not yet have its documents in Opp Pulse - the docs are how I generate per-bid task descriptions.
  </div>
</div>

<div style="margin-top:18px;padding:10px 14px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6">
  Source: Opportunity Pulse strategic feed &middot; cached ${dataFreshness} &middot; ${activeTotal} active total<br>
  <a href="${OPPORTUNITY_PULSE_STRATEGIC}" style="color:#94a3b8">op.colaberry.ai/admin/strategic</a> &middot; Bonfire account routing per the gov-bid-account-routing rule
</div>

</div>`;

  const r = await bcPost(`/buckets/${PROJECT_ID}/message_boards/${mb.id}/messages.json`, {
    subject,
    content,
    status: 'active',
  });
  return {
    messageId: r.id,
    appUrl: r.app_url,
    subject,
  };
}

// =============================================================================
// Finalize bids from Ali's reply on the MB instructions post.
// Pipeline:
//   1. Parse the reply HTML/text via govBidReplyParser
//   2. For each parsed bid: call addBid() to create the todolist + tasks
//   3. Return per-bid result (success/failure + new list URL) so the caller
//      can post a single summary comment in the same thread.
// Returns { results: [{title, ok, listUrl?, error?}], parseWarnings: [...] }.
// =============================================================================
const { parseReply } = require('./govBidReplyParser');

// Dispatch:
//   - If bid has zipRef (Basecamp Vault upload URL): run full processGovBid
//     pipeline (zip-aware: extract, upload files to Vault, rich todolist,
//     kickoff message). Requires basecampToken + basecampIds at the caller.
//   - Otherwise (no zip): light template path via addBid (Phase 1 behavior).
//
// addBidFn / processZipBidFn are dependency-injection slots for smoke tests.
async function finalizeBidsFromReply({ replyBody, addBidFn, processZipBidFn, basecampToken, basecampIds }) {
  const { bids, warnings: parseWarnings } = parseReply(replyBody);
  const create = addBidFn || addBid;
  const results = [];
  for (const b of bids) {
    try {
      if (!b.deadline) {
        results.push({ title: b.title, ok: false, error: 'no deadline parsed - reply needs "deadline YYYY-MM-DD"' });
        continue;
      }

      // Zip-aware path
      if (b.zipRef) {
        if (!processZipBidFn && !basecampToken) {
          // No way to download + run pipeline. Fall through to light path
          // and surface a warning in the result.
          const r = await create({
            displayTitle: b.title, deadline: b.deadline,
            opportunityUuid: b.uuid, fitThesis: b.fitThesis, agencyName: b.agency,
          });
          results.push({ title: b.title, ok: true, mode: 'light-fallback',
            listUrl: r.appUrl, tasksCreated: r.tasksCreated, listId: r.listId,
            note: 'zip detected but no basecamp creds - fell back to light template' });
          continue;
        }
        const runZip = processZipBidFn || (async (args) => {
          const { downloadVaultZip, processBid } = require('./govBidPipeline');
          const dl = await downloadVaultZip({
            vaultUploadUrl: args.zipRef, basecampIds: args.basecampIds, basecampToken: args.basecampToken,
          });
          return processBid({
            bidConfig: {
              display_title: args.title, deadline: args.deadline, agency_name: args.agency,
              opportunity_uuid: args.uuid, fit_thesis: args.fitThesis, zip_path: dl.localZipPath,
            },
            basecampIds: args.basecampIds,
            basecampToken: args.basecampToken,
            opts: { generateTasksFromContent: true },
          });
        });
        const r = await runZip({
          zipRef: b.zipRef, title: b.title, deadline: b.deadline, agency: b.agency,
          uuid: b.uuid, fitThesis: b.fitThesis, basecampIds, basecampToken,
        });
        results.push({
          title: b.title, ok: true, mode: 'zip-aware',
          listUrl: r.list?.app_url, folderUrl: r.folder?.app_url, messageUrl: r.kickoff?.app_url,
          filesUploaded: r.uploaded?.length, tasksCreated: r.tasks?.length, listId: r.list?.id,
        });
        continue;
      }

      // Light path (no zip)
      const r = await create({
        displayTitle: b.title, deadline: b.deadline,
        opportunityUuid: b.uuid, fitThesis: b.fitThesis, agencyName: b.agency,
      });
      results.push({ title: b.title, ok: true, mode: 'light',
        listUrl: r.appUrl, tasksCreated: r.tasksCreated, listId: r.listId });
    } catch (e) {
      results.push({ title: b.title, ok: false, error: e.message });
    }
  }
  return { results, parseWarnings, parsedCount: bids.length };
}

module.exports = { scrapBid, addBid, postGovBidDownloadInstructions, finalizeBidsFromReply, STANDARD_TEMPLATE };
