#!/usr/bin/env node
// Build a context dossier PDF for Coca-Cola Consolidated and attach to the
// corresponding task in Ali Personal (todo 9951791925). Becomes Layer 4
// content for CB on every future @CB invocation on that task.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const PDFDocument = require(path.resolve(__dirname, '../../../node_modules/pdfkit'));

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Context', Accept: 'application/json', ...extra });
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955;
const TODO = 9951791925; // Coca-Cola Consolidated task in David Lahme list

// =============================================================================
// CONTENT - synthesized from the Lahme correspondence + my prior work this session
// =============================================================================

const DOC = {
  title: 'Coca-Cola Consolidated - Context Dossier',
  subtitle: 'For CB System (Layer 4 reference) + Ali. Synthesized 2026-06-01.',
  sections: [
    {
      heading: '1. Account at a glance',
      body: [
        'Target company: Coca-Cola Consolidated (CCC). Largest independent Coca-Cola bottler in the US. ~14 states. ~200+ bottling partners in the broader Coca-Cola system relevant to the platform conversation.',
        'Primary contact (via David Lahme): Darrell. Role: senior IT/operations leader with a mandate to transform operations from a cost center to a growth center.',
        'Second leader (target for June 4 lunch): VP of Data + Analytics. Name not yet captured.',
        'IT Security lead referenced in conversations: "Chad."',
        'June 4 visit confirmed: Snyder Production Center tour at 9am, Automated Warehouse stop at 10:15, then lunch with the two leaders.',
      ],
    },
    {
      heading: '2. Source quotes from David (preserved verbatim for CB)',
      body: [
        'David Lahme, 2026-05-13 readout of his Darrell conversation:',
        '"His mandate has been to transform his operations from a cost center to a growth center. They\'ve brought their legacy apps from 1800 to 700. They\'ve embedded AI across the enterprise to enhance operations using \'CokeGPT\'. For Cybersecurity and infrastructure they use cloud only models (AWS, AZURE, GCP) - allowing them to partner with over 200 bottling partners with scale and consistency. Through business partnerships - they want to leverage tech to increase revenue\'s and cust experiences."',
        'David, 2026-05-21 (Coca-Cola meeting confirmation): "I have us all confirmed for June 4th tour. We will do our tour of the Snyder Production Center at 9am, then transition to..."',
        'David, 2026-05-22 (after seeing the About Colaberry v1 draft): "Thank you - this is impressive at 1st glance. Quick ? Why don\'t have BioPharma, AgTech/Crop Science, along with Energy - why not state Utility/Oil & Gas & Engineering firms?"',
        'David, 2026-05-22 follow-up: "I\'d prefer you continuing to be the driver on this - you\'ve done an excellent job to date."',
      ],
    },
    {
      heading: '3. Key constraints (security paramount)',
      body: [
        'Cloud-only model use across AWS / Azure / GCP is the policy. No on-prem-only model story will land. Use cases either operate inside that stack OR offer an explicit on-prem mode for facility-sensitive data.',
        'CokeGPT is the enterprise AI system. Nothing we pitch should compete with it. Our governance / shadow-AI tools can be adjacent and strengthening.',
        '200+ bottling partners means scale and consistency matter. Use cases need to be templates a spoke can adopt without bespoke per-bottler engineering. Snyder becomes the reference implementation.',
      ],
    },
    {
      heading: '4. Use case taxonomy - 10 high-confidence for June 4',
      body: [
        'Narrowed from 12 candidates after the May 14 research synthesis. Dropped: Short-Horizon Demand Sensing (too generic, doesn\'t differentiate from CONA) + Cross-Facility Best-Practice Synthesis (too aspirational to demo).',
        'OPERATIONS - line-side + equipment:',
        '  1. Line-side AI Operator Assistant - tablet-side inference at the line, walks operators through changeovers, no line data leaves facility.',
        '  2. Computer Vision Quality Control - cameras at fill/label/cap classify defects in real time, video stays on-prem.',
        '  3. Predictive Maintenance for Production Equipment - sensor-stream models, 48-72hr fault prediction. Snyder runs 24/7; unplanned downtime is the most expensive failure mode.',
        'SUPPLY CHAIN - warehouse + inbound:',
        '  4. Warehouse Slotting + Pick-Path Optimization - maps directly to the 10:15 Automated Warehouse stop. Demoable.',
        '  5. Inbound Receiving Anomaly Detection - reads ASN against physical arrivals, catches mis-shipments at the dock.',
        'GOVERNANCE - the security-strengthening block:',
        '  6. (FLAGSHIP) AI Use-Case Governance Workflow - workflow tool for the AI council to triage / score / route spoke AI requests. Sits adjacent to CokeGPT, addresses the "council review friction" Darrell named.',
        '  7. On-Prem RAG for Sensitive Manufacturing Docs - air-gappable retrieval over SOPs/equipment manuals/MSDSs. Bridges cloud-only stack with facility-data-cannot-leave reality.',
        '  8. Shadow-AI + Vendor Risk Inventory - discovers shadow AI tools in use at spokes, maps to approved vendor list. The IT Security lead ("Chad") will care.',
        'ANALYTICS - for the VP of D+A:',
        '  9. Self-Service Analytics Copilot - NL over BI stack, NL-to-SQL/DAX against governed semantic models.',
        '  10. Spoke-Level Data Quality Monitoring - DQ on spoke-to-hub data, catches schema drift + late arrivals + value anomalies.',
      ],
    },
    {
      heading: '5. Suggested June 4 sequencing',
      body: [
        'Lead with use case 6 (AI Governance Workflow) - flagship spoke-execution play, speaks directly to Darrell\'s mandate.',
        'Frame use case 4 (Warehouse Slotting) live during the 10:15 Automated Warehouse stop. We can quantify throughput lift on the spot.',
        'Tee up use case 9 (Self-Service Analytics Copilot) for the VP of Data + Analytics.',
        'Hold use cases 7 + 8 for Chad in IT Security as the security-strengthening pair.',
        'Use cases 1, 2, 3, 5, 10 are the operational menu we offer once they pick a wedge.',
      ],
    },
    {
      heading: '6. About Colaberry pre-read - evolution to v5',
      body: [
        'David asked Ali to draft an "About Colaberry" overview to forward to the two Coke leaders ahead of the June 4 lunch (2026-05-22).',
        'v1 (2026-05-22): impressive first pass. David asked: why no BioPharma, AgTech/Crop Science, why not Utility/Oil&Gas/Engineering?',
        'v2 (2026-05-26): added the sector list per David\'s feedback. Section 1 (Who we serve) updated.',
        'v3 (2026-05-26): full structured feedback addressed; David: "Overall, it looks good - just sent additional feedback with some constructive minor changes."',
        'v4 (2026-05-26): five platforms tile naming polished. "document corpora" -> "document repositories" for non-technical readers.',
        'v5 (2026-05-26): final PDF with address fix, footer cleanup, headers/footers stripped. Ready for David to forward.',
        'Artifacts saved at docs/About_Colaberry_v5_FINAL.pdf (and v6 final).',
      ],
    },
    {
      heading: '7. Open threads + next steps',
      body: [
        'Karun: take a delivery-vantage pass on the 10 use cases before David forwards the v5 pre-read PDF.',
        'David: confirm the 10 use cases match what he\'s heard from Darrell + the second leader\'s office. Swap any that feel off.',
        'David: forward the final v5 About Colaberry PDF to the two Coke leaders ahead of lunch.',
        'June 4 execution per sequencing in section 5.',
      ],
    },
    {
      heading: '8. Reference - email threads (Gmail subjects, chronological)',
      body: [
        '2026-05-04 "Coca - Cola enterprise and taxonomy" - David\'s initial ask: can Colaberry be retrofitted for a company like Coca-Cola? Karun asked for use case taxonomy.',
        '2026-05-13 "Coca-Cola - deep dive for meeting" - June 4 tentative; David asked for use case taxonomy + demo. Includes the Darrell quote in section 2.',
        '2026-05-14 (within the same thread) - Ali synthesized use case taxonomy after Ram delegated lead.',
        '2026-05-21 "Coca-Cola meeting" - June 4 confirmed, Snyder tour + Automated Warehouse + lunch.',
        '2026-05-22 "About Colaberry overview - review draft for you" - v1 sent; David asked about sector additions.',
        '2026-05-22 "Coke notes" - reviewer artifact thread; about Colaberry pre-read evolution.',
        '2026-05-26 thread series: "Re: About Colaberry overview" + "Re: Coke notes" - v2 through v5 iterations including David\'s structured feedback.',
        '2026-06-01 (Mandrill) sent to Karun + David: "Coca-Cola Consolidated June 4 - top 10 use cases with reasoning + security posture". Message id 2d425692-813b-d983-3a78-d406b32528ae@colaberry.com.',
      ],
    },
  ],
};

