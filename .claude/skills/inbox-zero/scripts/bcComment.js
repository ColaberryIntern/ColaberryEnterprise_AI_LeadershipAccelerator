// bcComment.js: post a comment on a Basecamp recording AS ALI, optionally @-mentioning people and
// completing the to-do. A Basecamp notification email is handled in Basecamp (Ali, 2026-09-12), and
// this is the one write path for that. Idempotent: MARK is a token written into the comment; if a
// comment by Ali already carries it, nothing is posted again.
//   ssh root@95.216.199.47 "docker exec -i -e BUCKET=47346103 -e RECORDING=10068242217 -e MARK='[decision-2026-09-17-x]' -e MENTION_IDS=33056069 -e HTML_B64=<base64 html> accelerator-backend node -" < bcComment.js
// Env: BUCKET, RECORDING (todo/message/document id), HTML_B64 (comment body, base64 so quoting
//      never bites), MARK (required), MENTION_IDS (comma-separated person ids; each becomes a real
//      <bc-attachment> mention prepended to the body), COMPLETE=1 (also complete the to-do).
// Safety: refuses to run unless the token resolves to Ali (person 17454835). The live token is the
// prod host's, refreshed from CCPP by refreshBcToken; it is never printed.
const fs = require('fs');
const { refreshBcToken } = require('/app/dist/services/ops/basecampToken');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const token = await refreshBcToken();
  const H = { Authorization: 'Bearer ' + token, 'User-Agent': 'Colaberry Ops (ali@colaberry.com)', 'Content-Type': 'application/json' };
  const api = async (method, p, body) => {
    const r = await fetch('https://3.basecampapi.com/3945211' + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { await sleep(4000); return api(method, p, body); }
    if (!r.ok) throw new Error(r.status + ' ' + method + ' ' + p + ' ' + (await r.text()).slice(0, 200));
    return r.status === 204 ? null : r.json();
  };
  const me = await api('GET', '/my/profile.json');
  if (me.id !== 17454835) throw new Error('token is not Ali (' + me.id + '); refusing to write');
  const { BUCKET, RECORDING, MARK } = process.env;
  if (!BUCKET || !RECORDING || !MARK) throw new Error('BUCKET, RECORDING and MARK are required');
  const body = Buffer.from(process.env.HTML_B64 || '', 'base64').toString('utf8');
  const mentions = [];
  for (const id of String(process.env.MENTION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const p = await api('GET', '/people/' + id + '.json');
    mentions.push('<bc-attachment sgid="' + p.attachable_sgid + '" content-type="application/vnd.basecamp.mention"></bc-attachment>');
  }
  const existing = await api('GET', '/buckets/' + BUCKET + '/recordings/' + RECORDING + '/comments.json');
  let posted = null;
  if (existing.some((c) => c.creator && c.creator.id === 17454835 && String(c.content).includes(MARK))) {
    posted = 'already posted (' + MARK + ')';
  } else {
    const content = (mentions.length ? '<div>' + mentions.join(' ') + ' </div>' : '') + body + '<div>' + MARK + '</div>';
    const c = await api('POST', '/buckets/' + BUCKET + '/recordings/' + RECORDING + '/comments.json', { content });
    posted = c.app_url;
  }
  let completed = null;
  if (process.env.COMPLETE === '1') {
    const t = await api('GET', '/buckets/' + BUCKET + '/todos/' + RECORDING + '.json');
    if (!t.completed) await api('POST', '/buckets/' + BUCKET + '/todos/' + RECORDING + '/completion.json');
    completed = (await api('GET', '/buckets/' + BUCKET + '/todos/' + RECORDING + '.json')).completed;
  }
  fs.writeSync(1, JSON.stringify({ posted, completed }) + '\n');
  process.exit(0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
