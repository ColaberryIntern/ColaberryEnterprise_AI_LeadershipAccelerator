const { google } = require('googleapis');
const fs = require('fs');

const MSG_ID = process.argv[2];
const OUT = process.argv[3];

async function main() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const msg = await gmail.users.messages.get({ userId: 'me', id: MSG_ID, format: 'full' });

  const found = [];
  (function walk(p) {
    if (!p) return;
    if (p.filename && p.body && p.body.attachmentId) {
      found.push({ filename: p.filename, attachmentId: p.body.attachmentId, size: p.body.size });
    }
    (p.parts || []).forEach(walk);
  })(msg.data.payload);

  console.log('ATTACHMENTS:');
  found.forEach(f => console.log('  ' + f.filename + '  ' + f.size + ' bytes'));

  const target = found.find(f => /\.xlsx$/i.test(f.filename));
  if (!target) { console.error('no xlsx attachment'); process.exit(1); }

  const att = await gmail.users.messages.attachments.get({
    userId: 'me', messageId: MSG_ID, id: target.attachmentId,
  });
  const buf = Buffer.from(att.data.data, 'base64');
  fs.writeFileSync(OUT, buf);
  console.log('WROTE ' + OUT + '  ' + buf.length + ' bytes  filename=' + target.filename);
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
