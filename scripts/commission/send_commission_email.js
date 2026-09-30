/**
 * Send the monthly commission email to accounting@colaberry.com.
 *
 * Takes NO figures of its own. Everything comes from send_manifest.json, which
 * only preflight.py writes and only after its checks pass. Before sending, every
 * attachment is re-hashed against the manifest, so a file edited between preflight
 * and send aborts rather than going out unnoticed.
 *
 *   node send_commission_email.js --dir /app/commission              # dry run
 *   node send_commission_email.js --dir /app/commission --send       # really send
 *
 * Raw nodemailer rather than sendWithBcAttach: that helper hard-requires a
 * Basecamp ticketId and this recurring payroll email has no originating ticket
 * (Feb and Mar went straight from Outlook). Its own guard directs this case here.
 */
// Required lazily, only on a real send, so a dry run works anywhere - including
// outside the backend container, which is where the integrity checks get tested.
function loadNodemailer() {
  try { return require('/app/node_modules/nodemailer'); } catch (e) { return require('nodemailer'); }
}
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DIR = (args[args.indexOf('--dir') + 1] || '').replace(/[\\/]+$/, '');
const DO_SEND = args.includes('--send');
if (!DIR || args.indexOf('--dir') === -1) {
  console.error('usage: node send_commission_email.js --dir <folder> [--send]');
  process.exit(2);
}

const manifestPath = path.join(DIR, 'send_manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('ERR no send_manifest.json in ' + DIR + '\n' +
                '    Run preflight.py first - it is the only thing that writes one,\n' +
                '    and only when the month is safe to send.');
  process.exit(2);
}
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));


