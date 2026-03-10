import { runFullDiscovery, DiscoveryResult } from '../discovery/dictionaryBuilder';
import SystemProcess from '../../models/SystemProcess';
import DatasetRegistry from '../../models/DatasetRegistry';

let isRunning = false;

export async function runDiscoveryAgent(): Promise<DiscoveryResult | null> {
  if (isRunning) {
    console.log('[Intelligence] Discovery already in progress, skipping');
    return null;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[Intelligence] Starting discovery pipeline...');
    const result = await runFullDiscovery();

    // Record successful process
    await SystemProcess.create({
      process_name: 'intelligence_discovery',
      source_module: 'intelligence',
      event_type: 'discovery',
      execution_time_ms: result.duration_ms,
      status: 'completed',
      metadata: {
        tables_found: result.tables_discovered,
        relationships: result.relationships_found,
        hub_entity: result.hub_entity,
      },
    });

    console.log(
      `[Intelligence] Discovery complete: ${result.tables_discovered} tables, ` +
        `${result.relationships_found} relationships in ${result.duration_ms}ms`
    );

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    await SystemProcess.create({
      process_name: 'intelligence_discovery',
      source_module: 'intelligence',
      event_type: 'discovery',
      execution_time_ms: duration,
      status: 'failed',
      metadata: {},
      error_message: error?.message || 'Unknown error',
    }).catch(() => {});

    console.error('[Intelligence] Discovery failed:', error?.message);

    // Auto-heal: retry once after 30 seconds
    setTimeout(async () => {
      try {
        console.log('[Intelligence] Retrying discovery...');
        const retryResult = await runFullDiscovery();
        await SystemProcess.create({
          process_name: 'intelligence_discovery_retry',
          source_module: 'intelligence',
          event_type: 'discovery',
          execution_time_ms: retryResult.duration_ms,
          status: 'completed',
          metadata: { tables_found: retryResult.tables_discovered, retry: true },
        }).catch(() => {});
        console.log(`[Intelligence] Retry succeeded: ${retryResult.tables_discovered} tables`);
      } catch (retryError: any) {
        console.error('[Intelligence] Retry also failed:', retryError?.message);
      }
    }, 30000);

    return null;
  } finally {
    isRunning = false;
  }
}

export async function getLastDiscoveryStatus(): Promise<any> {
  return SystemProcess.findOne({
    where: { process_name: 'intelligence_discovery' },
    order: [['created_at', 'DESC']],
  });
}

export async function ensureDatasetsCovered(): Promise<void> {
  const count = await DatasetRegistry.count();
  if (count === 0) {
    console.log('[Intelligence] No datasets found, triggering discovery...');
    await runDiscoveryAgent();
  }
}
