// Records Ali's pass / hold decisions on the "to read" bids.
//
//   node recordDecisions.js <decisions.json> <tokenFile> [--go]
//
// decisions.json is an ARRAY, one entry per bid Ali decided:
//   [{ "gws": "gws:...", "title": "...", "agency": "...",
//      "decision": "no_bid" | "needs_evidence" | "pending_review",
//      "rationale": "why, in Ali's words" }]
//
// Dry run by default. Every bid gets its OWN rationale: the rationale is what a
// future reviewer reads to understand the call, so a blanket string is useless.
const fs = require('fs');
const API = 'https://enterprise.colaberry.ai';
const FALLBACK_ENTITY = 'colaberry';

const args = process.argv.slice(2);
const FILE = args[0], TOKFILE = args[1], GO = args.includes('--go');
if (!FILE || !TOKFILE) { console.error('usage: recordDecisions.js <decisions.json> <tokenFile> [--go]'); process.exit(2); }
const TOKEN = fs.readFileSync(TOKFILE, 'utf8').trim();
const ITEMS = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const H = { Authorization: 'Bearer ' + TOKEN };
const enc = (g) => encodeURIComponent(g);

const VALID = new Set(['no_bid', 'needs_evidence', 'pending_review']);
for (const it of ITEMS) {
  if (!it.gws || !VALID.has(it.decision)) {
    console.error('BAD ENTRY (needs gws + decision in ' + [...VALID].join('/') + '): ' + JSON.stringify(it).slice(0, 120));
    process.exit(2);
  }
  if (!it.rationale || it.rationale.length < 20) {
    console.error('REFUSING: ' + (it.title || it.gws) + ' has no real rationale. Write why, not just the verdict.');
    process.exit(2);
  }
}

async function getQual(gws) {
  const r = await fetch(API + '/api/admin/factory/qualification/' + enc(gws), { headers: H });
  if (!r.ok) return { httpError: r.status };
  return r.json();
}

(async () => {
  let ok = 0, fail = 0;
  for (const it of ITEMS) {
    process.stdout.write((it.title || it.gws).slice(0, 52).padEnd(56));
    const before = await getQual(it.gws);
    if (before.httpError) { console.log('SKIP  read HTTP ' + before.httpError); fail++; continue; }

    const existing = before.qualification;
    if (existing && existing.decision === it.decision) { console.log('SKIP  already ' + it.decision); ok++; continue; }

    if (!GO) { console.log('DRY   ' + (existing ? ('v' + existing.version + ' ' + existing.decision) : 'no record, would create') + ' -> ' + it.decision); ok++; continue; }

    if (!existing) {
      const cr = await fetch(API + '/api/admin/factory/qualification/' + enc(it.gws), {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H),
        body: JSON.stringify({ biddingEntity: FALLBACK_ENTITY, from: it.title, agency: it.agency }),
      });
      if (!cr.ok && cr.status !== 409) { console.log('FAIL  create HTTP ' + cr.status); fail++; continue; }
    }

    const mid = await getQual(it.gws);
    const q = mid.qualification || {};
    // Keyed by (opportunity, biddingEntity): use the entity ALREADY on the record.
    // A mismatch returns 404 "qualification not found", which reads like the record
    // is gone rather than like the key is wrong.
    const entity = q.bidding_entity || FALLBACK_ENTITY;
    const version = q.version || 1;

    const r = await fetch(API + '/api/admin/factory/qualification/' + enc(it.gws) + '/decision', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H),
      body: JSON.stringify({ biddingEntity: entity, expectedVersion: version, decision: it.decision, rationale: it.rationale }),
    });
    if (!r.ok) { console.log('FAIL  decision HTTP ' + r.status + ' ' + (await r.text()).slice(0, 140)); fail++; continue; }

    const after = await getQual(it.gws);
    const got = after.qualification && after.qualification.decision;
    const good = got === it.decision;
    console.log((good ? 'OK    ' : 'WARN  ') + 'decision=' + got + ' v' + (after.qualification && after.qualification.version));
    good ? ok++ : fail++;
  }
  console.log('');
  console.log('summary: ' + ok + ' ok, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
})();
