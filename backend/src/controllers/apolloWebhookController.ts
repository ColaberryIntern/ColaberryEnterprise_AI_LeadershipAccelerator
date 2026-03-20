import { Request, Response } from 'express';
import Lead from '../models/Lead';

/**
 * POST /api/webhook/apollo/phone-reveal
 * Receives phone number reveal data from Apollo's async phone enrichment.
 * Apollo sends: { status, people: [{ id, status, phone_numbers: [...] }] }
 */
export async function handleApolloPhoneReveal(req: Request, res: Response): Promise<void> {
  try {
    console.log('[Apollo Webhook] Phone reveal payload:', JSON.stringify(req.body).slice(0, 2000));

    const body = req.body || {};
    const people = body.people || [];

    if (!people.length) {
      // Fallback: maybe the payload is a single person object
      const person = body.person || body;
      if (person.id) {
        people.push(person);
      }
    }

    let updated = 0;
    let notFound = 0;
    let noPhone = 0;

    for (const person of people) {
      const apolloId = person.id;
      const phoneNumbers = person.phone_numbers || [];

      // Extract best phone number (prefer high confidence, mobile)
      const bestPhone = phoneNumbers.find((p: any) => p.sanitized_number || p.raw_number);
      const phone = bestPhone?.sanitized_number || bestPhone?.raw_number || '';

      if (!phone) {
        console.log(`[Apollo Webhook] No phone for person ${apolloId}`);
        noPhone++;
        continue;
      }

      // Find lead by apollo_id
      const lead = apolloId ? await Lead.findOne({ where: { apollo_id: apolloId } }) : null;

      if (!lead) {
        console.log(`[Apollo Webhook] No matching lead for apollo_id=${apolloId}`);
        notFound++;
        continue;
      }

      await lead.update({ phone } as any);
      console.log(`[Apollo Webhook] Updated lead ${lead.id} (${(lead as any).email}) with phone: ${phone}`);
      updated++;
    }

    res.status(200).json({ received: true, updated, notFound, noPhone });
  } catch (err: any) {
    console.error('[Apollo Webhook] Error:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
}
