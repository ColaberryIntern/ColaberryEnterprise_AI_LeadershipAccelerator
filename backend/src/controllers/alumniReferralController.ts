import { Request, Response } from 'express';
import {
  verifyAndLoginAlumni,
  getProfile,
  updateProfile,
  submitReferral,
  getReferrals,
  getReferralTimeline,
  getEarningsSummary,
} from '../services/alumniReferralService';

export async function handleAlumniLogin(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await verifyAndLoginAlumni(email);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleGetProfile(req: Request, res: Response) {
  try {
    const profileId = req.alumni!.sub;
    const profile = await getProfile(profileId);
    res.json(profile);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleUpdateProfile(req: Request, res: Response) {
  try {
    const profileId = req.alumni!.sub;
    const { alumni_phone, alumni_cohort, alumni_email } = req.body;
    const updated = await updateProfile(profileId, { alumni_phone, alumni_cohort, alumni_email });
    res.json(updated);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleGetReferrals(req: Request, res: Response) {
  try {
    const profileId = req.alumni!.sub;
    const referrals = await getReferrals(profileId);
    res.json(referrals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleSubmitReferral(req: Request, res: Response) {
  try {
    const profileId = req.alumni!.sub;
    const { company_name, contact_name, contact_email, job_title, referral_type } = req.body;

    if (!company_name || !contact_name || !contact_email || !referral_type) {
      return res.status(400).json({ error: 'company_name, contact_name, contact_email, and referral_type are required' });
    }

    const validTypes = ['corporate_sponsor', 'introduced', 'anonymous'];
    if (!validTypes.includes(referral_type)) {
      return res.status(400).json({ error: `referral_type must be one of: ${validTypes.join(', ')}` });
    }

    const referral = await submitReferral(profileId, {
      company_name,
      contact_name,
      contact_email,
      job_title,
      referral_type,
    });

    res.status(201).json(referral);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleGetTimeline(req: Request, res: Response) {
  try {
    const profileId = req.alumni!.sub;
    const id = req.params.id as string;
    const events = await getReferralTimeline(id, profileId);
    res.json(events);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleGetEarnings(req: Request, res: Response) {
  try {
    const profileId = req.alumni!.sub;
    const summary = await getEarningsSummary(profileId);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
