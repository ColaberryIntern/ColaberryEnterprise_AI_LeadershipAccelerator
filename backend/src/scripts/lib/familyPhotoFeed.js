/**
 * familyPhotoFeed - picks the family photos for today's Family Dashboard from Ali's phone camera
 * roll (OneDrive "Camera Roll", backed up automatically from the phone) and remembers every photo it
 * has ever posted so no picture, and no near-copy of one, is ever shown twice.
 *
 * Ali, 2026-11-13: "when I take pictures of creed or us as a family, you can post them to the Family
 * Dashboard automatically... never post the same picture multiple days. It's a one time thing per
 * picture. No repeats or duplicates."
 *
 * How "never twice" is enforced (the ledger, a JSON file on the prod host):
 *   - every posted photo is recorded by OneDrive item id AND by content hash (sha1), so a second copy
 *     of the same file under another name is also refused;
 *   - a photo taken within MOMENT_GAP_MIN of any posted photo is the same "moment" (a burst of six
 *     near-identical shots) and is refused, so a burst yields exactly one picture, ever;
 *   - a re-run on the SAME day reuses that day's picks instead of choosing new ones, so a manual
 *     resend never burns extra photos and never shows a photo on a second day.
 * The ledger is only written by commitPicks(), which the send script calls AFTER Mandrill accepts
 * the email. A failed send therefore posts nothing and the photos stay available for the next run.
 *
 * Which photos count: images only (no videos, email cannot play them), taken on or after FEED_START
 * and within the last WINDOW_DAYS, that a vision model labels as people/family pictures. Receipts,
 * documents, screenshots and objects are skipped. The model's label is cached in the ledger per item
 * so a photo is classified (and paid for) once.
 *
 * Failure modes handled: Graph auth/consent failure, Graph or OpenAI timeouts (each call is bounded),
 * a missing ledger (starts empty), a corrupt ledger (refuses to run rather than risk repeats). The
 * caller treats any throw as "no photos today" and still sends the rest of the dashboard.
 * Not handled: photos that never reach OneDrive (backup off on the phone).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LEDGER_PATH = process.env.FAMILY_PHOTO_LEDGER || '/var/lib/family-dashboard/photo-ledger.json';
const FEED_START = '2026-11-01'; // nothing older is ever posted (the phone backlog goes back years)
const WINDOW_DAYS = 14;
const MAX_PER_DAY = 6;
const MOMENT_GAP_MIN = 10;
const HTTP_TIMEOUT_MS = 30000;

// ---------- pure helpers (unit-tested) ----------

/** Local capture time from a phone file name like 20261106_182436.jpg, else the Graph field. */
function takenAt(item) {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(item.name || '');
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const t = (item.photo && item.photo.takenDateTime) || item.createdDateTime || '';
  return String(t).replace(/Z$/, '').slice(0, 19);
}
const minutes = (a, b) => Math.abs(new Date(a + 'Z') - new Date(b + 'Z')) / 60000;
const isImage = (item) => /\.(jpe?g|png|heic|heif|webp)$/i.test(item.name || '') && !!item.file;
const hashOf = (item) => (item.file && item.file.hashes && (item.file.hashes.sha1Hash || item.file.hashes.quickXorHash)) || null;

function emptyLedger() { return { version: 1, posted: {}, hashes: {}, labels: {} }; }

function loadLedger(file = LEDGER_PATH) {
  if (!fs.existsSync(file)) return emptyLedger();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); // corrupt file throws: never guess past it
  return { ...emptyLedger(), ...parsed };
}

function saveLedger(ledger, file = LEDGER_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 1));
  fs.renameSync(tmp, file); // atomic: a crash mid-write cannot leave a half ledger
}

/** True when this item may never be shown again (already posted, a copy of one, or same moment). */
function isBlocked(item, ledger) {
  if (ledger.posted[item.id]) return true;
  const h = hashOf(item);
  if (h && ledger.hashes[h]) return true;
  const t = takenAt(item);
  return Object.values(ledger.posted).some((p) => p.takenAt && minutes(p.takenAt, t) <= MOMENT_GAP_MIN);
}

/** Group time-sorted items into moments: a new moment starts after a gap of more than MOMENT_GAP_MIN. */
function groupMoments(items) {
  const sorted = [...items].sort((a, b) => takenAt(a).localeCompare(takenAt(b)));
  const moments = [];
  for (const it of sorted) {
    const last = moments[moments.length - 1];
    if (last && minutes(takenAt(last[last.length - 1]), takenAt(it)) <= MOMENT_GAP_MIN) last.push(it);
    else moments.push([it]);
  }
  return moments;
}

