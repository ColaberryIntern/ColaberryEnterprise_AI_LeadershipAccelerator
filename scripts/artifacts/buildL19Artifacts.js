/**
 * Build DOC 19, the state matrix.
 *
 * CHECK BEFORE WRITE. The checks are about the DATA and about files on disk - that every state
 * the machine can hold has a treatment, and that every named test really exists - so a matrix
 * describing behaviour nobody tests must fail rather than reach the repository looking finished.
 *
 *   node scripts/artifacts/buildL19Artifacts.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function main() {
  const D = require('./tickets/l19StateMatrixData');
  const doc = require('./tickets/l19StateMatrixDocument');

  const T = doc.selfCheck();
  console.log(`self-check passed: ${T.states} editorial states read from the machine, `
    + `${T.cells} cells decided, ${T.moments.length} distinct moments (${T.moments.join(', ')}), `
    + `${T.conditions} non-state conditions, every row's named test found on disk`);

  const abs = path.join(ROOT, D.META.file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const md = doc.markdown();
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (md !== before) {
    fs.writeFileSync(abs, md, 'utf8');
    console.log(`${D.META.file}: ${md.split('\n').length} lines written`);
  } else {
    console.log(`${D.META.file}: already current`);
  }
}

try { main(); } catch (err) { console.error(err.message); process.exit(1); }
