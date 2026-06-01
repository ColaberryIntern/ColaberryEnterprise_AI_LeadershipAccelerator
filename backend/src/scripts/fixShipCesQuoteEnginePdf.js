#!/usr/bin/env node
// Regenerate the broken Multi-option Quote Template Engine PDF from CB's
// ORIGINAL deliverable (comment 9946730206, 3982 chars), upload to BC, and
// post a corrected comment on todo 9946715864.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const PDFDocument = require(path.resolve(__dirname, '../../../node_modules/pdfkit'));

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-Fix', Accept: 'application/json', ...extra });
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 47126345;
const TODO = 9946715864;
const SOURCE_COMMENT = 9946730206;

function htmlToBlocks(html) {
  // Linear scan: tokenize by open/close tags, emit a block per recognized
  // semantic tag with its inner text content. Robust to nested wrappers.
  let s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
  const blocks = [];
  const openRe = /<(h2|h3|h4|p|li|strong)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = openRe.exec(s)) !== null) {
    const tag = m[1].toLowerCase();
    const text = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ tag, text });
  }
  // Dedup successive identical text
  const out = [];
  for (const b of blocks) {
    if (out.length === 0 || out[out.length - 1].text !== b.text) out.push(b);
  }
  return out;
}

(async () => {
  console.log('[fix-pdf] Reading source deliverable from BC ...');
  const cm = await (await fetch(`${BASE}/buckets/${BUCKET}/recordings/${TODO}/comments.json`, { headers: H() })).json();
  const source = cm.find((c) => c.id === SOURCE_COMMENT);
  if (!source) { console.error('source comment not found'); process.exit(1); }
  const html = source.content;
  const blocks = htmlToBlocks(html);
  console.log(`  source length: ${html.length} chars, parsed into ${blocks.length} blocks`);

  // Build the PDF
  const outPath = path.resolve(__dirname, '../../../tmp/multi-option-quote-template-engine-RESTORED.pdf');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 60, bottom: 60, left: 60, right: 60 } });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a').text('Multi-option Quote Template Engine', { align: 'left' });
  doc.font('Helvetica-Oblique').fontSize(10).fillColor('#475569').text('ShipCES first-pass deliverable - regenerated from full original 2026-06-01', { align: 'left' });
  doc.moveDown(0.5);
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(60, doc.y).lineTo(552, doc.y).stroke();
  doc.moveDown(0.5);

  for (const b of blocks) {
    if (b.tag === 'h2') {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(b.text);
      doc.moveDown(0.2);
    } else if (b.tag === 'h3') {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a365d').text(b.text);
      doc.moveDown(0.2);
    } else if (b.tag === 'h4') {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a365d').text(b.text);
      doc.moveDown(0.15);
    } else if (b.tag === 'li') {
      doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(`• ${b.text}`, { indent: 14 });
    } else if (b.tag === 'strong') {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(b.text);
    } else {
      doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(b.text, { align: 'left' });
      doc.moveDown(0.25);
    }
  }
  doc.end();
  await new Promise((res) => stream.on('finish', res));
  const size = fs.statSync(outPath).size;
  console.log(`  PDF written: ${outPath} (${size} bytes)`);

  // Upload to BC + post a corrective comment
  console.log('[fix-pdf] Uploading to BC + posting comment ...');
  const buf = fs.readFileSync(outPath);
  const attR = await fetch(`${BASE}/attachments.json?name=multi-option-quote-template-engine-RESTORED.pdf`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/pdf' }),
    body: buf,
  });
  if (!attR.ok) { console.error('attach fail:', attR.status, await attR.text()); process.exit(1); }
  const attach = await attR.json();
  const sgid = attach.attachable_sgid;

  const commentHtml = `<div><strong>Restored PDF (full content from the original 2026-06-01 1:12am deliverable, ${html.length} chars):</strong></div>
<div style="margin-top:6px">The earlier PDF attempts were incomplete because the CB handler was truncating thread comments to 400 chars before passing them to the LLM. Comment 9946730206 (the actual deliverable) is 3982 chars; the LLM was seeing only 400 of those and regenerating a single paragraph to fill the gap. Handler fix shipped 2026-06-01.</div>
<div style="margin-top:10px"><bc-attachment sgid="${sgid}" caption="multi-option-quote-template-engine-RESTORED.pdf"></bc-attachment></div>`;

  const cr = await fetch(`${BASE}/buckets/${BUCKET}/recordings/${TODO}/comments.json`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content: commentHtml }),
  });
  if (!cr.ok) { console.error('comment fail:', cr.status, await cr.text()); process.exit(1); }
  const cc = await cr.json();
  console.log(`  comment id ${cc.id}: ${cc.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
