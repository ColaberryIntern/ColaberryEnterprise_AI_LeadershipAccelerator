#!/usr/bin/env node
// One-time cleanup: trash an account's Vault subfolder + its uploads + the
// [CB Account Context Index] comment on its ticket. Used to undo the
// folder-based approach in favor of per-thread comments.
//
// Keeps the parent "CB Context Dossiers" folder and any synthesized dossier
// PDFs (they live one level up, not inside the per-account subfolder).
//
// Usage:  node cbTeardownAccountVault.js --account coca-cola-consolidated [--dry]
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { resolveAccount, ensureAccountFolder, listFolderUploads, bcGet } = require(path.resolve(__dirname, './lib/cbAccountContext'));

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--account') out.account = argv[++i];
    else if (a === '--dry') out.dry = true;
  }
  if (!out.account) throw new Error('--account required');
  return out;
}

async function trash(bucketId, recordingId) {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  const r = await fetch(`https://3.basecampapi.com/3945211/buckets/${bucketId}/recordings/${recordingId}/status/trashed.json`, {
    method: 'PUT', headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
  });
  if (!r.ok && r.status !== 204) throw new Error(`trash ${recordingId} -> ${r.status}: ${await r.text()}`);
}

(async () => {
  const args = parseArgs(process.argv);
  const account = resolveAccount(args.account);
  const { folderId, folderUrl } = await ensureAccountFolder(account);
  console.log(`[teardown] account: ${account.displayName} folder: ${folderUrl}`);

  // Trash uploads inside the folder
  const uploads = await listFolderUploads({ bucketId: account.bucketId, folderId });
  console.log(`[teardown] uploads in folder: ${uploads.length}`);

  // Find the index comment on the ticket
  const comments = await bcGet(`/buckets/${account.bucketId}/recordings/${account.ticketId}/comments.json`);
  const indexComment = (comments || []).find((c) => (c.content || '').includes('CB Account Context Index'));
  if (indexComment) console.log(`[teardown] index comment to trash: ${indexComment.id}`);

  if (args.dry) {
    console.log('[teardown] --dry: not deleting');
    return;
  }

  for (const u of uploads) {
    try { await trash(account.bucketId, u.id); console.log(`  trashed upload ${u.id} (${u.title})`); }
    catch (e) { console.error(`  FAIL ${u.id}: ${e.message}`); }
  }
  if (indexComment) {
    try { await trash(account.bucketId, indexComment.id); console.log(`  trashed index comment ${indexComment.id}`); }
    catch (e) { console.error(`  FAIL index comment: ${e.message}`); }
  }
  // Trash the folder itself
  try { await trash(account.bucketId, folderId); console.log(`  trashed folder ${folderId}`); }
  catch (e) { console.error(`  FAIL folder ${folderId}: ${e.message}`); }
  console.log('[teardown] done.');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
