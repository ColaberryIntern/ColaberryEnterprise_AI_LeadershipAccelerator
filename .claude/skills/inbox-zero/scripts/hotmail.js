// hotmail.js: Ali's second inbox, ali_muwwakkil@hotmail.com, over Microsoft Graph. "Current
// inboxes" is plural (Ali, 2026-09-16: "you should be checking hotmail and alimuwwakkil@gmail.com
// as well"). The refresh token lives in the vault the backend already manages (graphTokenStore);
// nothing is read locally and a rotated token is persisted, never printed.
//   ssh root@95.216.199.47 "docker exec -i -e CMD=inbox accelerator-backend node -" < hotmail.js
// CMD=inbox                 list the inbox (id, from, subject, received, attachments)
// CMD=folders [MATCH=re]    list mail folders (504 of them; MATCH narrows by name)
// CMD=read ID=<messageId>   body text plus attachment names; SAVE=1 also writes attachments to /tmp
// CMD=move ID=<messageId> FOLDER=<exact folder name>   file a message and prove where it landed
// CMD=recent HOURS=3        everything received in the last N hours across all folders (finds mail
//                           that gate 1 or the Junk filter already moved)
const fs = require('fs');
const axios = require('axios');
const { getRefreshToken, saveRotatedToken } = require('/app/dist/services/inbox/graphTokenStore');
const G = 'https://graph.microsoft.com/v1.0';

async function token() {
  const rt = await getRefreshToken();
  const res = await axios.post('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID, grant_type: 'refresh_token', refresh_token: rt, scope: 'Mail.Read Mail.ReadWrite offline_access',
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 });
  if (res.data.refresh_token && res.data.refresh_token !== rt) await saveRotatedToken(res.data.refresh_token);
  return res.data.access_token;
}
const strip = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

(async () => {
  const H = { Authorization: 'Bearer ' + (await token()) };
  const get = (u) => axios.get(u, { headers: H, timeout: 60000 }).then((r) => r.data);
  const cmd = process.env.CMD || 'inbox';
  let out;
  if (cmd === 'inbox') {
    const r = await get(G + '/me/mailFolders/inbox/messages?$top=50&$select=id,subject,from,receivedDateTime,hasAttachments,bodyPreview&$orderby=receivedDateTime desc');
    out = r.value.map((m) => ({ id: m.id, received: m.receivedDateTime, from: m.from && m.from.emailAddress && m.from.emailAddress.address, subject: m.subject, attachments: m.hasAttachments, preview: (m.bodyPreview || '').slice(0, 120) }));
  } else if (cmd === 'folders') {
    let all = [], url = G + '/me/mailFolders?$top=200&$select=id,displayName,totalItemCount,unreadItemCount';
    while (url) { const d = await get(url); all = all.concat(d.value); url = d['@odata.nextLink']; }
    const re = process.env.MATCH ? new RegExp(process.env.MATCH, 'i') : null;
    out = all.filter((f) => !re || re.test(f.displayName)).map((f) => ({ id: f.id, name: f.displayName, items: f.totalItemCount, unread: f.unreadItemCount }));
  } else if (cmd === 'read') {
    const id = process.env.ID;
    const m = await get(G + '/me/messages/' + id + '?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,parentFolderId');
    const atts = await get(G + '/me/messages/' + id + '/attachments');
    const saved = [];
    for (const a of atts.value) {
      const name = String(a.name || a.id.slice(-8)).replace(/[^A-Za-z0-9._-]/g, '_');
      if (process.env.SAVE && a.contentBytes) fs.writeFileSync('/tmp/' + name, Buffer.from(a.contentBytes, 'base64'));
      saved.push({ name, type: a.contentType, size: a.size, inline: a.isInline, saved: !!(process.env.SAVE && a.contentBytes) });
    }
    out = { id, subject: m.subject, from: m.from && m.from.emailAddress && m.from.emailAddress.address, to: m.toRecipients.map((r) => r.emailAddress.address), cc: m.ccRecipients.map((r) => r.emailAddress.address), received: m.receivedDateTime, attachments: saved, body: strip(m.body && m.body.content).slice(0, Number(process.env.MAXCHARS || 4000)) };
  } else if (cmd === 'move') {
    const id = process.env.ID, name = process.env.FOLDER;
    let all = [], url = G + '/me/mailFolders?$top=200&$select=id,displayName';
    while (url) { const d = await get(url); all = all.concat(d.value); url = d['@odata.nextLink']; }
    const f = all.find((x) => x.displayName === name);
    if (!f) throw new Error('no folder named exactly "' + name + '"');
    const moved = (await axios.post(G + '/me/messages/' + id + '/move', { destinationId: f.id }, { headers: H, timeout: 30000 })).data;
    const folder = await get(G + '/me/mailFolders/' + moved.parentFolderId + '?$select=displayName');
    out = { moved: moved.subject, now_in: folder.displayName };
  } else if (cmd === 'recent') {
    const since = new Date(Date.now() - Number(process.env.HOURS || 3) * 3600 * 1000).toISOString();
    const r = await get(G + '/me/messages?$filter=receivedDateTime ge ' + since + '&$top=50&$select=id,subject,from,receivedDateTime,hasAttachments,parentFolderId&$orderby=receivedDateTime desc');
    const names = {};
    for (const m of r.value) if (!names[m.parentFolderId]) names[m.parentFolderId] = (await get(G + '/me/mailFolders/' + m.parentFolderId + '?$select=displayName')).displayName;
    out = r.value.map((m) => ({ id: m.id, received: m.receivedDateTime, folder: names[m.parentFolderId], from: m.from && m.from.emailAddress && m.from.emailAddress.address, subject: m.subject, attachments: m.hasAttachments }));
  } else throw new Error('unknown CMD ' + cmd);
  fs.writeSync(1, JSON.stringify(out, null, 1) + '\n');
  process.exit(0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.response ? JSON.stringify(e.response.data).slice(0, 300) : (e.stack || e)) + '\n'); process.exit(1); });
