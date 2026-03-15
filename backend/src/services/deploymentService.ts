import { Op } from 'sequelize';
import CampaignDeployment from '../models/CampaignDeployment';
import LandingPage from '../models/LandingPage';
import Campaign from '../models/Campaign';

const BASE_URL = process.env.BASE_URL || 'https://enterprise.colaberry.ai';

// ── Landing Pages ───────────────────────────────────────────────────────

const SEED_PAGES = [
  { name: 'Home Page', path: '/' },
  { name: 'Program Overview', path: '/program' },
  { name: 'Pricing', path: '/pricing' },
  { name: 'Enrollment', path: '/enroll' },
  { name: 'Strategy Call Prep', path: '/strategy-call-prep' },
  { name: 'ROI Calculator', path: '/executive-roi-calculator' },
  { name: 'Sponsorship', path: '/sponsorship' },
  { name: 'Advisory', path: '/advisory' },
  { name: 'Case Studies', path: '/case-studies' },
  { name: 'Contact', path: '/contact' },
  { name: 'Alumni Champion', path: '/alumni-ai-champion' },
];

export async function seedLandingPages() {
  for (const page of SEED_PAGES) {
    await LandingPage.findOrCreate({
      where: { path: page.path },
      defaults: { ...page, is_marketing_enabled: true },
    });
  }
}

export async function listLandingPages(marketingOnly = false) {
  const where = marketingOnly ? { is_marketing_enabled: true } : {};
  return LandingPage.findAll({ where, order: [['name', 'ASC']] });
}

export async function updateLandingPage(
  id: string,
  data: { is_marketing_enabled?: boolean; conversion_event?: string; name?: string },
) {
  const page = await LandingPage.findByPk(id);
  if (!page) throw Object.assign(new Error('Landing page not found'), { statusCode: 404 });
  const updates: Record<string, unknown> = {};
  if (data.is_marketing_enabled !== undefined) updates.is_marketing_enabled = data.is_marketing_enabled;
  if (data.conversion_event !== undefined) updates.conversion_event = data.conversion_event;
  if (data.name !== undefined) updates.name = data.name;
  if (Object.keys(updates).length > 0) await page.update(updates);
  return page;
}

// ── Deployments ─────────────────────────────────────────────────────────

export async function listDeployments() {
  return CampaignDeployment.findAll({
    include: [
      { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'type', 'status'] },
      { model: LandingPage, as: 'landingPage', attributes: ['id', 'name', 'path'] },
    ],
    order: [['created_at', 'DESC']],
  });
}

export async function createDeployment(data: {
  campaign_id: string;
  landing_page_id?: string;
  channel?: string;
  budget?: number;
}) {
  const campaign = await Campaign.findByPk(data.campaign_id);
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  if (campaign.status !== 'active') {
    throw Object.assign(
      new Error(`Cannot create deployment for campaign in '${campaign.status}' state`),
      { statusCode: 409 },
    );
  }

  let landingPage: LandingPage | null = null;
  if (data.landing_page_id) {
    landingPage = await LandingPage.findByPk(data.landing_page_id);
  }

  const deployment = await CampaignDeployment.create({
    campaign_id: data.campaign_id,
    landing_page_id: data.landing_page_id || null,
    channel: data.channel || campaign.channel || 'email',
    utm_source: data.channel || campaign.channel || 'email',
    utm_medium: campaign.type,
    utm_campaign: campaign.id,
    budget: data.budget || null,
  } as any);

  // Generate tracking link on campaign if it has a destination path
  if (landingPage) {
    const trackingLink = `${BASE_URL}${landingPage.path}?utm_source=${deployment.utm_source}&utm_medium=${deployment.utm_medium}&utm_campaign=${campaign.id}&cid=${campaign.id}`;
    await campaign.update({ tracking_link: trackingLink, destination_path: landingPage.path });
  }

  return deployment.reload({
    include: [
      { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'type', 'status'] },
      { model: LandingPage, as: 'landingPage', attributes: ['id', 'name', 'path'] },
    ],
  });
}

export async function updateDeployment(
  id: string,
  data: { status?: string; budget?: number; landing_page_id?: string },
) {
  const deployment = await CampaignDeployment.findByPk(id);
  if (!deployment) throw Object.assign(new Error('Deployment not found'), { statusCode: 404 });
  const updates: Record<string, unknown> = {};
  if (data.status) updates.status = data.status;
  if (data.budget !== undefined) updates.budget = data.budget;
  if (data.landing_page_id !== undefined) updates.landing_page_id = data.landing_page_id;
  if (Object.keys(updates).length > 0) await deployment.update(updates);
  return deployment;
}

export async function deleteDeployment(id: string) {
  const deployment = await CampaignDeployment.findByPk(id);
  if (!deployment) throw Object.assign(new Error('Deployment not found'), { statusCode: 404 });
  await deployment.destroy();
  return true;
}

// ── Migration helper ────────────────────────────────────────────────────

export async function migrateExistingCampaigns() {
  const campaigns = await Campaign.findAll({
    where: {
      [Op.or]: [
        { destination_path: { [Op.ne]: null } },
        { tracking_link: { [Op.ne]: null } },
      ],
    } as any,
  });

  let migrated = 0;
  for (const campaign of campaigns) {
    // Skip if deployment already exists
    const existing = await CampaignDeployment.findOne({
      where: { campaign_id: campaign.id },
    });
    if (existing) continue;

    // Find or create landing page
    let landingPageId: string | null = null;
    if (campaign.destination_path) {
      const [page] = await LandingPage.findOrCreate({
        where: { path: campaign.destination_path },
        defaults: {
          name: campaign.destination_path,
          path: campaign.destination_path,
          is_marketing_enabled: true,
        },
      });
      landingPageId = page.id;
    }

    await CampaignDeployment.create({
      campaign_id: campaign.id,
      landing_page_id: landingPageId,
      channel: campaign.channel || 'email',
      utm_source: campaign.channel || 'email',
      utm_medium: campaign.type,
      utm_campaign: campaign.id,
      budget: campaign.budget_cap || null,
    } as any);

    migrated++;
  }

  return { migrated, total: campaigns.length };
}
