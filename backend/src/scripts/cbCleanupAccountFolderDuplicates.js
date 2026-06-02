#!/usr/bin/env node
// Delete duplicate uploads in an account's Vault folder, keeping the OLDEST
// of each filename. Use after the broken-dedup uploads from before
// the pagination fix.
//
// Usage:
//   node cbCleanupAccountFolderDuplicates.js --account coca-cola-consolidated [--dry]
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

async function bcDelete(p) {
  const r = await fetch(`https://3.basecampapi.com/3945211${p}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${(process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i,'').trim()}`, Accept: 'application/json' },
  });
  if (!r.ok && r.status !== 204) throw new Error(`DELETE ${p} -> ${r.status}: ${await r.text()}`);
}

(async () => {
  const args = parseArgs(process.argv);
  const account = resolveAccount(args.account);
  const { folderId, folderUrl } = await ensureAccountFolder(account);
  console.log(`[cleanup] account: ${account.displayName} folder: ${folderUrl}`);

  const all = await listFolderUploads({ bucketId: account.bucketId, folderId });
  console.log(`[cleanup] total uploads in folder: ${all.length}`);

  const byName = {};
  for (const u of all) (byName[u.title || u.filename] = byName[u.title || u.filename] || []).push(u);

  const toDelete = [];
  for (const [name, list] of Object.entries(byName)) {
    if (list.length <= 1) continue;
    // Sort by created_at ascending, keep first (oldest), delete the rest
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const keep = list[0];
    const drop = list.slice(1);
    console.log(`  KEEP ${keep.id} (${keep.created_at}) | DROP ${drop.length} of ${name}`);
    toDelete.push(...drop);
  }
  console.log(`[cleanup] total to delete: ${toDelete.length}`);

  if (args.dry) {
    console.log('[cleanup] --dry: not deleting');
    return;
  }

  for (const u of toDelete) {
    try {
      // Basecamp uses /recordings/<id>/status/trashed.json (PUT) to trash. There's
      // no hard delete in the public API for uploads. We move to trash.
      const r = await fetch(`https://3.basecampapi.com/3945211/buckets/${account.bucketId}/recordings/${u.id}/status/trashed.json`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${(process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i,'').trim()}`, Accept: 'application/json' },
      });
      if (!r.ok && r.status !== 204) throw new Error(`trash ${u.id} -> ${r.status}: ${await r.text()}`);
      console.log(`  trashed ${u.id} (${u.title})`);
    } catch (e) {
      console.error(`  FAIL ${u.id}: ${e.message}`);
    }
  }
  console.log('[cleanup] done. Now re-run cbAttachToAccount to rebuild the index comment.');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
