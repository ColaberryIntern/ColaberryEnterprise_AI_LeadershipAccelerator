import { Request, Response, NextFunction } from 'express';
import {
  createICPProfile,
  updateICPProfile,
  deleteICPProfile,
  getICPProfile,
  listICPProfiles,
  searchApolloFromProfile,
  refreshProfileStats,
  getProfileRecommendations,
  applyRecommendation,
  searchAndEnrollFromProfile,
} from '../services/icpProfileService';
import {
  buildColdCampaign,
  getSequenceTemplates,
} from '../services/campaignBuilderService';

// ── ICP Profile CRUD ────────────────────────────────────────────────────

export async function handleCreateICPProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profile = await createICPProfile({
      ...req.body,
      created_by: (req as any).admin?.id,
    });
    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
}

export async function handleListICPProfiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaignId = req.query.campaign_id as string | undefined;
    const profiles = await listICPProfiles(campaignId);
    res.json({ profiles });
  } catch (error) {
    next(error);
  }
}

export async function handleGetICPProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profile = await getICPProfile(req.params.id as string);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateICPProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profile = await updateICPProfile(req.params.id as string, req.body);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
}

export async function handleDeleteICPProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteICPProfile(req.params.id as string);
    res.json({ message: 'ICP Profile deleted' });
  } catch (error) {
    next(error);
  }
}

// ── ICP → Apollo ────────────────────────────────────────────────────────

export async function handleSearchApolloFromProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = parseInt(req.body.page as string, 10) || 1;
    const perPage = parseInt(req.body.per_page as string, 10) || 25;
    const result = await searchApolloFromProfile(req.params.id as string, page, perPage);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleRefreshProfileStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profile = await refreshProfileStats(req.params.id as string);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
}

// ── ICP Search + Import + Enroll ─────────────────────────────────────────

export async function handleSearchAndEnroll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profileId = req.params.id as string;
    const { campaign_id, max_leads } = req.body;
    if (!campaign_id) {
      res.status(400).json({ error: 'campaign_id is required' });
      return;
    }
    const result = await searchAndEnrollFromProfile(
      profileId,
      campaign_id,
      max_leads || 100,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ── ICP Recommendations ─────────────────────────────────────────────────

export async function handleGetProfileRecommendations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getProfileRecommendations(req.params.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleApplyRecommendation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profile = await applyRecommendation(req.params.id as string, req.body);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
}

// ── Campaign Builder ────────────────────────────────────────────────────

export async function handleBuildColdCampaign(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await buildColdCampaign({
      ...req.body,
      created_by: (req as any).admin?.id,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleGetSequenceTemplates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const templates = getSequenceTemplates();
    res.json({ templates });
  } catch (error) {
    next(error);
  }
}
