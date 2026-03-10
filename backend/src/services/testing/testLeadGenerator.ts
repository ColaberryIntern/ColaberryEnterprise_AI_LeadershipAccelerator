import { Lead } from '../../models';
import { getTestOverrides } from '../settingsService';

/**
 * Create or reuse a synthetic test lead for campaign testing.
 * Uses the admin test email/phone from global test overrides.
 */
export async function createTestLead(campaignId: string): Promise<InstanceType<typeof Lead>> {
  const testOverrides = await getTestOverrides();
  const testEmail = testOverrides.email || 'test@colaberry.com';
  const testPhone = testOverrides.phone || '';

  // Reuse existing lead with this email (regardless of source)
  const existing = await Lead.findOne({
    where: { email: testEmail },
  });

  if (existing) {
    return existing;
  }

  const lead = await Lead.create({
    name: 'Campaign Test Lead',
    email: testEmail,
    phone: testPhone,
    company: 'Test Corp',
    title: 'QA Test Lead',
    industry: 'Technology',
    source: 'campaign_test',
    status: 'new',
    pipeline_stage: 'new_lead',
    lead_source_type: 'warm',
    lead_temperature: 'warm',
    interest_area: 'Enterprise AI',
    consent_contact: true,
  });

  return lead;
}
