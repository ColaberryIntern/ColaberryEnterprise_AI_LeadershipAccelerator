import crypto from 'crypto';
import { Op } from 'sequelize';
import { Lead } from '../models';
import Sponsor from '../models/Sponsor';
import { sendSponsorMagicLink } from './emailService';

// Door B (employer sponsor) portal auth. Replaces the sponsor.id-as-token
// stopgap in challengeController (see REAL-AUTH FOLLOW-UP note there) with a
// real magic-link: a random, expiring, emailed-only secret — never returned
// directly from an unauthenticated request. Same primitive as the
// participant flow (services/participantService.ts::requestMagicLink).
const MAGIC_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// No enumeration signal either way: an unknown email or a lead with no
// sponsor account silently no-ops, same outward response as success.
export async function requestSponsorPortalLink(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const lead = await Lead.findOne({ where: { email: normalized } });
  if (!lead) return;

  const sponsor = await Sponsor.findOne({ where: { contact_lead_id: lead.id } });
  if (!sponsor) return;

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
  await sponsor.update({
    portal_token: token,
    portal_token_expires_at: expiresAt,
    updated_at: new Date(),
  });

  await sendSponsorMagicLink({
    to: lead.email,
    contactName: lead.name || 'there',
    companyName: sponsor.company_name,
    token,
  });
}

export interface SponsorPortalSession {
  sponsor_id: string;
  access_token: string;
  company_name: string;
}

// Keep the token reusable — don't rotate it on verify. Expiry alone bounds
// its life, same as the participant portal, so a sponsor can bookmark the
// dashboard URL.
export async function verifySponsorPortalToken(token: string): Promise<SponsorPortalSession | null> {
  const sponsor = await Sponsor.findOne({
    where: {
      portal_token: token,
      portal_token_expires_at: { [Op.gt]: new Date() },
    },
  });
  if (!sponsor) return null;

  return {
    sponsor_id: sponsor.id,
    access_token: sponsor.portal_token!,
    company_name: sponsor.company_name,
  };
}

// Used by challengeController's dashboard gate. A sponsor with no token yet
// (never requested a link) or an expired one is never authorized — there is
// no fallback to sponsor.id.
export function isValidSponsorToken(sponsor: Sponsor, provided?: string | null): boolean {
  if (!provided || !sponsor.portal_token || !sponsor.portal_token_expires_at) return false;
  if (sponsor.portal_token_expires_at.getTime() <= Date.now()) return false;
  return provided === sponsor.portal_token;
}
