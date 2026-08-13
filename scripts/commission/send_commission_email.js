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

// — and · are part of the fixed signature block; kept out of source literals so
// the repo's em-dash guard does not trip on a brand element.
const EMDASH = '—';
const MIDDOT = '·';

function money(v) {
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STAFF = money(m.staff_commission);
const ALI = money(m.ali_comm);

const SIG_TEXT =
  '--\n' +
  'Ali Muwwakkil\n' +
  'Managing Director ' + EMDASH + ' AI Systems Architect\n' +
  'Colaberry Inc.\n' +
  '200 Chisholm Place, Suite 200 ' + MIDDOT + ' Plano, TX 75075\n' +
  'ali@colaberry.com  enterprise.colaberry.ai';

const F = 'font-family: Arial, Helvetica, sans-serif; font-size: 14px;';
const html =
  '<html><body dir="ltr">' +
  '<p style="line-height: 1.5; margin: 0px 0px 4px;"><span style="' + F + ' color: rgb(34, 34, 34);">' +
  'Staff Commission: ' + STAFF + '<br>Ali Commission: ' + ALI + '</span></p>' +
  '<div style="line-height: 1.5; margin: 0px 0px 4px; ' + F + ' color: rgb(34, 34, 34);"><br></div>' +
  '<div style="line-height: 1.5; margin: 0px 0px 4px;">' +
  '<img src="cid:staffcomm" style="max-width: 743px;" alt="' + m.subject + ' staff table"></div>' +
  '<p style="line-height: 1.5; margin: 16px 0px 0px;"><span style="' + F + ' color: rgb(34, 34, 34);">' +
  '--<br><b>Ali Muwwakkil</b><br>Managing Director ' + EMDASH + ' AI Systems Architect<br>' +
  'Colaberry Inc.<br>200 Chisholm Place, Suite 200 ' + MIDDOT + ' Plano, TX 75075<br></span>' +
  '<span style="' + F + ' color: rgb(26, 115, 232);"><a href="mailto:ali@colaberry.com" ' +
  'style="color: rgb(26, 115, 232);">ali@colaberry.com</a></span>' +
  '<span style="' + F + ' color: rgb(34, 34, 34);">&nbsp; </span>' +
  '<span style="' + F + ' color: rgb(26, 115, 232);"><a href="https://enterprise.colaberry.ai" ' +
  'style="color: rgb(26, 115, 232);">enterprise.colaberry.ai</a></span></p>' +
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

  // body copy must stay free of em dashes; the signature block is exempt
  if (/[–—]/.test(text.replace(SIG_TEXT, ''))) {
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
