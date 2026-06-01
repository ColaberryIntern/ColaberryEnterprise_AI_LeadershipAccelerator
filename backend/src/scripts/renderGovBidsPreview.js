#!/usr/bin/env node
// Render the new gov-bids message HTML in headless Chromium and capture a
// screenshot so Ali can see the new look without needing to be logged into
// Basecamp. Outputs a PNG to docs/screenshots/ and emails it to Ali.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry GovBidsPreview', Accept: 'application/json' };

const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/2026-06-01-gov-bids-v2');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Fetch the current msg content (the one we just PUT)
  const msg = await (await fetch(`https://3.basecampapi.com/3945211/buckets/47346103/messages/9950817863.json`, { headers: H })).json();
  const wrapped = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}</style></head><body>${msg.content}</body></html>`;
  const tmpPath = path.join(OUT_DIR, 'preview.html');
  fs.writeFileSync(tmpPath, wrapped);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto('file:///' + tmpPath.replace(/\\/g, '/'));
  await page.waitForLoadState('domcontentloaded');
  const shotPath = path.join(OUT_DIR, 'gov-bids-v2-full.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  await browser.close();
  console.log(`Screenshot: ${shotPath} (${fs.statSync(shotPath).size} bytes)`);

  // Email Ali with the screenshot inlined
  const buf = fs.readFileSync(shotPath);
  const b64 = buf.toString('base64');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">
<div style="background:#0f172a;color:white;padding:22px 28px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">New look - rendered preview</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">Gov Bids MB post v2 - spacing + emojis + tighter footer</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">This is what the message looks like rendered standalone. The live BC message has been updated in place - same view if you refresh <a href="https://app.basecamp.com/3945211/buckets/47346103/messages/9950817863" style="color:#fbbf24">the post</a>.</div>
</div>
<div style="padding:18px 28px">
<img src="data:image/png;base64,${b64}" style="display:block;max-width:100%;border:1px solid #cbd5e1;border-radius:6px" alt="Gov Bids v2 preview">
</div>
<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569;line-height:1.65">
<strong>Changes vs v1:</strong>
<ul style="margin-top:6px">
<li>Hero band with bid count + active-total context.</li>
<li>Card spacing 24px between cards (was 12px), padding 22-24px inside (was 14-16px), subtle shadow.</li>
<li>Emojis as visual anchors per row: 🏛️ agency, 📅/⏰/🔥 deadline (urgency-based), 💰 value, ⚙️ category, 🚀 product, 🎯 scores, ✨ signals.</li>
<li>Two-tone CTA buttons (solid Opp Pulse, outlined Bonfire) so the primary action stands out.</li>
<li>Quote-style summary block in a subtle gray card.</li>
<li>Footer: bigger amber border, ⚠️ headline, 🚫 hard-stop line at bottom, ✅ reply-format example highlighted.</li>
</ul>
</div>
</div></body></html>`;

  const text = `New look on the Gov Bids MB post - rendered preview attached as inline image.

Live BC message updated in place: https://app.basecamp.com/3945211/buckets/47346103/messages/9950817863

Changes vs v1: hero band, 24px between cards, padding 22-24px, emoji anchors per row, two-tone CTA buttons, quote-style summary, beefed-up footer with hard-stop line.

Ali`;

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    subject: '[Preview] Gov Bids post v2 - new look with spacing + emojis',
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log(`Email sent: ${r.messageId}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
