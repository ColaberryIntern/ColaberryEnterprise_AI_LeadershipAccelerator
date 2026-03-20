import { Request, Response } from 'express';
import Lead from '../models/Lead';

/**
 * POST /api/webhook/apollo/phone-reveal
 * Receives phone number reveal data from Apollo's async phone enrichment.
 * Apollo sends this after a people/match request with reveal_phone_number=true.
 */
export async function handleApolloPhoneReveal(req: Request, res: Response): Promise<void> {
  try {
    console.log('[Apollo Webhook] Phone reveal payload:', JSON.stringify(req.body).slice(0, 2000));

    const body = req.body || {};
    const person = body.person || body;

    const apolloId = person.id || body.id;
    const email = person.email;
    const phoneNumbers = person.phone_numbers;
    const sanitizedPhone = person.sanitized_phone;
    const directPhone = person.direct_phone;

    // Extract best phone number
    const phone =
      phoneNumbers?.[0]?.sanitized_number ||
      phoneNumbers?.[0]?.raw_number ||
      sanitizedPhone ||
      directPhone ||
      '';

    if (!phone) {
      console.log('[Apollo Webhook] No phone number in reveal payload');
      res.status(200).json({ received: true, phone_updated: false, reason: 'no_phone_in_payload' });
      return;
    }

    // Find lead by apollo_id or email
    let lead = null;
    if (apolloId) {
      lead = await Lead.findOne({ where: { apollo_id: apolloId } });
    }
    if (!lead && email) {
      lead = await Lead.findOne({ where: { email: email.toLowerCase().trim() } });
    }

    if (!lead) {
      console.log(`[Apollo Webhook] No matching lead for apollo_id=${apolloId} email=${email}`);
      res.status(200).json({ received: true, phone_updated: false, reason: 'lead_not_found' });
      return;
    }

    // Update lead with phone number
    await lead.update({ phone } as any);
    console.log(`[Apollo Webhook] Updated lead ${lead.id} (${email}) with phone: ${phone}`);

    res.status(200).json({ received: true, phone_updated: true, lead_id: lead.id });
  } catch (err: any) {
    console.error('[Apollo Webhook] Error:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
}
