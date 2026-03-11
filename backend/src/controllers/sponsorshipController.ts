import { Request, Response, NextFunction } from 'express';
import Lead from '../models/Lead';
import { scoreSponsorshipReadiness } from '../services/sponsorshipScoringService';
import { logSponsorshipKitEvent } from '../services/governanceService';
import { sendSponsorshipKitEmail, sendHighIntentAlert } from '../services/emailService';

export async function requestSponsorshipKit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }

    const lead = await Lead.findOne({ where: { email: email.trim().toLowerCase() } });

    if (!lead) {
      res.status(404).json({ error: 'No matching lead found. Please complete the Executive Briefing form first.' });
      return;
    }

    // Mark kit requested + update interest stage
    await lead.update({
      sponsorship_kit_requested: true,
      executive_interest_stage: 'sponsorship_kit_requested',
    } as any);

    // Score sponsorship readiness
    const { score, tier, stage } = await scoreSponsorshipReadiness(lead);

    // Governance logging (fire-and-forget)
    logSponsorshipKitEvent(
      { id: lead.id, name: lead.name, company: lead.company || undefined },
      score,
      tier,
      stage,
    ).catch(() => {});

    // Send sponsorship kit email (fire-and-forget)
    sendSponsorshipKitEmail({
      to: lead.email,
      fullName: lead.name,
      company: lead.company || '',
      scoreTier: tier,
    }).catch((err) => console.error('[SponsorshipController] Kit email error:', err));

    // High-intent alert for score > 12
    if (score > 12) {
      sendHighIntentAlert({
        name: lead.name,
        company: lead.company || '',
        title: lead.title || '',
        email: lead.email,
        phone: lead.phone || '',
        score: lead.lead_score || 0,
        source: 'Sponsorship Kit Request',
      }).catch((err) => console.error('[SponsorshipController] High-intent alert error:', err));
    }

    res.status(200).json({ success: true, score, tier });
  } catch (error) {
    next(error);
  }
}