/**
 * Today's picks. Pure: items (Graph driveItems), the ledger (with labels), today (YYYY-MM-DD).
 * Same-day re-run returns the photos already posted today. Otherwise: eligible family photos, one
 * per moment (the best-rated), oldest moment first so nothing is skipped, capped at MAX_PER_DAY.
 */
function choosePicks(items, ledger, today) {
  const already = Object.entries(ledger.posted).filter(([, p]) => p.postedOn === today).map(([id]) => id);
  if (already.length) {
    const byId = new Map(items.map((i) => [i.id, i]));
    return { reused: true, picks: already.map((id) => byId.get(id) || { id, name: ledger.posted[id].name, _missing: true }).filter((x) => !x._missing) };
  }
  const start = laterOf(FEED_START, shiftDays(today, -WINDOW_DAYS));
  const eligible = items.filter((i) => {
    const d = takenAt(i).slice(0, 10);
    const label = ledger.labels[i.id];
    return isImage(i) && d >= start && d <= today && label && label.family && !isBlocked(i, ledger);
  });
  const seenHash = new Set();
  const deduped = eligible.filter((i) => { const h = hashOf(i); if (!h) return true; if (seenHash.has(h)) return false; seenHash.add(h); return true; });
  const picks = groupMoments(deduped)
    .map((m) => m.slice().sort((a, b) => (ledger.labels[b.id].quality || 0) - (ledger.labels[a.id].quality || 0))[0])
    .slice(0, MAX_PER_DAY);
  return { reused: false, picks };
}

/** Record picks as posted on `today`. Pure on the ledger object (caller saves). */
function markPosted(ledger, picks, today) {
  for (const p of picks) {
    ledger.posted[p.id] = { name: p.name, takenAt: takenAt(p), postedOn: today, hash: hashOf(p) };
    const h = hashOf(p);
    if (h) ledger.hashes[h] = p.id;
  }
  return ledger;
}

function shiftDays(ymd, n) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function laterOf(a, b) { return a > b ? a : b; }

// ---------- I/O ----------

async function fetchJson(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${url.split('?')[0]} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * The Hotmail refresh token from the backend's vault (oauth_token_vault, kept fresh by the backend's
 * own rotations), else the env var. Read-only: this job never writes the vault, so it cannot race
 * the backend's rotation.
 */
function vaultRefreshToken() {
  try {
    const out = execFileSync('docker', ['exec', 'accelerator-db', 'psql', '-U', process.env.PROD_DB_USER || 'accelerator', '-d', process.env.PROD_DB_NAME || 'accelerator_prod', '-t', '-A', '-c',
      "select refresh_token from oauth_token_vault where provider = 'ms_graph_hotmail' limit 1"], { encoding: 'utf8', timeout: 20000 }).trim();
    if (out) return out;
  } catch (e) {
    console.warn(`[FamilyPhotos] vault read failed (${e.message.split('\n')[0]}), using env token`);
  }
  return process.env.MS_GRAPH_REFRESH_TOKEN;
}

