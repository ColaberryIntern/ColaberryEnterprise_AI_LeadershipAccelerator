import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CommunicationLog } from '../models';
import { reconcileFlotationCall } from '../services/delivery/flotationCallCompletion';
import {
  intakeFormSchema,
  createEnterpriseIntake,
  findIntake,
  runEnterpriseInterviewTurn,
  requestEnterpriseIntakeCall,
  voiceConfigured,
  callable,
} from '../services/enterpriseIntake/enterpriseIntakeService';

/**
 * The Enterprise intake's public doors (W28). The token in each path is the intake's own
 * random id, returned once by the form submit; a wrong, malformed or unknown token all get
 * the same 404.
 *
 *   POST /api/enterprise/intake                    the form: lead + intake, returns the token
 *   POST /api/enterprise/intake/:token/interview   one typed turn
 *   POST /api/enterprise/intake/:token/call        "Call me now"
 *   GET  /api/enterprise/intake/:token             where it has got to (the page polls this during a call)
 */

const userAgent = (req: Request): string | null =>
  typeof (req as any).get === 'function' ? req.get('user-agent') ?? null : null;

export async function handleCreateEnterpriseIntake(req: Request, res: Response): Promise<void> {
  try {
    const form = intakeFormSchema.parse(req.body || {});
    const created = await createEnterpriseIntake(form, { ipAddress: req.ip ?? null, userAgent: userAgent(req) });
    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
      return;
    }
    console.error('[EnterpriseIntake] create error:', err?.message);
    res.status(500).json({ error: 'We could not save that just now.' });
  }
}

export async function handleEnterpriseInterviewTurn(req: Request, res: Response): Promise<void> {
  try {
    const intake = await findIntake(String(req.params.token || ''));
    if (!intake) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const result = await runEnterpriseInterviewTurn(intake, (req.body || {}).turns);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[EnterpriseIntake] interview error:', err?.message);
    res.status(500).json({ error: 'We could not continue the conversation right now.' });
  }
}

export async function handleEnterpriseIntakeCall(req: Request, res: Response): Promise<void> {
  try {
    const intake = await findIntake(String(req.params.token || ''));
    if (!intake) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const result = await requestEnterpriseIntakeCall(intake);
    const code =
      result.status === 'calling' || result.status === 'already_calling' ? 200
      : result.status === 'failed' ? 502
      : 409;
    res.status(code).json(result);
  } catch (err: any) {
    console.error('[EnterpriseIntake] call error:', err?.message);
    res.status(500).json({ error: 'We could not place that call right now.' });
  }
}

/** How old a still-open call must be before we ask Synthflow about it ourselves. */
const RECONCILE_AFTER_MS = 60 * 1000;

export type CallState = 'none' | 'in_progress' | 'ended' | 'writing_up' | 'done';

export async function handleEnterpriseIntakeStatus(req: Request, res: Response): Promise<void> {
  try {
    let intake = await findIntake(String(req.params.token || ''));
    if (!intake) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    let call: CallState = 'none';
    if (intake.call_id) {
      const where = { provider: 'synthflow', provider_message_id: intake.call_id };
      let log: any = await CommunicationLog.findOne({ where });
      const age = intake.call_requested_at ? Date.now() - new Date(intake.call_requested_at).getTime() : 0;
      // The vendor talks to the webhook, not the browser. If it has not told us yet, ask it,
      // the way the admin page does. The same completion runs either way.
      if (log?.status === 'sent' && age > RECONCILE_AFTER_MS) {
        const out = await reconcileFlotationCall(intake.call_id);
        if (out.reconciled) {
          log = await CommunicationLog.findOne({ where });
          intake = (await findIntake(intake.id)) || intake;
        }
      }
      call =
        intake.status === 'interviewed' ? 'done'
        : log?.status === 'delivered' ? 'writing_up'
        : log?.status === 'failed' ? 'ended'
        : 'in_progress';
    }

    res.status(200).json({
      status: intake.status,
      interviewed: intake.status === 'interviewed',
      call,
      callAvailable: voiceConfigured() && callable(intake),
      company: intake.company,
      peopleCount: intake.people_count,
      hoursPerWeek: intake.hours_per_week === null ? null : Number(intake.hours_per_week),
    });
  } catch (err: any) {
    console.error('[EnterpriseIntake] status error:', err?.message);
    res.status(500).json({ error: 'We could not read that just now.' });
  }
}
