/**
 * READ-ONLY probe of the CoreOps record's artifacts and published snapshot.
 * Writes nothing. Run inside the backend container.
 */
const path = require('path');
const { sequelize } = require(path.join(process.cwd(), 'dist/config/database'));

(async () => {
  const [rows] = await sequelize.query(`
    SELECT id, slug, title, status FROM case_studies WHERE slug = 'the-ai-proposes-a-verified-human-decides'
  `);
  if (!rows.length) { console.log('NO RECORD'); process.exit(0); }
  const cs = rows[0];
  console.log('RECORD', JSON.stringify(cs, null, 1));

  const [arts] = await sequelize.query(
    `SELECT id, artifact_type, title, status, visibility, source_type, public_url
       FROM case_study_artifacts WHERE case_study_id = :id ORDER BY created_at`,
    { replacements: { id: cs.id } },
  );
  console.log('\nARTIFACTS', arts.length);
  for (const a of arts) {
    console.log(` - ${a.artifact_type.padEnd(13)} ${a.status.padEnd(10)} ${a.visibility.padEnd(8)} ${a.source_type.padEnd(10)} ${a.title}`);
    console.log(`   ${a.id}  ${a.public_url}`);
  }

  const [snaps] = await sequelize.query(
    `SELECT id, status, created_at FROM case_study_snapshots
      WHERE case_study_id = :id ORDER BY created_at DESC LIMIT 4`,
    { replacements: { id: cs.id } },
  );
  console.log('\nSNAPSHOTS');
  for (const s of snaps) console.log(` - ${s.status.padEnd(10)} ${s.id} ${s.created_at}`);

  const [pubs] = await sequelize.query(
    `SELECT id, snapshot_id, surface_key, status, published_at FROM case_study_publications
      WHERE case_study_id = :id ORDER BY created_at DESC LIMIT 4`,
    { replacements: { id: cs.id } },
  );
  console.log('\nPUBLICATIONS');
  for (const p of pubs) console.log(` - ${p.surface_key} ${p.status} snapshot=${p.snapshot_id} at=${p.published_at}`);

  // What the published snapshot actually carries for artifacts + cover.
  if (pubs.length) {
    const [[snap]] = await sequelize.query(
      `SELECT content FROM case_study_snapshots WHERE id = :sid`,
      { replacements: { sid: pubs[0].snapshot_id } },
    );
    const c = typeof snap.content === 'string' ? JSON.parse(snap.content) : snap.content;
    console.log('\nPUBLISHED SNAPSHOT');
    console.log(' identity.heroImageUrl:', c.identity && c.identity.heroImageUrl);
    console.log(' artifacts:', JSON.stringify((c.artifacts || []).map((a) => ({
      type: a.artifactType, status: a.status, title: a.title, url: a.publicUrl,
    })), null, 1));
    console.log(' section keys:', Object.keys(c).join(', '));
  }
  await sequelize.close();
})().catch((e) => { console.error('PROBE_FAILED', e && e.message); process.exit(1); });
