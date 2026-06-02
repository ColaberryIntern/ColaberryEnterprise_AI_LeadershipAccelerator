#!/usr/bin/env node
// Attach a file to a sales-rep account's BC ticket via the per-account Vault
// folder + index comment. Idempotent: re-runs with same filename are no-ops.
//
// Usage:
//   node cbAttachToAccount.js --account "coca-cola-consolidated" --file path/to/x.pdf [--kind transcript|email|attachment|doc] [--label "Free-text label"] [--replace]
//   node cbAttachToAccount.js --account "Coca-Cola" --file ... (account name match also works)
//   node cbAttachToAccount.js --account ... --file ... --file ... (multiple --file flags ok)
//   node cbAttachToAccount.js --account ... --dir tmp/coca-cola-archive (uploads every file in dir)
//
// Exit code 0 on success. Stdout: JSON summary.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { resolveAccount, uploadToAccount, rebuildIndexFromVault, prettifyFilename, guessKindFromFilename } = require(path.resolve(__dirname, './lib/cbAccountContext'));

// Derive a human-readable label from a file. For email-thread txt files
// produced by cbPullGmailForAccount.js we read the first line ("Thread: <subj>")
// and pair it with a date if it's in the filename. For attachment files
// (PDF/HTML/etc) we parse `<date>-<email-slug>__<attachment-slug>.<ext>` and
// build "Attachment: <pretty-name> (from <date> email)".
function humanLabelForFile(filePath, kind) {
  const filename = path.basename(filePath);
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  const date = dateMatch ? dateMatch[1] : null;
  const ext = path.extname(filename).toLowerCase();
  const stem = filename.slice(0, -ext.length || undefined);

  // Attachment file (has "__" separator between email-slug and attachment-slug)
  if (stem.includes('__')) {
    const after = stem.split('__').slice(1).join('__');
    const pretty = after.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `${pretty}${ext.toUpperCase().replace('.', ' (')}${ext ? ')' : ''}${date ? ` - from ${date} email` : ''}`;
  }

  // Email thread file (.txt): read the "Thread: <subject>" line
  if (ext === '.txt' && kind === 'email') {
    try {
      const head = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 3).join('\n');
      const m = head.match(/^Thread:\s*(.+)$/m);
      if (m) {
        const subj = m[1].replace(/^Re:\s*/i, '').replace(/^Fwd:\s*/i, '').trim();
        return `Email thread: ${subj}${date ? ` (${date})` : ''}`;
      }
    } catch {}
  }

  // Fallback: prettify the slug
  const pretty = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${pretty}${ext ? ` (${ext.slice(1).toUpperCase()})` : ''}${date ? ` - ${date}` : ''}`;
}

function parseArgs(argv) {
  const out = { files: [], kind: 'doc' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--account') out.account = argv[++i];
    else if (a === '--file') out.files.push(argv[++i]);
    else if (a === '--dir') out.dir = argv[++i];
    else if (a === '--kind') out.kind = argv[++i];
    else if (a === '--label') out.label = argv[++i];
    else if (a === '--replace') out.replace = true;
    else if (a === '--description') out.description = argv[++i];
  }
  if (!out.account) throw new Error('--account required');
  if (out.dir) {
    if (!fs.existsSync(out.dir) || !fs.statSync(out.dir).isDirectory()) throw new Error(`--dir ${out.dir} not found`);
    for (const f of fs.readdirSync(out.dir)) {
      const fp = path.join(out.dir, f);
      if (fs.statSync(fp).isFile()) out.files.push(fp);
    }
  }
  if (!out.files.length) throw new Error('at least one --file or --dir required');
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  const account = resolveAccount(args.account);
  console.log(`[cb-attach] account: ${account.displayName} (slug=${account.slug}, ticket=${account.ticketId})`);

  const results = [];
  // Map local file paths by filename so we can look up the source file when
  // building labels (we read the "Thread:" header out of email .txt files).
  const localByFilename = {};
  for (const filePath of args.files) {
    localByFilename[path.basename(filePath)] = filePath;
    try {
      const r = await uploadToAccount(account, {
        filePath, kind: args.kind, description: args.description, allowReplace: args.replace,
      });
      results.push({ file: filePath, ...r });
      console.log(`  ${r.deduped ? 'DEDUP' : 'UP'} ${r.filename} -> ${r.vaultUrl}`);
    } catch (e) {
      console.error(`  FAIL ${filePath}: ${e.message}`);
      results.push({ file: filePath, error: e.message });
    }
  }

  // Rebuild the index from the Vault folder so the labels reflect every file
  // currently in the folder - not just the files this CLI run uploaded.
  const labelForUpload = ({ filename, kind }) => {
    if (args.label && Object.keys(localByFilename).length === 1) return args.label;
    const local = localByFilename[filename];
    if (local && kind === 'email' && /\.txt$/i.test(filename)) {
      try {
        const head = fs.readFileSync(local, 'utf8').split('\n').slice(0, 3).join('\n');
        const m = head.match(/^Thread:\s*(.+)$/m);
        if (m) {
          const subj = m[1].replace(/^Re:\s*/i, '').replace(/^Fwd:\s*/i, '').trim();
          const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
          return `${subj}${dateMatch ? ` (${dateMatch[1]})` : ''}`;
        }
      } catch {}
    }
    return prettifyFilename(filename);
  };

  const idx = await rebuildIndexFromVault(account, labelForUpload);
  console.log(`[cb-attach] index comment ${idx.action}: ${idx.commentUrl} (${idx.totalEntries} total entries)`);

  console.log('');
  console.log(JSON.stringify({ account: account.slug, results }, null, 2));
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
