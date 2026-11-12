// Matches the ZIPs sitting in Downloads to the 14 bids in this morning's run.
// Matching is on a normalised title overlap, NOT on file order, and every file
// must land on exactly one bid or it is reported unmatched. Nothing is uploaded here.
const fs = require('fs');
const path = require('path');

const RUN = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DL = process.argv[3] || 'C:/Users/ali_m/Downloads';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the','and','for','of','in','a','an','to','rfp','rfq','rfi','pub','services','service','system','project','county','city']);
const toks = (s) => new Set(norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)));

// Only archives written in the last 4 hours, so older unrelated ZIPs cannot match.
const cutoff = Date.now() - 4 * 3600 * 1000;
const files = fs.readdirSync(DL)
  .filter(f => /\.zip$/i.test(f))
  .map(f => ({ f, p: path.join(DL, f), st: fs.statSync(path.join(DL, f)) }))
  .filter(x => x.st.mtimeMs >= cutoff);

function score(bidTitle, fileName) {
  const a = toks(bidTitle), b = toks(fileName);
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return a.size ? hit / a.size : 0;
}

const used = new Set();
const rows = [];
for (const bid of RUN.zipsToUpload) {
  let best = null, bestScore = 0, runnerUp = 0;
  for (const x of files) {
    if (used.has(x.f)) continue;
    const s = score(bid.title, x.f);
    if (s > bestScore) { runnerUp = bestScore; bestScore = s; best = x; }
    else if (s > runnerUp) runnerUp = s;
  }
  if (best && bestScore >= 0.5) {
    used.add(best.f);
    // verify it is really a zip
    const fd = fs.openSync(best.p, 'r');
    const head = Buffer.alloc(2); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
    rows.push({ bid, file: best, score: bestScore, margin: bestScore - runnerUp, isZip: head.toString('ascii') === 'PK' });
  } else {
    rows.push({ bid, file: null, score: bestScore, margin: 0, isZip: false });
  }
}

const unmatchedFiles = files.filter(x => !used.has(x.f));

console.log('MATCHED');
console.log('');
for (const r of rows.filter(r => r.file)) {
  const mb = (r.file.st.size / 1048576).toFixed(1);
  console.log('  #' + String(r.bid.n).padEnd(3) + String(r.bid.days + 'd').padStart(5) + '  ' + r.bid.title.slice(0, 62));
  console.log('        -> ' + r.file.f.slice(0, 72));
  console.log('           ' + mb + ' MB  zip=' + (r.isZip ? 'ok' : 'NOT A ZIP')
    + '  confidence=' + (r.score * 100).toFixed(0) + '%  margin=' + (r.margin * 100).toFixed(0) + 'pt');
}

const missing = rows.filter(r => !r.file);
if (missing.length) {
  console.log('');
  console.log('NOT DOWNLOADED (' + missing.length + ')');
  for (const r of missing) {
    console.log('  #' + String(r.bid.n).padEnd(3) + String(r.bid.days + 'd').padStart(5) + '  ' + r.bid.title);
    console.log('        https://' + r.bid.tenant + '.bonfirehub.com/opportunities/' + r.bid.opp);
  }
}
if (unmatchedFiles.length) {
  console.log('');
  console.log('ZIPS IN DOWNLOADS THAT MATCHED NO BID (' + unmatchedFiles.length + ')');
  for (const x of unmatchedFiles) console.log('  ' + x.f);
}

console.log('');
console.log('summary: ' + rows.filter(r => r.file).length + ' matched, ' + missing.length + ' missing, '
  + unmatchedFiles.length + ' unmatched files');
const bad = rows.filter(r => r.file && !r.isZip);
if (bad.length) { console.error('REFUSING: ' + bad.length + ' matched file(s) are not ZIP archives'); process.exit(1); }

fs.writeFileSync(path.join(path.dirname(process.argv[2]), 'matched.json'),
  JSON.stringify(rows.filter(r => r.file).map(r => ({
    n: r.bid.n, gws: r.bid.gws, title: r.bid.title, tenant: r.bid.tenant, opp: r.bid.opp,
    days: r.bid.days, file: r.file.p, size: r.file.st.size,
  })), null, 2));
console.log('wrote matched.json');
