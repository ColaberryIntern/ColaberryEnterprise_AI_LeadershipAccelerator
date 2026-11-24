// Uploads each matched solicitation ZIP to its gov qualification workspace.
//
//   node upload.js <matched.json> <tokenFile> [--only N] [--go]
//
// Dry run by default: it prints what it WOULD send and checks current state.
// --only N restricts to one bid (use this to probe before a batch).
// --go actually uploads.
//
// Two calls per bid, which is what the product's own flow does:
//   1. POST .../attest-zip            records the evidence attestation + dossier
//   2. POST .../extract-requirements  enqueues the AI extraction (the next-level vetting)
// Each bid is verified afterwards by re-reading the qualification, never by
// trusting the POST status alone.
const fs = require('fs');

const API = 'https://enterprise.colaberry.ai';
const BIDDING_ENTITY = 'colaberry';   // the convention the rest of the system uses; 'Colaberry Inc.' splits the pipeline

const args = process.argv.slice(2);
const MATCHED = args[0];
const TOKFILE = args[1];
const GO = args.includes('--go');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx !== -1 ? Number(args[onlyIdx + 1]) : null;

if (!MATCHED || !TOKFILE) { console.error('usage: upload.js <matched.json> <tokenFile> [--only N] [--go]'); process.exit(2); }
const TOKEN = fs.readFileSync(TOKFILE, 'utf8').trim();
let rows = JSON.parse(fs.readFileSync(MATCHED, 'utf8'));
if (ONLY !== null) rows = rows.filter(r => r.n === ONLY);
if (!rows.length) { console.error('no bids selected'); process.exit(2); }

const enc = (gws) => encodeURIComponent(gws);
const H = { Authorization: 'Bearer ' + TOKEN };

async function getQual(gws) {
  const r = await fetch(API + '/api/admin/factory/qualification/' + enc(gws), { headers: H });
  if (!r.ok) return { httpError: r.status };
  return r.json();
}

async function postForm(url, form) {
  const r = await fetch(url, { method: 'POST', headers: H, body: form });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, ok: r.ok, json, text: text.slice(0, 300) };
}

function formFor(row, extra) {
  const buf = fs.readFileSync(row.file);
  const fd = new FormData();
  fd.set('document', new Blob([buf], { type: 'application/zip' }), require('path').basename(row.file));
  for (const [k, v] of Object.entries(extra)) fd.set(k, String(v));
  return fd;
}

(async () => {
  const results = [];
  for (const row of rows) {
    const label = '#' + row.n + ' ' + row.title.slice(0, 52);
    process.stdout.write(label.padEnd(60));

    const before = await getQual(row.gws);
    if (before.httpError) { console.log('SKIP  cannot read state (HTTP ' + before.httpError + ')'); results.push({ row, ok: false, why: 'read ' + before.httpError }); continue; }

    const already = before.zipAttestation && before.zipAttestation !== null;
    const version = (before.qualification && before.qualification.version) || 0;

    if (already) { console.log('SKIP  already attested'); results.push({ row, ok: true, why: 'already attested' }); continue; }

    if (!GO) {
      console.log('DRY   state=' + (before.sourceState || '?') + '  version=' + version
        + '  -> would attest + extract (' + (row.size / 1048576).toFixed(1) + ' MB)');
      results.push({ row, ok: true, why: 'dry' });
      continue;
    }

    // 0. The qualification record must EXIST before attest-zip (otherwise 404
    //    "qualification not found"). On the decoupled gws path this creates a
    //    pending_review record bound to no source snapshot: the ZIP is the evidence.
    let createdNow = false;
    if (!before.qualification) {
      const cr = await fetch(API + '/api/admin/factory/qualification/' + enc(row.gws), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, H),
        body: JSON.stringify({ biddingEntity: BIDDING_ENTITY, from: row.title, agency: row.agency || undefined }),
      });
      if (!cr.ok && cr.status !== 409) {
        const t = (await cr.text()).slice(0, 200);
        console.log('FAIL  create HTTP ' + cr.status + '  ' + t);
        results.push({ row, ok: false, why: 'create ' + cr.status + ' ' + t });
        continue;
      }
      createdNow = true;
    }

    // re-read so expectedVersion matches what the server now holds
    const mid = await getQual(row.gws);
    const v = (mid.qualification && mid.qualification.version) || 1;

    // 1. attest-zip. expectedVersion is the optimistic-concurrency guard.
    let attest = await postForm(API + '/api/admin/factory/qualification/' + enc(row.gws) + '/attest-zip',
      formFor(row, { biddingEntity: BIDDING_ENTITY, expectedVersion: v, mode: 'add' }));
    if (!attest.ok && attest.json && /version/i.test(JSON.stringify(attest.json))) {
      const fresh = await getQual(row.gws);
      const v2 = (fresh.qualification && fresh.qualification.version) || 1;
      attest = await postForm(API + '/api/admin/factory/qualification/' + enc(row.gws) + '/attest-zip',
        formFor(row, { biddingEntity: BIDDING_ENTITY, expectedVersion: v2, mode: 'add' }));
    }
    if (!attest.ok) { console.log('FAIL  attest HTTP ' + attest.status + '  ' + attest.text); results.push({ row, ok: false, why: 'attest ' + attest.status + ' ' + attest.text }); continue; }

    // 2. extract-requirements: enqueues the AI pass. Non-fatal if it refuses;
    //    the attestation is the gate and is already recorded.
    const extract = await postForm(API + '/api/admin/factory/qualification/' + enc(row.gws) + '/extract-requirements',
      formFor(row, {}));

    // 3. verify by re-reading, not by trusting the POST
    const after = await getQual(row.gws);
    const attested = !!(after && after.zipAttestation);
    const bundle = attest.json && attest.json.sourceBundle;
    console.log((attested ? 'OK    ' : 'WARN  ') + (createdNow?'created ':'')
      + 'attest=' + attest.status
      + '  extract=' + extract.status + (extract.json && extract.json.jobId ? ' job=' + String(extract.json.jobId).slice(0, 8) : '')
      + '  stored=' + (bundle ? bundle.stored : '?')
      + '  verified=' + attested);
    results.push({ row, ok: attested, why: attested ? 'ok' : 'attestation not visible on re-read' });
  }

  console.log('');
  const good = results.filter(r => r.ok).length;
  console.log('summary: ' + good + '/' + results.length + ' ok');
  const bad = results.filter(r => !r.ok);
  if (bad.length) { for (const b of bad) console.log('  FAILED #' + b.row.n + ': ' + b.why); process.exitCode = 1; }
})();
