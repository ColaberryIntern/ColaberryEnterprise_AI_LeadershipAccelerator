// C120 step 5, read-only: of the Open House welcome emails, how many Mandrill shows delivered, opened and clicked.
// Our DB stores neither opens nor clicks for this email, and communication_logs.provider_message_id is the SMTP Message-ID
// header (not Mandrill's _id), so each recipient is searched by address. Runs inside accelerator-backend
// (MANDRILL_API_KEY; never printed). Prints addresses masked.
// Usage: node mandrillFunnel.js <file of addresses, one per line> <since YYYY-MM-DD>
const fs = require('fs');
const key = process.env.MANDRILL_API_KEY;
if (!key) { console.error('ERR no MANDRILL_API_KEY'); process.exit(1); }
const [, , file, since] = process.argv;
const want = [...new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@')))];
const mask = (e) => e.replace(/^(.).*?(@.*)$/, '$1***$2');
async function byEmail(email) {
  const r = await fetch('https://mandrillapp.com/api/1.0/messages/search.json', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, query: `email:${email}`, date_from: since, limit: 50 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`mandrill ${r.status}`);
  return r.json();
}
(async () => {
  const out = [];
  for (const e of want) {
    const w = (await byEmail(e)).filter((m) => /first assignment/i.test(m.subject || ''));
    const m = w[0];
    out.push(m ? { to: mask(e), state: m.state, opens: m.opens, clicks: m.clicks, sent: new Date(m.ts * 1000).toISOString() }
      : { to: mask(e), found: false });
    await new Promise((res) => setTimeout(res, 1200));   // stay well under Mandrill's search rate limit
  }
  for (const o of out) console.log(JSON.stringify(o));
  const ok = out.filter((o) => o.found !== false);
  console.log('SUMMARY', JSON.stringify({
    emails: want.length, found: ok.length, delivered: ok.filter((o) => o.state === 'sent').length,
    opened: ok.filter((o) => o.opens > 0).length, clicked: ok.filter((o) => o.clicks > 0).length,
  }));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
