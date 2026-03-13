import jwt from 'jsonwebtoken';
import * as sql from 'mssql';
import { env } from '../config/env';
import { sequelize } from '../config/database';
import {
  AlumniReferralProfile,
  AlumniReferral,
  ReferralActivityEvent,
  ReferralCommission,
  Campaign,
  Lead,
  CampaignLead,
} from '../models';
import { createLead } from './leadService';
import { enrollLeadsInCampaign } from './campaignService';

// ── MSSQL Alumni Lookup ─────────────────────────────────────────────────

let pool: sql.ConnectionPool | null = null;

async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;

  if (!env.mssqlHost || !env.mssqlUser) {
    throw new Error('MSSQL connection not configured');
  }

  pool = new sql.ConnectionPool({
    server: env.mssqlHost,
    port: env.mssqlPort,
    user: env.mssqlUser,
    password: env.mssqlPass,
    database: env.mssqlDatabase,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  });
  await pool.connect();
  return pool;
}

interface AlumniLookupResult {
  Firstname: string;
  LastName: string;
  Email: string;
  PhoneNumber: string;
  ClassName: string | null;
}

async function findAlumniByEmail(email: string): Promise<AlumniLookupResult | null> {
  const db = await getMssqlPool();
  const result = await db.request()
    .input('email', sql.NVarChar, email.trim().toLowerCase())
    .query<AlumniLookupResult>(`
      SELECT TOP 1 Firstname, LastName, Email, PhoneNumber, ClassName
      FROM CCPP.dbo.vw_QS_MetricsDashboard_ActiveUsers
      WHERE LOWER(Email) = @email AND grouporderid = 1
    `);
  return result.recordset[0] || null;
}

// ── Auth ────────────────────────────────────────────────────────────────

export async function verifyAndLoginAlumni(email: string): Promise<{ token: string; profile: AlumniReferralProfile }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Verify against MSSQL alumni database
  const alumniRecord = await findAlumniByEmail(normalizedEmail);
  if (!alumniRecord) {
    throw Object.assign(new Error('Email not found in alumni database'), { statusCode: 404 });
  }

  const alumniName = `${(alumniRecord.Firstname || '').trim()} ${(alumniRecord.LastName || '').trim()}`.trim();

  // Find or create referral profile
  const [profile] = await AlumniReferralProfile.findOrCreate({
    where: sequelize.where(
      sequelize.fn('LOWER', sequelize.col('alumni_email')),
      normalizedEmail,
    ),
    defaults: {
      alumni_email: normalizedEmail,
      alumni_name: alumniName || 'Alumni',
      alumni_phone: (alumniRecord.PhoneNumber || '').trim() || undefined,
      alumni_cohort: alumniRecord.ClassName || undefined,
    },
  });

  // Sign JWT
  const token = jwt.sign(
    { sub: profile.id, email: normalizedEmail, role: 'alumni' as const },
    env.jwtSecret,
    { expiresIn: '7d' },
  );

  return { token, profile };
}

// ── Profile ─────────────────────────────────────────────────────────────

