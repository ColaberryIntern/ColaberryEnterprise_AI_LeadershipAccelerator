import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { env } from '../../../config/env';
import { classifyError } from '../../../utils/errorClassifier';
import type { AskAi } from '../aiCall';
import { ROOM_ID, roomLink } from '../choose/chooseSession';
import { centralDate } from '../curriculumMap';
import * as plans from '../plans/planStore';
import { addDays, briefDueOn, classTimes, label, promotionSlots } from './briefCalendar';
import { renderBrief, type BriefFacts } from './briefRender';
import { REAL, sendToJackie, todoTitle, type SendDeps } from './briefSend';
import * as store from './briefStore';
import { writeCopy } from './briefWriter';

/**
 * Jackie's event brief (WL4.4): write the copy in the background, show it, and on Ali's approve send
 * one Basecamp to-do to Jackie. Only for a class Studio planned (an adopted class was promoted by hand).
 * Writing: one strict-schema call plus one repair round; a brief that still breaks a rule fails with the
 * rules listed. Sending: see briefStore (claim) and briefSend (find-before-create).
 */
export class BriefError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) { super(message); this.name = 'BriefError'; }
}

interface Ctx { planId: string; topicId: string; sessionId: string; airDate: string; }
async function ctxOf(planId: string): Promise<Ctx> {
  const plan = await plans.getPlan(planId);
  if (!plan) throw new BriefError(404, 'Not found', 'not_found');
  if (plan.status !== 'chosen' || !plan.chosen_topic_id || !plan.live_session_id) throw new BriefError(409, 'Choose a topic first.', 'not_chosen');
  if (plan.session_origin !== 'created') throw new BriefError(409, 'This class was planned outside Studio, so it is promoted by hand.', 'adopted_session');
  return { planId, topicId: plan.chosen_topic_id, sessionId: plan.live_session_id, airDate: plan.air_date };
}

async function facts(c: Ctx, writtenOn: string): Promise<BriefFacts> {
  const [s] = await sequelize.query<{ title: string }>('SELECT title FROM live_sessions WHERE id = :id', { replacements: { id: c.sessionId }, type: QueryTypes.SELECT });
  const week = /\(Week (\d+)/.exec(s?.title || '')?.[1];
  return {
    title: (s?.title || '').replace(/\s*\(Week[^)]*\)\s*$/, ''), airLabel: label(c.airDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    times: classTimes(c.airDate), episodeLabel: week ? `Week ${week}` : 'Weekly Live', zoomLink: roomLink(ROOM_ID),
    nextLabel: label(addDays(c.airDate, 7), { weekday: 'long', month: 'long', day: 'numeric' }), siteUrl: env.frontendUrl.replace(/\/+$/, ''),
    slots: promotionSlots(writtenOn, c.airDate), generatedFor: label(c.airDate, { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

function log(event: string, planId: string, outcome: 'success' | 'failure', t0: number, errorClass?: string, extra: Record<string, unknown> = {}) {
  console[outcome === 'failure' ? 'error' : 'log'](JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, correlation_id: planId, duration_ms: Date.now() - t0, outcome, error_class: errorClass, context: { plan_id: planId, ...extra } }));
}

export async function runBrief(c: Ctx, attempt: number, writtenOn: string, ask?: AskAi): Promise<void> {
  const t0 = Date.now();
  try {
    const copy = await writeCopy(c, writtenOn, ask);
    await store.finishWriter(c.planId, attempt, { status: 'ready', copy });
    log('weekly_live.brief', c.planId, 'success', t0);
  } catch (e) {
    const err = e as Error & { problems?: string[] };
    const shown = err?.name === 'BriefRejected' || ['BudgetExceeded', 'ContractViolation'].includes(err?.name) ? err.message : 'Something went wrong while writing the brief. Write it again.';
    await store.finishWriter(c.planId, attempt, { status: 'failed', error: shown, problems: err?.problems ?? [] }).catch(() => undefined); // a stale row is reclaimable anyway
    log('weekly_live.brief', c.planId, 'failure', t0, err?.name === 'BriefRejected' ? 'ValidationError' : classifyError(e));
  }
}

export interface BriefView { status: 'none' | 'writing' | 'ready' | 'failed'; error: string | null; problems: string[]; html: string | null; approved: boolean; sending: boolean; sendError: string | null; todoUrl: string | null; }
export async function briefView(planId: string): Promise<BriefView> {
  const c = await ctxOf(planId);
  const row = await store.getBrief(planId);
  const current = row && row.topic_id === c.topicId ? row : null;
  const html = current?.status === 'ready' && current.copy && current.written_on ? renderBrief(current.copy, await facts(c, current.written_on)) : null;
  return {
    status: !current ? 'none' : current.stale ? 'failed' : current.status, error: current?.stale ? 'The writer stopped before it finished. Write it again.' : current?.error ?? null,
    problems: current?.problems ?? [], html, approved: Boolean(current?.approved_at), sending: Boolean(current?.sending), sendError: current?.send_error ?? null, todoUrl: current?.bc_todo_url ?? null,
  };
}

type Background = (c: Ctx, attempt: number, writtenOn: string) => void;
const inBackground: Background = (c, attempt, writtenOn) => { void runBrief(c, attempt, writtenOn); };

export async function startBrief(planId: string, rewrite: boolean, run: Background = inBackground): Promise<BriefView> {
  const c = await ctxOf(planId);
  const writtenOn = centralDate();
  if (writtenOn > c.airDate) throw new BriefError(409, 'This class has already aired.', 'aired');
  const attempt = await store.claimWriter(planId, c.topicId, writtenOn, rewrite);
  if (attempt !== null) run(c, attempt, writtenOn);
  return briefView(planId);
}

/** Ali's approve: send one to-do to Jackie. Approving again returns the same to-do. */
export async function approveBrief(planId: string, by: string, deps: SendDeps = REAL): Promise<BriefView> {
  const c = await ctxOf(planId);
  const row = await store.getBrief(planId);
  if (!row || row.topic_id !== c.topicId || row.status !== 'ready' || !row.copy || !row.written_on) throw new BriefError(409, 'The brief is not written yet.', 'not_ready');
  if (row.bc_todo_id) return briefView(planId);
  const attempt = await store.claimSend(planId, c.topicId, by);
  if (attempt === null) throw new BriefError(409, 'The brief is being sent right now.', 'sending');
  const t0 = Date.now();
  try {
    const f = await facts(c, row.written_on);
    const sent = await sendToJackie({ title: todoTitle(row.copy.eventName, f.airLabel), html: renderBrief(row.copy, f), slug: `weekly-live-${c.airDate}`, summary: row.copy.summary, dueOn: briefDueOn(centralDate(), c.airDate), siteUrl: f.siteUrl, approvedBy: by }, deps);
    await store.finishSend(planId, attempt, { todoId: sent.todoId, url: sent.url });
    log('weekly_live.brief_send', planId, 'success', t0, undefined, { todo_id: sent.todoId, adopted: sent.adopted });
  } catch (e) {
    await store.finishSend(planId, attempt, { error: 'Sending to Basecamp failed. Approve again to retry.' }).catch(() => undefined); // the claim goes stale anyway
    log('weekly_live.brief_send', planId, 'failure', t0, classifyError(e));
    throw new BriefError(502, 'Sending to Basecamp failed. Approve again to retry.', 'send_failed');
  }
  return briefView(planId);
}
