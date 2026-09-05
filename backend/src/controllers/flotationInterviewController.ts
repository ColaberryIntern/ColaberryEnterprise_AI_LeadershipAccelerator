import { Request, Response } from 'express';
import RawLeadPayload from '../models/RawLeadPayload';
import Lead from '../models/Lead';
import {
  nextInterviewMessage,
  interviewTranscript,
  MAX_EXCHANGES,
  type InterviewTurn,
} from '../services/delivery/flotationInterviewService';
import { recordUnderstandingFromConversation } from '../services/delivery/recordProjectUnderstanding';

/**
 * POST /api/flotation/interview
 *
 * The chat door from §14, keyed on the same `rawPayloadId` the form already returned - so
 * the interview, the write-up and the wow screen all hang off one identity for one person
 * in one session.
 *
 * ## The transcript comes from the client, and that is a considered choice
 *
 * Turns are sent up each time rather than stored server-side. It avoids a table and a
 * session store for something explicitly temporary, and it lets someone reload without
 * losing the thread.
 *
 * The cost is that a determined person could edit their own transcript before it is
 * extracted. That is worth being clear about rather than pretending otherwise: what they
 * would be forging is their OWN account of their OWN business, which is the thing we are
 * asking them for anyway. Nothing downstream treats it as verified - it extracts to
 * `source_message` provenance, never `client_confirmed`, so it cannot become a governed
 * requirement without them confirming it on screen first.
 *
 * If this ever carried anything a third party relies on, it would need server-side turns.
 * It does not, today.
 */
export async function handleFlotationInterview(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const token = String(body.token || '').trim();
    const rawTurns: InterviewTurn[] = Array.isArray(body.turns) ? body.turns : [];

    // Bounded server-side. A client that sends a thousand turns must not be able to buy a
    // thousand-turn prompt.
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
      // Same answer as the preview endpoint gives, for the same reason: a wrong token, a
      // malformed one and one that produced no lead must be indistinguishable.
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const lead: any = await Lead.findByPk(payload.resulting_lead_id);
    const facts = {
      name: lead?.name || null,
      company: lead?.company || null,
      role: lead?.role || lead?.title || null,
    };

    const result = await nextInterviewMessage({ turns, facts });

    if (!result.ok) {
      res.status(200).json({
        done: false,
        message: 'Sorry — I lost my thread there. Could you say that again?',
        error_class: result.error_class,
      });
      return;
    }

    if (result.done) {
      // Extraction runs on the FULL transcript including the closing message, and is
      // deliberately awaited: the page switches straight to the write-up, so producing it
      // before responding is what makes that transition honest rather than a spinner over
      // a promise.
      const conversation = interviewTranscript([...turns, { role: 'assistant', text: result.message }]);

      const outcome = await recordUnderstandingFromConversation({
        leadId: payload.resulting_lead_id,
        source: 'chat',
        sourceRef: `chat:${token}`,
        conversation,
        facts,
      });

      console.log(
        `[FlotationInterview] understanding ${outcome.status}` +
          `${outcome.reason ? ` (${outcome.reason})` : ''}` +
          `${outcome.kept !== undefined ? ` kept=${outcome.kept} rejected=${outcome.rejected}` : ''}`,
      );

      res.status(200).json({
        done: true,
        message: result.message,
        // The page polls the preview endpoint next; tell it whether there is anything to
        // find, so it does not poll for something that failed.
        understanding: outcome.status,
      });
      return;
    }

    res.status(200).json({ done: false, message: result.message, exchanges: result.exchanges });
  } catch (err: any) {
    console.error('[FlotationInterview] error:', err?.message);
    res.status(500).json({ error: 'We could not continue the conversation right now.' });
  }
}
