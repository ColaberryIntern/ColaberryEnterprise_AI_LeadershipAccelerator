#!/usr/bin/env node
/**
 * Upload the 17 launch briefs to the project Vault folder "Launch Briefs",
 * then write the {slug -> uploadUrl} map to
 *   tmp/launch-briefs-vault-urls.json
 * so generateLaunchTasks.js can read it and reference URLs in todo descriptions.
 *
 * Idempotent: re-running re-uses existing uploads (no duplicates).
 *
 * Run: node backend/src/scripts/uploadLaunchBriefs.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');

const BRIEFS_DIR = path.resolve(__dirname, '../../../docs/training-program-2026-q3/launch-briefs');
const OUT_PATH = path.resolve(__dirname, '../../../tmp/launch-briefs-vault-urls.json');

(async () => {
  console.log('Creating Vault sub-folder "Launch Briefs"...');
  const folder = await ops.createVaultFolder({ title: 'Launch Briefs' });
  console.log(`  folder id=${folder.id} url=${folder.app_url}`);

  const files = fs.readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.md')).sort();
  console.log(`Found ${files.length} briefs to upload.`);
  const map = {
    folder: { id: folder.id, url: folder.app_url, title: folder.title },
    briefs: {},
  };
  for (const f of files) {
    const content = fs.readFileSync(path.join(BRIEFS_DIR, f), 'utf8');
    const description = (content.match(/^# (.+)$/m) || [])[1] || f;
    try {
      const upload = await ops.uploadToVault({
        vaultId: folder.id,
        filename: f,
        content,
        description,
      });
      console.log(`  + ${f} id=${upload.id} ${upload.app_url}`);
      const slug = f.replace(/^\d+-/, '').replace(/\.md$/, '');
      map.briefs[slug] = {
        filename: f,
        slug,
        id: upload.id,
        url: upload.app_url,
        attachable_sgid: upload.attachable_sgid || null,
        description,
      };
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error(`  FAIL ${f}: ${e.message}`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(map, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Vault folder: ${folder.app_url}`);
  console.log(`Briefs uploaded: ${Object.keys(map.briefs).length}/${files.length}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