export async function getProfile(profileId: string) {
  const profile = await AlumniReferralProfile.findByPk(profileId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  return profile;
}

export async function updateProfile(
  profileId: string,
  data: { alumni_phone?: string; alumni_cohort?: string },
) {
  const profile = await AlumniReferralProfile.findByPk(profileId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  const updates: Record<string, unknown> = {};
  if (data.alumni_phone) updates.alumni_phone = data.alumni_phone;
  if (data.alumni_cohort) updates.alumni_cohort = data.alumni_cohort;

  if (Object.keys(updates).length > 0) {
    await profile.update(updates);
  }
  return profile;
}

// ── Referral Submission ─────────────────────────────────────────────────

export async function submitReferral(
  profileId: string,
  data: {
    company_name: string;
    contact_name: string;
    contact_email: string;
    job_title?: string;
    referral_type: 'corporate_sponsor' | 'introduced' | 'anonymous';
  },
) {
  const profile = await AlumniReferralProfile.findByPk(profileId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  // Check for duplicate referral (same contact_email from same alumni)
  const existingReferral = await AlumniReferral.findOne({
    where: {
      profile_id: profileId,
      contact_email: data.contact_email.trim().toLowerCase(),
    },
  });
  if (existingReferral) {
    throw Object.assign(new Error('You have already referred this contact'), { statusCode: 409 });
  }

  // 1. Create referral record
  const referral = await AlumniReferral.create({
    profile_id: profileId,
    company_name: data.company_name.trim(),
    contact_name: data.contact_name.trim(),
    contact_email: data.contact_email.trim().toLowerCase(),
    job_title: data.job_title?.trim() || undefined,
    referral_type: data.referral_type,
    status: 'submitted',
  });

  // 2. Log referral_submitted event
  await ReferralActivityEvent.create({
    referral_id: referral.id,
    event_type: 'referral_submitted',
    metadata: { referral_type: data.referral_type, alumni_email: profile.alumni_email },
  });

  // 3. Create lead via existing lead system
  const source = data.referral_type === 'anonymous' ? 'alumni_referral_anonymous' : 'alumni_referral';
  const leadResult = await createLead({
    name: data.contact_name.trim(),
    email: data.contact_email.trim().toLowerCase(),
    company: data.company_name.trim(),
    title: data.job_title?.trim() || '',
    source,
    form_type: `referral_${data.referral_type}`,
    consent_contact: false,
  } as any);

  const lead = leadResult.lead;

  // 4. Update referral with lead_id
  await referral.update({ lead_id: lead.id, status: 'lead_created' });

  await ReferralActivityEvent.create({
    referral_id: referral.id,
    event_type: 'lead_created',
    metadata: { lead_id: lead.id, is_duplicate: leadResult.isDuplicate },
  });

  // 5. Find and assign campaign
  try {
    const campaignTypeMap: Record<string, string> = {
      corporate_sponsor: 'alumni',
      introduced: 'alumni',
      anonymous: 'cold_outbound',
    };
    const targetType = campaignTypeMap[data.referral_type];

    const campaign = await Campaign.findOne({
      where: { type: targetType, status: 'active' },
      order: [['created_at', 'DESC']],
    });

    if (campaign) {
      await enrollLeadsInCampaign(campaign.id, [lead.id]);
      await referral.update({ campaign_id: campaign.id, status: 'campaign_assigned' });

      await ReferralActivityEvent.create({
        referral_id: referral.id,
        event_type: 'campaign_assigned',
        metadata: { campaign_id: campaign.id, campaign_name: campaign.name },
      });
    }
  } catch (err: any) {
    // Non-blocking: campaign enrollment failure should not prevent referral creation
    console.error(`[AlumniReferral] Campaign enrollment failed for referral ${referral.id}:`, err.message);
  }

  // 6. Increment profile referral count
  await profile.update({
    total_referrals: (profile.total_referrals || 0) + 1,
    updated_at: new Date(),
  });

  return referral;
}

// ── Referral List ───────────────────────────────────────────────────────

export async function getReferrals(profileId: string) {
  const referrals = await AlumniReferral.findAll({
    where: { profile_id: profileId },
    include: [
      {
        model: ReferralActivityEvent,
        as: 'activityEvents',
        attributes: ['event_type', 'event_timestamp', 'metadata'],
        order: [['event_timestamp', 'DESC']],
        limit: 1,
        separate: true,
      },
      {
        model: ReferralCommission,
        as: 'commission',
        attributes: ['commission_amount', 'payment_status', 'created_at'],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  // Enrich with campaign lead status
  const enriched = await Promise.all(
    referrals.map(async (r) => {
      const plain = r.toJSON() as any;
      if (r.campaign_id && r.lead_id) {
        const campaignLead = await CampaignLead.findOne({
          where: { campaign_id: r.campaign_id, lead_id: r.lead_id },
          attributes: ['status', 'touchpoint_count', 'response_count', 'last_activity_at'],
        });
        plain.campaign_status = campaignLead?.status || null;
        plain.touchpoint_count = campaignLead?.touchpoint_count || 0;
        plain.last_activity_at = campaignLead?.last_activity_at || null;
      }
      return plain;
    }),
  );

  return enriched;
}

// ── Referral Timeline ───────────────────────────────────────────────────

export async function getReferralTimeline(referralId: string, profileId: string) {
  // Verify ownership
  const referral = await AlumniReferral.findOne({
    where: { id: referralId, profile_id: profileId },
  });
  if (!referral) throw Object.assign(new Error('Referral not found'), { statusCode: 404 });

  const events = await ReferralActivityEvent.findAll({
    where: { referral_id: referralId },
    order: [['event_timestamp', 'DESC']],
  });

  return events;
}

// ── Earnings ────────────────────────────────────────────────────────────

export async function getEarningsSummary(profileId: string) {
  const commissions = await ReferralCommission.findAll({
    where: { profile_id: profileId },
    include: [
      {
        model: AlumniReferral,
        as: 'referral',
        attributes: ['company_name', 'contact_name', 'referral_type'],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const summary = {
    total_earned: 0,
    total_pending: 0,
    total_paid: 0,
    commissions: commissions.map((c) => {
      const amount = Number(c.commission_amount) || 0;
      return { ...c.toJSON(), commission_amount: amount };
    }),
  };

  for (const c of commissions) {
    const amount = Number(c.commission_amount) || 0;
    summary.total_earned += amount;
    if (c.payment_status === 'paid') summary.total_paid += amount;
    else summary.total_pending += amount;
  }

  return summary;
}
