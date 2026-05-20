/**
 * triggerAcceleratorSyncFileTree — fire syncFileTree for the Accelerator
 * enrollment so the new route_component_bindings_json column gets populated.
 *
 * 2026-05-20: one-shot. After the Phase 0 deploy, prod's
 * route_component_bindings_json is null on every connection because the
 * column was just added; syncFileTree now persists it but needs to run.
 *
 * Run inside the prod container (where compiled output is at /app/dist):
 *   docker cp <this-file> accelerator-backend:/tmp/triggerSync.js
 *   docker exec -w /app accelerator-backend node /tmp/triggerSync.js
 */

const ACCELERATOR_ENROLLMENT_ID = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';

(async () => {
  try {
    const { syncFileTree } = require('/app/dist/services/githubService');
    const result = await syncFileTree(ACCELERATOR_ENROLLMENT_ID);
    console.log('syncFileTree complete:', result);
    process.exit(0);
  } catch (err) {
    console.error('syncFileTree failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