// =============================================================================
// PDF generation
// =============================================================================

async function buildPdf() {
  const outPath = path.resolve(__dirname, '../../../tmp/coca-cola-context-dossier-2026-06-01.pdf');
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 60, bottom: 60, left: 60, right: 60 } });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  // Title block
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a').text(DOC.title);
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text(DOC.subtitle);
  doc.moveDown(0.5);
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(60, doc.y).lineTo(552, doc.y).stroke();
  doc.moveDown(0.8);

  for (const sec of DOC.sections) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a365d').text(sec.heading);
    doc.moveDown(0.3);
    for (const para of sec.body) {
      doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(para, { align: 'left' });
      doc.moveDown(0.25);
    }
    doc.moveDown(0.6);
  }
  doc.end();
  await new Promise((res) => stream.on('finish', res));
  return outPath;
}

// =============================================================================
// Attach to BC task as a comment
// =============================================================================

async function attachToTask(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const filename = path.basename(pdfPath);
  console.log(`[attach] uploading ${filename} (${buf.length} bytes) to BC...`);
  // Step 1: upload as attachment to get sgid
  const att = await (await fetch(`${BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/pdf' }),
    body: buf,
  })).json();
  const sgid = att.attachable_sgid;
  console.log(`  sgid: ${(sgid || '').slice(0, 30)}...`);

  // Step 2: upload to the project Vault (Docs & Files) so it gets a stable
  // https:// URL the context walker can detect + auto-fetch on future
  // @CB invocations. Without this, the bc-attachment sgid tag is invisible
  // to the URL-based walker.
  const proj = await (await fetch(`${BASE}/projects/${BUCKET}.json`, { headers: H() })).json();
  const vault = (proj.dock || []).find((d) => d.name === 'vault');
  if (!vault) throw new Error('vault not found on project');
  // Use a stable folder "CB Context Dossiers" so future regenerations land in the same place
  let folder = null;
  try {
    const subs = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, { headers: H() })).json();
    folder = Array.isArray(subs) ? subs.find((v) => v.title === 'CB Context Dossiers') : null;
  } catch {}
  if (!folder) {
    folder = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, {
      method: 'POST',
      headers: H({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'CB Context Dossiers' }),
    })).json();
    console.log(`  created Vault folder: ${folder.app_url}`);
  } else {
    console.log(`  using existing Vault folder: ${folder.app_url}`);
  }
  const upload = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      attachable_sgid: sgid,
      base_name: filename.replace(/\.pdf$/, ''),
      description: `Coca-Cola Consolidated context dossier. Synthesized 2026-06-01 from the Lahme correspondence. Read by CB context walker via pdf-parse on every @CB invocation on the corresponding task.`,
    }),
  })).json();
  console.log(`  vault upload: ${upload.app_url}`);

  // Step 3: post comment on the task with the Vault URL inline so CB's URL
  // extractor picks it up + Layer 4 walker fetches + pdf-parse extracts.
  const commentHtml = `<div><strong>Coca-Cola context dossier (for CB Layer 4)</strong></div>
<div style="margin-top:6px;font-size:13px">Synthesizes the Lahme email correspondence + use case taxonomy + About Colaberry pre-read evolution + June 4 sequencing. CB's context walker auto-fetches this PDF + extracts text via pdf-parse on every future @CB invocation on this task.</div>
<div style="margin-top:10px"><strong>Vault link:</strong> <a href="${upload.app_url}">${upload.app_url}</a></div>
<div style="margin-top:8px"><bc-attachment sgid="${sgid}" caption="${filename}"></bc-attachment></div>`;

  const r = await fetch(`${BASE}/buckets/${BUCKET}/recordings/${TODO}/comments.json`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content: commentHtml }),
  });
  if (!r.ok) throw new Error(`comment failed ${r.status}`);
  const c = await r.json();
  console.log(`  comment posted: ${c.app_url}`);
  return { sgid, vaultUrl: upload.app_url, commentUrl: c.app_url, pdfPath, pdfSize: buf.length };
}

(async () => {
  console.log('[ctx-pdf] building Coca-Cola context dossier...');
  const pdfPath = await buildPdf();
  const size = fs.statSync(pdfPath).size;
  console.log(`  PDF: ${pdfPath} (${size} bytes)`);
  const att = await attachToTask(pdfPath);
  console.log('\nDone.');
  console.log(JSON.stringify(att, null, 2));
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