async function graphAccessToken() {
  const rt = vaultRefreshToken();
  if (!process.env.MS_GRAPH_CLIENT_ID || !rt) throw new Error('MS Graph not configured');
  const body = new URLSearchParams({ client_id: process.env.MS_GRAPH_CLIENT_ID, grant_type: 'refresh_token', refresh_token: rt, scope: 'Files.Read offline_access' });
  const t = await fetchJson('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  return t.access_token;
}

/** Camera-roll items modified since `sinceYmd` (newest first; stops paging once older). */
async function listCameraRoll(token, sinceYmd) {
  const H = { Authorization: `Bearer ${token}` };
  let url = `${GRAPH}/me/drive/special/cameraroll/children?$top=200&$orderby=lastModifiedDateTime desc&$select=id,name,file,photo,createdDateTime,lastModifiedDateTime,size&$expand=thumbnails`;
  const out = [];
  for (let page = 0; url && page < 20; page++) {
    const d = await fetchJson(url, { headers: H });
    out.push(...d.value);
    const oldest = d.value[d.value.length - 1];
    if (!oldest || String(oldest.lastModifiedDateTime).slice(0, 10) < sinceYmd) break;
    url = d['@odata.nextLink'];
  }
  return out;
}

async function downloadThumb(item) {
  const t = item.thumbnails && item.thumbnails[0];
  const u = t && (t.large || t.medium);
  if (!u) throw new Error(`no thumbnail for ${item.name}`);
  const r = await fetch(u.url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`thumbnail ${item.name} -> ${r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), width: u.width, height: u.height };
}

const LABEL_PROMPT = 'You sort a parent\'s phone photos for a private family newsletter. Reply with JSON only: '
  + '{"family": boolean, "kind": "people"|"medical"|"document"|"screenshot"|"object"|"scenery"|"other", "quality": 1-5, "caption": string}. '
  + '"family" is true only for a shareable memory whose main subject is people (children, family members, friends at an event), '
  + 'the kind of picture a family would happily put in a newsletter. '
  + 'It is false for anything taken as a record rather than a memory: close-ups of teeth, skin, rashes, injuries or any body part '
  + '(kind "medical"), receipts, checks, letters, forms, screens, screenshots, objects, food and empty scenery. When unsure, false. '
  + '"quality" rates focus, framing and faces visible. "caption" is at most 10 plain words describing the scene, '
  + 'never guessing anyone\'s name, no dashes.';

async function labelPhoto(buf) {
  const r = await fetchJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, max_tokens: 120,
      messages: [{ role: 'user', content: [{ type: 'text', text: LABEL_PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}`, detail: 'low' } }] }],
    }),
  });
  const j = JSON.parse(r.choices[0].message.content);
  return { family: j.family === true, kind: String(j.kind || 'other'), quality: Number(j.quality) || 0, caption: String(j.caption || '').replace(/[–—]/g, ' ').slice(0, 90) };
}

/**
 * Today's photos, ready to embed: [{ id, name, takenAt, caption, cid, buf, width, height }].
 * Labels for newly seen photos are cached into the ledger and saved (labels are not "posts").
 */
async function compileFamilyPhotos({ today, ledgerPath = LEDGER_PATH } = {}) {
  const ledger = loadLedger(ledgerPath);
  const token = await graphAccessToken();
  const windowStart = laterOf(FEED_START, shiftDays(today, -WINDOW_DAYS));
  const all = (await listCameraRoll(token, windowStart)).filter((i) => isImage(i) && takenAt(i).slice(0, 10) >= windowStart);
  const items = all.filter((i) => !isBlocked(i, ledger)); // only these are ever labelled or newly picked

  let labelled = 0;
  for (const it of items) {
    if (ledger.labels[it.id]) continue;
    try {
      ledger.labels[it.id] = { ...(await labelPhoto((await downloadThumb(it)).buf)), name: it.name };
      labelled++;
    } catch (e) {
      console.warn(`[FamilyPhotos] could not label ${it.name}: ${e.message}`); // left unlabelled, retried next run
    }
  }
  if (labelled) saveLedger(ledger, ledgerPath);

  const { picks, reused } = choosePicks(all, ledger, today); // `all` so a same-day re-run can find today's posts
  const out = [];
  for (const p of picks) {
    try {
      const th = await downloadThumb(p);
      out.push({ id: p.id, name: p.name, takenAt: takenAt(p), caption: (ledger.labels[p.id] || {}).caption || '', cid: `photo-${p.id.replace(/[^A-Za-z0-9]/g, '')}@family`, ...th, _item: p });
    } catch (e) {
      console.warn(`[FamilyPhotos] skipped ${p.name}: ${e.message}`);
    }
  }
  console.log(`[FamilyPhotos] candidates ${items.length}, newly labelled ${labelled}, picked ${out.length}${reused ? ' (same-day reuse)' : ''}`);
  return { photos: out, ledger, ledgerPath, today };
}

/** Call only after the email was accepted. */
function commitPicks(feed) {
  if (!feed || !feed.photos.length) return;
  const fresh = feed.photos.filter((p) => !(feed.ledger.posted[p.id] && feed.ledger.posted[p.id].postedOn === feed.today));
  if (!fresh.length) return;
  markPosted(feed.ledger, fresh.map((p) => p._item), feed.today);
  saveLedger(feed.ledger, feed.ledgerPath);
  console.log(`[FamilyPhotos] ledger: ${fresh.length} photo(s) marked posted on ${feed.today}`);
}

module.exports = {
  compileFamilyPhotos, commitPicks, vaultRefreshToken,
  // exported for tests
  takenAt, isBlocked, groupMoments, choosePicks, markPosted, loadLedger, saveLedger, emptyLedger, MAX_PER_DAY, FEED_START,
};
