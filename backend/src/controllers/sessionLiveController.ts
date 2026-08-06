import { Request, Response, NextFunction } from 'express';
import {
  recordPulse, getLiveState, isValidPulseState,
  setBroadcast, getCompanionState, recordPollResponse, sessionInCohort, BroadcastState, PollLockedError,
  getPresenterNotes,
} from '../services/sessionLiveStateService';
import { renderPresenterPage } from '../services/sessionKitDocService';

// Resource-ownership guard for participant live endpoints: the caller must be in
// the session's cohort. Returns true after sending 403 when they are not.
async function denyIfNotInCohort(req: Request, res: Response): Promise<boolean> {
  const ok = await sessionInCohort(req.params.id as string, req.participant!.cohort_id);
  if (!ok) { res.status(403).json({ error: 'Not enrolled in this class' }); return true; }
  return false;
}

// Live class pulse: students set their status from the phone; the instructor's
// Class Kit deck reads aggregate counts + recent questions.

/** POST /api/portal/sessions/:id/pulse — a student sets their live status. */
export async function handleRecordPulse(req: Request, res: Response, next: NextFunction) {
  try {
    const { state } = req.body || {};
    if (!isValidPulseState(state)) {
      return res.status(400).json({ error: 'state must be one of: here, building, stuck, finished' });
    }
    if (await denyIfNotInCohort(req, res)) return;
    const enrollmentId = req.participant!.sub;
    await recordPulse(req.params.id as string, enrollmentId, state);
    res.json({ success: true, state });
  } catch (err) { next(err); }
}

/**
 * GET /api/portal/sessions/:id/live-state — aggregate pulse + recent questions.
 * Auth is applied at the route (kit token scoped to this session, OR an admin
 * JWT). Never exposes PII beyond first names already in the class chat.
 */
export async function handleGetLiveState(req: Request, res: Response, next: NextFunction) {
  try {
    const state = await getLiveState(req.params.id as string);
    res.json(state);
  } catch (err) { next(err); }
}

/**
 * POST /api/portal/sessions/:id/broadcast — the instructor deck publishes its
 * CURRENT view (slide/segment/active question) so phones switch to match. Auth
 * at the route (kit token scoped to this session, OR admin). Minimal validation:
 * phase is required; the rest is the deck's trusted view snapshot.
 */
