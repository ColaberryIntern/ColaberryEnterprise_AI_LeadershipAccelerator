import { Request, Response, NextFunction } from 'express';
import { getPhoneGateStatus, savePortalPhone } from '../services/portalPhoneGate';

/**
 * GET /api/portal/phone-gate - does this session have to add a phone before continuing (PH1)?
 *
 * Returns booleans only, never the number. A read-only "View as" session is reported as never
 * required, so an admin previewing somebody without a number is not stopped at the gate.
 */
export async function handleGetPhoneGate(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await getPhoneGateStatus(req.participant!.sub, {
      readOnly: (req.participant as { read_only?: boolean } | undefined)?.read_only === true,
    });
    res.json(status);
  } catch (err) { next(err); }
}

/**
 * PUT /api/portal/phone - save the number from the gate, plus the OPTIONAL call/text consent.
 *
 * A read-only session never reaches this: `requireParticipant` refuses its writes centrally.
 */
export async function handleSavePortalPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body ?? {}) as { phone?: unknown; phone_consent?: unknown };
    const result = await savePortalPhone(
      req.participant!.sub,
      { phone: body.phone, phone_consent: body.phone_consent },
      {
        ipAddress: req.ip ?? null,
        userAgent: typeof (req as any).get === 'function' ? req.get('user-agent') ?? null : null,
      },
    );
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ has_phone: true });
  } catch (err) { next(err); }
}
