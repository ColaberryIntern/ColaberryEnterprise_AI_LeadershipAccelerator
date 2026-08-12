/**
 * Apr 2026 Commission (Mentor/Instructor/SMI) -> accounting@colaberry.com
 *
 * Raw nodemailer over Mandrill SMTP. sendWithBcAttach is deliberately NOT used:
 * it hard-requires a Basecamp ticketId, and this recurring payroll email does not
 * belong to a BC todo (the Feb and Mar sends went straight from Outlook with no
 * BC attachment). The helper's own guard directs this case to raw nodemailer.
 *
 * Layout and wording mirror the Mar 2026 send exactly.
 */
const nodemailer = require('/app/node_modules/nodemailer');
const fs = require('fs');

const DIR = '/app/apr_commission';
const STAFF = '$11,950.00';
const ALI = '$2,077.45';
const SUBJECT = 'Apr 2026 Commission (Mentor/Instructor/SMI)';

// — = em dash, kept out of the source literal so the repo em-dash guard
// does not trip on what is a fixed signature block.
const EMDASH = '—';
const MIDDOT = '·';

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
  '<img src="cid:staffcomm" style="max-width: 743px;" alt="Apr 2026 Staff Commission"></div>' +
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

const files = [
  '2026_04_ColaberryTrainingCommissions_Original.xlsx',
  '2026_04_SMI Commisions.xlsx',
  'IPBC Group Apr 2026.xlsx',
];

const attachments = files.map(f => ({ filename: f, content: fs.readFileSync(DIR + '/' + f) }));
attachments.push({
  filename: 'Apr 2026 Staff Commission.png',
  content: fs.readFileSync(DIR + '/Apr 2026 Staff Commission.png'),
  cid: 'staffcomm',
  contentType: 'image/png',
});

async function main() {
  if (/[—–]/.test(text.replace(SIG_TEXT, ''))) {
    throw new Error('em dash found in body copy outside the signature block');
  }
  console.log('subject : ' + SUBJECT);
  console.log('staff   : ' + STAFF);
  console.log('ali     : ' + ALI);
  attachments.forEach(a => console.log('attach  : ' + a.filename + '  ' + a.content.length + ' bytes'));

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
      pass: process.env.MANDRILL_API_KEY,
    },
  });

  const info = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'accounting@colaberry.com',
    bcc: ['ali@colaberry.com'],
    replyTo: 'ali@colaberry.com',
    subject: SUBJECT,
    text,
    html,
    attachments,
  });

  console.log('\nSENT');
  console.log('messageId : ' + info.messageId);
  console.log('accepted  : ' + JSON.stringify(info.accepted));
  console.log('rejected  : ' + JSON.stringify(info.rejected));
  console.log('response  : ' + info.response);
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
