import { Request, Response } from 'express';
import RawLeadPayload from '../models/RawLeadPayload';
import Lead from '../models/Lead';
import { runIntakeTurn, boundTurns } from '../services/delivery/projectIntake';

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
    const turns = boundTurns(body.turns);

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

    // Everything from here is the ONE intake, shared with the admin door. This controller
    // only decides who is talking and where their project lands: a prospect, identified by
    // the token, whose enquiry already created an enrolment under their email.
    const result = await runIntakeTurn({
      turns,
      facts: {
        name: lead?.name || null,
        company: lead?.company || null,
        role: lead?.role || lead?.title || null,
      },
      sourceRef: `chat:${token}`,
      leadId: payload.resulting_lead_id,
      buildFor: lead?.email ? { kind: 'by_email', email: lead.email } : { kind: 'none' },
    });

    if (result.done) {
      console.log(
        `[FlotationInterview] understanding ${result.understanding}` +
          (result.build ? ` build=${result.build.started ? result.build.project_id : 'not started: ' + result.build.reason}` : ''),
      );
    }

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[FlotationInterview] error:', err?.message);
    res.status(500).json({ error: 'We could not continue the conversation right now.' });
  }
}
