// Checks the run against the LIVE pipeline, not against this session's own logs.
//
//   node verifyRun.js <run.json> <tokenFile>
//
// A run is only finished when the server agrees: every ZIP bid shows
// zipAttested, and every "to read" bid carries a decision. Exits non-zero
// otherwise, so a half-finished run cannot be reported as clean.
const fs = require('fs');
const API = 'https://enterprise.colaberry.ai';

const RUNFILE = process.argv[2], TOKFILE = process.argv[3];
if (!RUNFILE || !TOKFILE) { console.error('usage: verifyRun.js <run.json> <tokenFile>'); process.exit(2); }
const TOKEN = fs.readFileSync(TOKFILE, 'utf8').trim();
const RUN = JSON.parse(fs.readFileSync(RUNFILE, 'utf8'));

(async () => {
  const r = await fetch(API + '/api/admin/factory/qualification-pipeline', { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (!r.ok) { console.error('pipeline HTTP ' + r.status); process.exit(1); }
  const body = await r.json();
  const rows = body.pipeline || body.items || (Array.isArray(body) ? body : []);
  if (!rows.length) { console.error('pipeline returned no rows; refusing to call this verified'); process.exit(1); }

  // Rows are keyed on `key`. Getting this field name wrong makes every lookup
  // miss and reports a finished run as 0/N, which looks like total failure.
  const by = {};
  for (const row of rows) by[row.key] = row;
  if (!Object.keys(by).some(k => /^gws:/.test(k))) {
    console.error('no gws keys found on pipeline rows: the row shape changed, fix the lookup before trusting this');
    process.exit(1);
  }

  let zipOk = 0; const zipBad = [];
  for (const b of RUN.zipsToUpload || []) {
    const row = by[b.gws];
    if (row && row.zipAttested) zipOk++;
    else zipBad.push('#' + b.n + ' ' + (row ? 'attested=' + row.zipAttested : 'ABSENT from pipeline'));
  }
  let readOk = 0; const readBad = [];
  for (const b of RUN.toRead || []) {
    const row = by[b.gws];
    const decided = row && row.decision && row.decision !== 'pending_review' && row.decision !== 'needs_evidence';
    if (decided) readOk++;
    else readBad.push('#' + b.n + ' ' + (row ? row.decision : 'ABSENT from pipeline'));
  }

  const nz = (RUN.zipsToUpload || []).length, nr = (RUN.toRead || []).length;
  console.log('ZIPs attested           : ' + zipOk + '/' + nz);
  zipBad.forEach(x => console.log('   ' + x));
  console.log('To-read decided         : ' + readOk + '/' + nr);
  readBad.forEach(x => console.log('   ' + x));

  const stages = {}; for (const row of rows) stages[row.stage] = (stages[row.stage] || 0) + 1;
  const ents = {}; for (const row of rows) ents[row.biddingEntity] = (ents[row.biddingEntity] || 0) + 1;
  console.log('');
  console.log('pipeline by stage       : ' + JSON.stringify(stages));
  console.log('bidding entities        : ' + JSON.stringify(ents));
  if (Object.keys(ents).length > 1) {
    console.log('NOTE: more than one bidding entity is in play. New records must use the');
    console.log('      entity the rest of the pipeline already uses, or the board splits.');
  }

  const clean = zipOk === nz && readOk === nr;
  console.log('');
  console.log(clean ? 'RUN CLEAN: both queues are at zero.' : 'RUN NOT CLEAN: see the lines above.');
  if (!clean) process.exitCode = 1;
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
