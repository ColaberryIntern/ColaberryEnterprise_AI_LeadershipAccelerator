/**
 * sessionKitConfigService.ts — reads/writes a session's KitConfig (kit_config_json
 * on live_sessions). The only module that touches the DB for this; kitConfig.ts
 * stays pure so buildKitSpec can apply the same merge/default logic in tests
 * without any I/O.
 */
import { LiveSession } from '../models';
import { KitConfig, mergeKitConfig } from './classKit/kitConfig';

export async function getKitConfig(sessionId: string): Promise<KitConfig> {
  const session = await LiveSession.findByPk(sessionId, { attributes: ['kit_config_json'] });
  return mergeKitConfig(session?.get('kit_config_json'));
}

/** Saves a full-merge of `partial` over the current defaults (not over the
 * previously-saved config) — the instructor's popup always submits the
 * complete form state, so this is a replace, not a patch. */
export async function saveKitConfig(sessionId: string, partial: unknown): Promise<KitConfig | null> {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;
  const merged = mergeKitConfig(partial);
  await session.update({ kit_config_json: merged } as any);
  return merged;
}
