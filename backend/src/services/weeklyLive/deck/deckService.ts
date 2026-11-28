import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { env } from '../../../config/env';
import { classifyError } from '../../../utils/errorClassifier';
import * as plans from '../plans/planStore';
import * as store from './blueprintStore';
import { BlueprintRejected, DECK_MODEL, writeBlueprint, writerInput } from './deckJob';
import { renderDeck } from './deckRender';

/**
 * Deck for a chosen plan (WL4.2): write the session blueprint in the background, then build the deck
 * and the teaching guide from it and save them on the session as kit_config_json.customDeck, so the
 * Accelerator's Present button, presenter window, follow-along cards, QR dock and Run-it-here use it
 * unchanged.
 *
 * Ownership: Studio writes a deck only on a session Studio created (an adopted class, like the hand-made
 * Nov 30 Ep 2, keeps its own), and only over an empty deck or one Studio built (its html carries
 * STUDIO_MARK). Saving reads the session row FOR UPDATE, so two saves cannot interleave.
 * Recovery: a failed write keeps its reason and the rules it broke; Write again claims a new attempt.
 */
export const STUDIO_MARK = '<meta name="generator" content="weekly-live-studio">';

export class DeckError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) { super(message); this.name = 'DeckError'; }
}

interface Ready { planId: string; topicId: string; sessionId: string; inputs: plans.PlanRow['inputs']; }
async function readyPlan(planId: string): Promise<Ready> {
  const plan = await plans.getPlan(planId);
  if (!plan) throw new DeckError(404, 'Not found', 'not_found');
  if (plan.status !== 'chosen' || !plan.chosen_topic_id || !plan.live_session_id) throw new DeckError(409, 'Choose a topic first.', 'not_chosen');
  if (plan.session_origin !== 'created') throw new DeckError(409, 'This class was planned outside Studio, so its deck stays as it is. Edit it in the Accelerator.', 'adopted_session');
  return { planId, topicId: plan.chosen_topic_id, sessionId: plan.live_session_id, inputs: plan.inputs };
}

export interface DeckStatus { status: store.BlueprintStatus | 'none'; error: string | null; problems: string[]; saved: boolean; slides: number; sessionId: string; }

const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Build the deck from the stored blueprint and save it on the session. No AI call; byte-identical on a rebuild. */
export async function saveDeck(planId: string): Promise<{ sessionId: string; slides: number; photos: string[] }> {
  const p = await readyPlan(planId);
  const row = await store.getBlueprint(p.planId, p.topicId);
  if (!row || row.status !== 'ready' || !row.blueprint) throw new DeckError(409, 'The session plan is not written yet.', 'no_blueprint');
  const bp = row.blueprint;
  return sequelize.transaction(async (transaction) => {
    const [s] = await sequelize.query<{ title: string; session_date: string; kit: Record<string, unknown> | null }>(
      "SELECT title, to_char(session_date, 'YYYY-MM-DD') AS session_date, kit_config_json AS kit FROM live_sessions WHERE id = :id AND status <> 'cancelled' FOR UPDATE",
      { replacements: { id: p.sessionId }, type: QueryTypes.SELECT, transaction });
    if (!s) throw new DeckError(409, 'The class for this plan is gone or cancelled. Choose the topic again.', 'no_session');
    const existing = (s.kit?.customDeck as { html?: unknown } | null | undefined)?.html;
    if (typeof existing === 'string' && existing.trim() && !existing.includes(STUDIO_MARK)) {
      throw new DeckError(409, 'This class already has a deck that Studio did not build, so it is left as it is.', 'foreign_deck');
    }
    const week = /\(Week (\d+)/.exec(s.title)?.[1];
    const deck = renderDeck({ blueprint: bp, title: s.title.replace(/\s*\(Week[^)]*\)\s*$/, ''), episode: week ? `Week ${week}` : 'Weekly Live', dateLabel: dateLabel(s.session_date), siteUrl: env.frontendUrl });
    if (!deck.html.includes(STUDIO_MARK)) throw new Error('rendered deck lost its Studio mark');
    const kit = { ...(s.kit || {}), customDeck: { html: deck.html, guideHtml: deck.guideHtml } };
    await sequelize.query('UPDATE live_sessions SET kit_config_json = CAST(:kit AS JSONB) WHERE id = :id', { replacements: { id: p.sessionId, kit: JSON.stringify(kit) }, transaction });
    return { sessionId: p.sessionId, slides: bp.slides.length, photos: deck.photos };
  });
}

function log(event: string, planId: string, outcome: 'success' | 'failure', t0: number, errorClass?: string, extra: Record<string, unknown> = {}) {
  console[outcome === 'failure' ? 'error' : 'log'](JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, correlation_id: planId, duration_ms: Date.now() - t0, outcome, error_class: errorClass, context: { plan_id: planId, ...extra } }));
}

/** The background part: write, store, then save the deck. Never throws; the outcome is on the row. */
export async function runDeck(p: Ready, attempt: number, ask?: Parameters<typeof writeBlueprint>[2]): Promise<void> {
  const t0 = Date.now();
  try {
    const bp = await writeBlueprint(p.planId, await writerInput(p.planId, p.topicId, p.inputs), ask);
    if (!(await store.finishWriter(p.planId, p.topicId, attempt, { status: 'ready', blueprint: bp }))) return; // replaced by a newer attempt
    const saved = await saveDeck(p.planId);
    log('weekly_live.deck', p.planId, 'success', t0, undefined, { slides: saved.slides });
  } catch (e) {
    const problems = e instanceof BlueprintRejected ? e.problems : [];
    const shown = e instanceof BlueprintRejected || e instanceof DeckError || (e instanceof Error && ['BudgetExceeded', 'ContractViolation'].includes(e.name)) ? (e as Error).message : 'Something went wrong while writing the session. Write it again.';
    await store.finishWriter(p.planId, p.topicId, attempt, { status: 'failed', error: shown, problems }).catch(() => undefined); // a stale row is reclaimable anyway
    log('weekly_live.deck', p.planId, 'failure', t0, e instanceof BlueprintRejected ? 'ValidationError' : classifyError(e));
  }
}

type Background = (p: Ready, attempt: number) => void;
const inBackground: Background = (p, attempt) => { void runDeck(p, attempt); };

/** Start (or reuse) the session plan and deck. A ready blueprint is rebuilt for free unless `rewrite`. */
export async function startDeck(planId: string, rewrite: boolean, run: Background = inBackground): Promise<DeckStatus> {
  const p = await readyPlan(planId);
  const have = await store.getBlueprint(p.planId, p.topicId);
  if (have?.status === 'ready' && !rewrite) { await saveDeck(planId); return deckStatus(planId); }
  const attempt = await store.claimWriter(p.planId, p.topicId, DECK_MODEL, rewrite);
  if (attempt !== null) run(p, attempt);
  return deckStatus(planId);
}

export async function deckStatus(planId: string): Promise<DeckStatus> {
  const p = await readyPlan(planId);
  const row = await store.getBlueprint(p.planId, p.topicId);
  const [s] = await sequelize.query<{ html: string | null }>("SELECT kit_config_json->'customDeck'->>'html' AS html FROM live_sessions WHERE id = :id", { replacements: { id: p.sessionId }, type: QueryTypes.SELECT });
  return {
    status: !row ? 'none' : row.stale ? 'failed' : row.status, error: row?.stale ? 'The writer stopped before it finished. Write it again.' : row?.error ?? null,
    problems: row?.problems ?? [], saved: Boolean(s?.html?.includes(STUDIO_MARK)), slides: row?.blueprint?.slides.length ?? 0, sessionId: p.sessionId,
  };
}
