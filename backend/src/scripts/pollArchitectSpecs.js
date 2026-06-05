#!/usr/bin/env node
// Poll the 4 architect specs every 60s until all complete, then
// download each generated document to tmp/architect-specs/.

const path = require('path');
const fs = require('fs');
const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const ARCHITECT = 'https://advisor.colaberry.ai';
const JOBS_FILE = path.resolve(__dirname, '../../../tmp/architect-jobs.json');
const OUT_DIR = path.resolve(__dirname, '../../../tmp/architect-specs');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TIMEOUT_MS = 50 * 60 * 1000;
const POLL_MS = 60 * 1000;

(async () => {
  const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  const start = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    let allDone = true;
    for (const j of jobs) {
      if (j.completed_at) continue;
      try {
        const r = await axios.get(`${ARCHITECT}${j.poll_url}`, { timeout: 30000 });
        const data = r.data;
        const phase = data.phase || data.status;
        const pct = data.percent ?? '?';
        console.log(`[${new Date().toISOString().substring(11, 19)}] ${j.intern.padEnd(10)} ${j.rfp ? 'rfp' + j.rfp : ''} -> ${phase} (${pct}%)`);
        if (phase === 'complete' || data.status === 'complete') {
          // Download the doc
          const dl = await axios.get(`${ARCHITECT}${j.download_url}`, { responseType: 'arraybuffer', timeout: 60000 });
          const outFile = path.join(OUT_DIR, `${j.job_id}.docx`);
          fs.writeFileSync(outFile, Buffer.from(dl.data));
          j.completed_at = new Date().toISOString();
          j.spec_file = outFile;
          console.log(`  -> downloaded ${(dl.data.byteLength / 1024).toFixed(0)} KB to ${outFile}`);
        } else {
          allDone = false;
        }
      } catch (e) {
        console.warn(`  poll error for ${j.intern}: ${e.response?.status || e.message}`);
        allDone = false;
      }
    }
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
    if (allDone) { console.log('\nAll 4 specs complete.'); break; }
    await new Promise(r => setTimeout(r, POLL_MS));
  }

  console.log('\nFinal state:');
  for (const j of jobs) {
    console.log(`  ${j.intern}: ${j.completed_at ? 'DONE ' + (j.spec_file || '') : 'TIMEOUT'}`);
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