export async function handleSetBroadcast(req: Request, res: Response, next: NextFunction) {
  try {
    const b = (req.body || {}) as Partial<BroadcastState>;
    if (b.phase !== 'status' && b.phase !== 'question' && b.phase !== 'broadcast' && b.phase !== 'prompt') {
      return res.status(400).json({ error: 'phase must be status | question | broadcast | prompt' });
    }
    // A question phase must carry a well-formed question (key + non-empty options)
    // so no phone/deck render can crash on a missing field.
    let question: BroadcastState['question'] = null;
    if (b.phase === 'question') {
      const q = b.question;
      if (!q || typeof q.key !== 'string' || !q.key || !Array.isArray(q.options) || !q.options.length) {
        return res.status(400).json({ error: 'a question phase requires question.key and question.options[]' });
      }
      const theaterState = q.theater && q.theater.state;
      question = {
        key: q.key,
        kind: q.kind === 'trivia' || q.kind === 'prediction' ? q.kind : 'poll',
        q: String(q.q || ''),
        options: q.options.map((o) => String(o)),
        answer: typeof q.answer === 'number' ? q.answer : null,
        revealed: !!q.revealed,
        theater: theaterState === 'voting' || theaterState === 'locked' || theaterState === 'revealed'
          ? { state: theaterState } : undefined,
      };
    }
    // A prompt phase (Build Mode, pushed to phones) needs the prompt text itself
    // at minimum; the Build Bay metadata (paste target, mode, result, stop, rescue)
    // is all optional so older content without it still broadcasts fine.
    let prompt: BroadcastState['prompt'] = null;
    if (b.phase === 'prompt') {
      const p = b.prompt;
      if (!p || typeof p.label !== 'string' || typeof p.prompt !== 'string' || !p.prompt) {
        return res.status(400).json({ error: 'a prompt phase requires prompt.label and prompt.prompt' });
      }
      prompt = {
        label: String(p.label),
        prompt: String(p.prompt),
        pasteWhere: p.pasteWhere ? String(p.pasteWhere) : undefined,
        ccMode: p.ccMode ? String(p.ccMode) : undefined,
        expectedResult: p.expectedResult ? String(p.expectedResult) : undefined,
        stopCondition: p.stopCondition ? String(p.stopCondition) : undefined,
        rescue: p.rescue ? String(p.rescue) : undefined,
      };
    }
    const state: BroadcastState = {
      slide_index: Number(b.slide_index) || 0,
      slide_id: String(b.slide_id || ''),
      title: String(b.title || ''),
      segment_label: String(b.segment_label || ''),
      phase: b.phase,
      question,
      broadcast_prompts: Array.isArray(b.broadcast_prompts) ? b.broadcast_prompts.map((p) => String(p)) : undefined,
      prompt,
      presenter_tip: typeof b.presenter_tip === 'string' ? b.presenter_tip : undefined,
      next_title: typeof b.next_title === 'string' ? b.next_title : undefined,
      diagram_fullscreen: !!b.diagram_fullscreen,
    };
    await setBroadcast(req.params.id as string, state);
    res.json({ success: true });
  } catch (err) { next(err); }
}

/**
 * GET /api/portal/sessions/:id/presenter-notes — the instructor's OWN phone
 * view: the current slide's script and a preview of what's next. Auth at the
 * route is kit-token-or-admin only (same as live-state/broadcast) — this must
 * never be reachable via requireParticipant, since it is the one endpoint
 * that reads presenter_tip back out.
 */
export async function handleGetPresenterNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const notes = await getPresenterNotes(req.params.id as string);
    res.json(notes);
  } catch (err) { next(err); }
}

/**
 * GET /api/portal/sessions/:id/presenter-page — the instructor's own phone
 * page (HTML, not JSON): dark, large-text, polls presenter-notes above.
 * Same kit-token-or-admin gate as the JSON endpoint it reads from.
 */
export async function handleGetPresenterPage(req: Request, res: Response, next: NextFunction) {
  try {
    const html = await renderPresenterPage(req.params.id as string);
    if (!html) return res.status(404).json({ error: 'Session not found' });
    res.type('html').send(html);
  } catch (err) { next(err); }
}

/** GET /api/portal/sessions/:id/companion-state — what this student's phone shows. */
export async function handleGetCompanionState(req: Request, res: Response, next: NextFunction) {
  try {
    if (await denyIfNotInCohort(req, res)) return;
    const state = await getCompanionState(req.params.id as string, req.participant!.sub);
    res.json(state);
  } catch (err) { next(err); }
}

/** POST /api/portal/sessions/:id/poll-response — a student answers the active poll. */
export async function handleRecordPollResponse(req: Request, res: Response, next: NextFunction) {
  try {
    const { poll_key, choice } = req.body || {};
    // choice is an option index; cap it (options are lettered A–Z) to reject junk.
    if (typeof poll_key !== 'string' || !poll_key || poll_key.length > 200 || !Number.isInteger(choice) || choice < 0 || choice > 25) {
      return res.status(400).json({ error: 'poll_key (string) and choice (0–25) are required' });
    }
    if (await denyIfNotInCohort(req, res)) return;
    await recordPollResponse(req.params.id as string, req.participant!.sub, poll_key, choice);
    res.json({ success: true, choice });
  } catch (err) {
    if (err instanceof PollLockedError) return res.status(409).json({ error: 'Voting is locked for this question' });
    next(err);
  }
}