function money(v) {
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STAFF = money(m.staff_commission);
const ALI = money(m.ali_comm);

// Ali's REAL Outlook signature (Ali, 2026-09-15: "I have a valid signature - use that and
// don't duplicate"). The kit is ali_signature.html + ali_signature_logo.png, canonical copy at
// .claude/skills/inbox-zero/assets, staged at /root/ali-signature on the prod host and
// /tmp/ali-signature in the backend container. No kit, no send: a hand-typed lookalike is
// exactly the "messed up signature" this replaces.
const SIG_DIRS = [
  process.env.ALI_SIG_DIR,
  path.resolve(__dirname, '..', '..', '.claude', 'skills', 'inbox-zero', 'assets'),
  '/tmp/ali-signature',
  '/root/ali-signature',
].filter(Boolean);
const SIG_DIR = SIG_DIRS.find(d => fs.existsSync(path.join(d, 'ali_signature.html')) &&
                                   fs.existsSync(path.join(d, 'ali_signature_logo.png')));
if (!SIG_DIR) {
  console.error('ABORT: signature kit not found (ali_signature.html + ali_signature_logo.png) in any of:\n  ' +
                SIG_DIRS.join('\n  ') + '\nSet ALI_SIG_DIR. Never send with a typed-in signature.');
  process.exit(1);
}
const SIG_HTML = fs.readFileSync(path.join(SIG_DIR, 'ali_signature.html'), 'utf8');
const LOGO_CID = (SIG_HTML.match(/cid:([^"']+)/) || [])[1];
if (!LOGO_CID) { console.error('ABORT: signature html carries no cid: logo reference'); process.exit(1); }

// plain-text fallback for the text/plain part only; the HTML part carries the real block
const SIG_TEXT =
  'Ali Muwwakkil\n' +
  'Managing Director / AI Systems Architect\n' +
  'Colaberry Inc.\n' +
  '200 Chisholm Place, Suite 200, Plano, TX 75075\n' +
  'ali@colaberry.com  |  enterprise.colaberry.ai\n' +
  'Design Your AI Organization: https://advisor.colaberry.ai/advisory';

const F = 'font-family: Arial, Helvetica, sans-serif; font-size: 14px;';
const html =
  '<html><body dir="ltr">' +
  '<p style="line-height: 1.5; margin: 0px 0px 4px;"><span style="' + F + ' color: rgb(34, 34, 34);">' +
  'Staff Commission: ' + STAFF + '<br>Ali Commission: ' + ALI + '</span></p>' +
  '<div style="line-height: 1.5; margin: 0px 0px 4px; ' + F + ' color: rgb(34, 34, 34);"><br></div>' +
  '<div style="line-height: 1.5; margin: 0px 0px 4px;">' +
  '<img src="cid:staffcomm" style="max-width: 743px;" alt="' + m.subject + ' staff table"></div>' +
  '<div style="height: 16px;"></div>' + SIG_HTML +
  '</body></html>';

const text = 'Staff Commission: ' + STAFF + '\nAli Commission: ' + ALI + '\n\n' + SIG_TEXT;

async function main() {
  console.log('subject : ' + m.subject);
  console.log('to      : ' + m.to.join(', ') + '   bcc: ' + m.bcc.join(', '));
  console.log('staff   : ' + STAFF);
  console.log('ali     : ' + ALI + '   (CompanyPaid ' + money(m.company_paid) + ', tier ' + m.tier_rate + ')');
  console.log('manifest: generated ' + m.generated_utc);

  // --- integrity: files must be exactly what preflight approved -----------
  const attachments = [];
  let bad = 0;
  for (const a of m.attachments) {
    const p = path.join(DIR, a.filename);
    if (!fs.existsSync(p)) { console.error('  MISSING  ' + a.filename); bad++; continue; }
    const buf = fs.readFileSync(p);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== a.sha256 || buf.length !== a.bytes) {
      console.error('  CHANGED  ' + a.filename + ' - re-run preflight.py, do not send');
      bad++;
      continue;
    }
    console.log('  verified ' + a.filename + '  ' + buf.length + ' bytes');
    const att = { filename: a.filename, content: buf };
    if (a.role === 'png') { att.cid = 'staffcomm'; att.contentType = 'image/png'; }
    attachments.push(att);
  }
  if (bad) { console.error('\nABORT: ' + bad + ' attachment(s) failed integrity check.'); process.exit(1); }
  if (attachments.length !== 4) { console.error('\nABORT: expected 4 attachments, have ' + attachments.length); process.exit(1); }
  attachments.push({ filename: 'colaberry-logo.png', path: path.join(SIG_DIR, 'ali_signature_logo.png'), cid: LOGO_CID, contentDisposition: 'inline' });
  // the real block exactly once, with its logo wired to the inline attachment
  if ((html.match(/alt="Colaberry"/g) || []).length !== 1 || !html.includes('cid:' + LOGO_CID)) {
    console.error('\nABORT: signature block count != 1 or logo cid missing'); process.exit(1);
  }
  console.log('signature: real kit from ' + SIG_DIR + ' (logo cid ' + LOGO_CID + ')');

  // body copy must stay free of em dashes (the HTML signature is Ali's own block and is exempt)
  if (/[–—]/.test(text)) {
    console.error('\nABORT: en/em dash in body copy'); process.exit(1);
  }

  if (!DO_SEND) {
    console.log('\nDRY RUN - nothing sent. Add --send to deliver.');
    console.log('\n--- body ---\n' + text);
    return;
  }

  if (!process.env.MANDRILL_API_KEY) { console.error('ABORT: MANDRILL_API_KEY not set'); process.exit(1); }

  const transport = loadNodemailer().createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const info = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: m.to.join(', '),
    bcc: m.bcc,
    replyTo: 'ali@colaberry.com',
    subject: m.subject,
    text, html, attachments,
  });

  console.log('\nSENT');
  console.log('messageId : ' + info.messageId);
  console.log('accepted  : ' + JSON.stringify(info.accepted));
  console.log('rejected  : ' + JSON.stringify(info.rejected));
  console.log('response  : ' + info.response);

  fs.writeFileSync(path.join(DIR, 'send_receipt.json'), JSON.stringify({
    subject: m.subject, messageId: info.messageId, accepted: info.accepted,
    rejected: info.rejected, response: info.response,
    staff_commission: m.staff_commission, ali_comm: m.ali_comm,
  }, null, 2));
  console.log('\nreceipt written. Now run:  python preflight.py --month ' +
              m.year + '-' + String(m.month).padStart(2, '0') + ' --dir <dir> --record');
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
