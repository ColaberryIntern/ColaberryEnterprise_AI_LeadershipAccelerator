/**
 * OH1o (Ali, G): "I need a place to control the brain and see what all it has to choose from."
 *
 * One read for the Brain tab: the rules in force (and any problem with the stored ones), every
 * shelf's full inventory, the send switch, and which items each Explorer has already been given
 * (masked; newest first). Read only; the rules are saved through brainRules.saveBrainRules.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { BrainInventory } from '../openHouseBrain';
import type { MayaBrainRules } from './brainRules';
import { EXPLORER_MAYA_HARD_RULES } from './explorerBrainPick';
import { maskEmail } from './drafts/brainSample';

export interface BrainGivenRow {
  recipient_masked: string;
  date: string | null;
  shelf: string;
  item_id: string | null;
  status: string;
}

export interface BrainControl {
  rules: MayaBrainRules;
  rules_problems: string[];
  rules_stored: boolean;
  hard_rules: string;
  send_enabled: boolean | null;
  inventory: BrainInventory | null;
  given: BrainGivenRow[];
}

export interface BrainControlDeps {
  rules: () => Promise<{ rules: MayaBrainRules; problems: string[]; stored: boolean }>;
  inventory: () => Promise<BrainInventory>;
  sendEnabled: () => Promise<boolean>;
  given: (limit: number) => Promise<BrainGivenRow[]>;
}

function defaultDeps(): BrainControlDeps {
  return {
    rules: async () => (await import('./brainRules')).loadBrainRules(),
    inventory: async () => (await import('../openHouseBrain')).readBrainInventory(),
    sendEnabled: async () => {
      const v = await (await import('../settingsService')).getSetting('explorer_growth_send_enabled');
      return v === true || v === 'true';
    },
    given: async (limit) => {
      const rows = await sequelize.query<{ to_email: string | null; d: string | null; piece: string | null; item: string | null; status: string }>(
        `SELECT to_email, metadata->>'explorer_decision_date' AS d, metadata->'brain_pick'->>'piece' AS piece,
                metadata->'brain_pick'->>'item_id' AS item, status
           FROM scheduled_emails
          WHERE (metadata->'brain_pick') IS NOT NULL AND status <> 'explorer_draft_superseded'
          ORDER BY created_at DESC
          LIMIT :limit`,
        { type: QueryTypes.SELECT, replacements: { limit } },
      );
      return rows.map((r) => ({
        recipient_masked: maskEmail(r.to_email), date: r.d, shelf: r.piece || 'none', item_id: r.item, status: r.status,
      }));
    },
  };
}

export async function getBrainControl(deps: BrainControlDeps = defaultDeps()): Promise<BrainControl> {
  const [r, inv, send, given] = await Promise.all([
    deps.rules(),
    deps.inventory().catch(() => null),
    deps.sendEnabled().catch(() => null),
    deps.given(100).catch(() => [] as BrainGivenRow[]),
  ]);
  return {
    rules: r.rules,
    rules_problems: r.problems,
    rules_stored: r.stored,
    hard_rules: EXPLORER_MAYA_HARD_RULES,
    send_enabled: send,
    inventory: inv,
    given,
  };
}
