import { Request, Response } from 'express';
import RawLeadPayload from '../models/RawLeadPayload';
import Lead from '../models/Lead';
import ScholarshipInterview from '../models/ScholarshipInterview';
import {
  nextInterviewMessage,
  interviewTranscript,
  summariseForReviewer,
  MAX_EXCHANGES,
  type InterviewTurn,
} from '../services/cpn/scholarshipInterviewService';

/**
 * POST /api/cpn/scholarship-interview
 *
 * The written interview door, keyed on the same `raw_payload_id` the scholarship
 * interest form already got back from `/api/leads/ingest` — so the form, the
 * conversation and the stored record all hang off one identity for one person in
 * one session, with no second session store.
 *
 * Modelled on `flotationInterviewController`, and it keeps that controller's two
 * decisions deliberately:
 *
 * TURNS COME FROM THE CLIENT. Sent up each time rather than held server-side. It
 * avoids a session store for something explicitly temporary and lets somebody
 * reload without losing the thread. The cost is that a determined person could
 * edit their own transcript first — worth saying plainly rather than pretending
 * otherwise. What they would be forging is their own account of their own life,
 * which is the thing we are asking them for. Nothing downstream treats it as
 * verified, because nothing downstream treats it as anything: a human reads it.
 *
 * A WRONG TOKEN, A MALFORMED ONE AND ONE THAT PRODUCED NO LEAD ARE
 * INDISTINGUISHABLE. All three get the same 404. An endpoint that answered
 * differently would let anybody test whether a given id belongs to a real
 * scholarship applicant.
 *
 * UNLIKE FLOTATION, THIS PERSISTS. Flotation's transcript extracts into a
 * ProjectUnderstanding and the conversation itself is transient. Here the
 * conversation IS the artefact — a person reads it — so it is stored, upserted on
 * `raw_payload_id` so a reload continues one interview rather than opening a
 * second one against the same applicant.
 */
export async function handleScholarshipInterview(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const token = String(body.token || '').trim();
    const rawTurns: InterviewTurn[] = Array.isArray(body.turns) ? body.turns : [];

    // Bounded server-side. A client that sends a thousand turns must not be able
    // to buy a thousand-turn prompt.
    const turns = rawTurns
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
      .map((t) => ({ role: t.role, text: String(t.text).slice(0, 4000) }))
      .slice(-(MAX_EXCHANGES * 2 + 2));

    if (!token || turns.length === 0) {
      res.status(400).json({ error: 'token and turns are required' });
      return;
    }

    let payload: any = null;
    try {
      payload = await RawLeadPayload.findByPk(token);
    } catch {
      payload = null;
    }

    if (!payload?.resulting_lead_id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const lead: any = await Lead.findByPk(payload.resulting_lead_id);
    const facts = {
      name: lead?.name || null,
      // `city_state` is mapped into lead metadata by the seeded field map. It is
      // the only locational fact used, and only so the interviewer does not ask
      // something the person already told the form.
      cityState: (lead?.metadata && (lead.metadata as any).city_state) || null,
    };

    const result = await nextInterviewMessage({ turns, facts });

    if (!result.ok) {
      // A model failure must not read as the applicant's fault, and must not end
      // the conversation.
      res.status(200).json({
        done: false,
        message: 'Sorry — I lost my thread there. Could you say that again?',
        error_class: result.error_class,
      });
      return;
    }

    const fullTurns = [...turns, { role: 'assistant' as const, text: result.message }];
    const transcript = interviewTranscript(fullTurns);
    const exchanges = turns.filter((t) => t.role === 'user').length;

    // The summary is only worth generating once, at the end.
    const summary = result.done
      ? await summariseForReviewer({ transcript, facts })
      : null;

    await upsertInterview({
      leadId: payload.resulting_lead_id,
      rawPayloadId: token,
      transcript,
      exchanges,
      done: result.done,
      summary,
    });

    res.status(200).json({
      done: result.done,
      message: result.message,
      exchanges: result.exchanges,
    });
  } catch (err: any) {
    console.error('[ScholarshipInterview] error:', err?.message);
    res.status(500).json({ error: 'We could not continue the conversation right now.' });
  }
}

/**
 * Create or continue the one interview for this submission.
 *
 * Keyed on `raw_payload_id`, which the unique index enforces: a reload, a double
 * submit or a retried request continues the same row. Persistence failures are
 * logged and swallowed — losing the record is bad, but dropping somebody's
 * conversation mid-sentence because a write failed is worse, and the client
 * already has the turns.
 */
async function upsertInterview(params: {
  leadId: number;
  rawPayloadId: string;
  transcript: string;
  exchanges: number;
  done: boolean;
  summary: string | null;
}): Promise<void> {
  try {
    const existing = await ScholarshipInterview.findOne({
      where: { raw_payload_id: params.rawPayloadId },
    });

    const fields = {
      transcript: params.transcript,
      exchanges: params.exchanges,
      status: params.done ? ('complete' as const) : ('in_progress' as const),
      completed_at: params.done ? new Date() : null,
      // Never overwrite a summary that exists with a null from a later turn.
      ...(params.summary ? { summary: params.summary } : {}),
    };

    if (existing) await existing.update(fields as any);
    else {
      await ScholarshipInterview.create({
        lead_id: params.leadId,
        raw_payload_id: params.rawPayloadId,
        ...fields,
      } as any);
    }
  } catch (err: any) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'scholarship_interview_persist_failed',
        outcome: 'failure',
        error_class: 'InterviewPersistError',
        context: { lead_id: params.leadId, message: err?.message },
      })
    );
  }
}
