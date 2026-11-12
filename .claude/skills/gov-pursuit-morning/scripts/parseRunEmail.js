// Turns the 7:30 CT "Gov pursuit morning" email into run.json.
//
//   node parseRunEmail.js <email-plaintext-file> <out-run.json>
//
// The email is the ONLY place the Bonfire download links exist (the pipeline API
// knows the bid but not which portal tenant it came from), which is why this
// parses the email rather than reading state from the API alone.
//
// Most links are wrapped in track.colaberry.com, whose `p=` query param is
// base64url JSON holding the real destination. Those are decoded here; a few
// links arrive unwrapped and are used as-is.
const fs = require('fs');

const SRC = process.argv[2], OUT = process.argv[3];
if (!SRC || !OUT) { console.error('usage: parseRunEmail.js <email.txt> <run.json>'); process.exit(2); }
const body = fs.readFileSync(SRC, 'utf8');

function realUrl(u) {
  if (!u) return null;
  if (!/track\.colaberry\.com/.test(u)) return u;
  const m = u.match(/[?&]p=([A-Za-z0-9_\-=]+)/);
  if (!m) return u;
  try {
    const outer = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const inner = typeof outer.p === 'string' ? JSON.parse(outer.p) : outer.p;
    return (inner && inner.url) ? inner.url : u;
  } catch (_) { return u; }
}

// The plaintext wraps hard, so rejoin into one stream and split on the section emoji.
const flat = body.replace(/\r/g, '');
const grab = (startRe, endRe) => {
  const s = flat.search(startRe);
  if (s === -1) return '';
  const rest = flat.slice(s);
  const e = endRe ? rest.slice(1).search(endRe) : -1;
  return e === -1 ? rest : rest.slice(0, e + 1);
};

const zipSection = grab(/\u{1F4E6} Upload the ZIP/u, /AI verdicts and fit scores/);
const readSection = grab(/\u{1F440} Needs your read/u, /\u{1F4E6} Upload the ZIP/u);

// Each bid block starts with its emoji marker. The FIRST piece after splitting is
// the section's own heading ("Upload the ZIP", "Needs your read"), not a bid, so
// it is dropped by position. Everything after it must parse, which keeps the
// "dropped a bid" gate below meaningful instead of always firing on the header.
function blocks(section, marker) {
  return section.split(marker).slice(2);
}

function uuidFrom(text) {
  // the Gov Opps link carries gws=gws%3A<uuid> (or gws:<uuid> once decoded)
  const m = text.match(/gws(?:%3A|:|%3a)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}
function bonfireFrom(text) {
  const urls = text.match(/https?:\/\/[^\s<>]+/g) || [];
  for (const u of urls) {
    const r = realUrl(u);
    const m = r && r.match(/https:\/\/([a-z0-9-]+)\.bonfirehub\.com\/opportunities\/(\d+)/i);
    if (m) return { tenant: m[1], opp: m[2] };
  }
  return { tenant: null, opp: null };
}
function gwsFrom(text) {
  const urls = text.match(/https?:\/\/[^\s<>]+/g) || [];
  for (const u of urls) {
    const r = realUrl(u);
    const id = uuidFrom(r || '');
    if (id) return 'gws:' + id;
  }
  return uuidFrom(text) ? 'gws:' + uuidFrom(text) : null;
}

function parseBlock(b, n) {
  const lines = b.split('\n').map(s => s.trim());
  // title runs until the agency line; agency line looks like "Name (tenantslug)"
  let title = [], agency = null, i = 0;
  for (; i < lines.length; i++) {
    const L = lines[i];
    if (!L) { if (title.length) continue; else continue; }
    if (/^[A-Z].*\([a-z0-9-]+\)\s*$/.test(L) && title.length) { agency = L; i++; break; }
    if (/^Fit \d+/.test(L) || /^\d+\. Download/.test(L)) break;
    title.push(L);
  }
  const fitM = b.match(/Fit (\d+)/);
  const capM = b.match(/(\d+)% capability match/);
  const dayM = b.match(/(\d+) days? left/);
  const bf = bonfireFrom(b);
  return {
    n,
    title: title.join(' ').replace(/\s+/g, ' ').trim(),
    agency: agency ? agency.replace(/\s*\([a-z0-9-]+\)\s*$/, '').trim() : null,
    tenant: bf.tenant, opp: bf.opp,
    gws: gwsFrom(b),
    fit: fitM ? Number(fitM[1]) : null,
    cap: capM ? Number(capM[1]) : null,
    days: dayM ? Number(dayM[1]) : null,
  };
}

const zips = blocks(zipSection, /\u{1F4E6} /u).map((b, i) => parseBlock(b, i + 1));
const reads = blocks(readSection, /\u{1F440} /u).map((b, i) => parseBlock(b, i + 1));

const run = {
  runDate: new Date().toISOString().slice(0, 10),
  source: SRC,
  zipsToUpload: zips.filter(z => z.gws),
  toRead: reads.filter(r => r.gws),
};

// Gates: a bid with no gws key or no Bonfire link cannot be worked, so say so
// loudly rather than writing a run file that silently drops it.
const droppedZips = zips.length - run.zipsToUpload.length;
const droppedReads = reads.length - run.toRead.length;
const noBonfire = run.zipsToUpload.filter(z => !z.tenant);

console.log('parsed  ZIPs to upload: ' + run.zipsToUpload.length + (droppedZips ? ('  (DROPPED ' + droppedZips + ' with no gws key)') : ''));
console.log('parsed  to read       : ' + run.toRead.length + (droppedReads ? ('  (DROPPED ' + droppedReads + ' with no gws key)') : ''));
if (noBonfire.length) console.log('WARNING: ' + noBonfire.length + ' ZIP bid(s) have no Bonfire link: ' + noBonfire.map(z => z.title.slice(0, 40)).join(' | '));

fs.writeFileSync(OUT, JSON.stringify(run, null, 2));
console.log('wrote ' + OUT);
if (droppedZips || droppedReads) process.exitCode = 1;
