/**
 * Print every placement contract where CCPP and PaySimple disagree. Read-only: it changes nothing in
 * either system and sends nothing, so it is safe to run any number of times.
 *
 * Usage, inside the production container:
 *   node dist/scripts/reportContractDrift.js
 *   node dist/scripts/reportContractDrift.js --json
 */

import { findContractDrift, renderDrift } from '../services/billing/contractDrift';
import { readActiveContracts, readSchedules } from '../services/billing/contractDriftSource';

async function main(): Promise<void> {
  const schedules = await readSchedules();
  const contracts = await readActiveContracts();
  const result = findContractDrift(contracts, schedules, new Date());
  console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : renderDrift(result));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'contract-drift',
        event: 'run_failed', outcome: 'failure', error_class: err?.errorClass ?? 'UpstreamUnavailable',
        context: { message: err?.message },
      }));
      process.exit(1);
    });
}
