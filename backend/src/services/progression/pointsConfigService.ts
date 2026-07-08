/**
 * pointsConfigService — the ONLY source of XP amounts + readiness weights.
 * Reads the editable `points_config` table; falls back to the type registry
 * seed defaults when no override row exists. Nothing hardcodes XP at a call
 * site — change the economy by editing config, not code.
 */
import PointsConfig from '../../models/PointsConfig';
import { resolve as resolveType } from '../timeline/typeRegistry';

export interface TypeXp { learning: number; builder: number; community: number; }

/** XP for a card type: config override if present, else registry defaults. */
export async function getTypeXp(typeSlug: string): Promise<TypeXp> {
  const cfg = await PointsConfig.findOne({ where: { scope: 'type_default', key: typeSlug, is_active: true } });
  if (cfg) {
    return {
      learning: cfg.learning_xp ?? 0,
      builder: cfg.builder_xp ?? 0,
      community: cfg.community_xp ?? 0,
    };
  }
  const def = resolveType(typeSlug);
  return {
    learning: def?.learning_xp ?? 0,
    builder: def?.builder_xp ?? 0,
    community: def?.community_xp ?? 0,
  };
}
