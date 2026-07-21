import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  registerManager, inviteMembers, getOverview, getRoster, getMemberDetail, getFeed,
} from '../services/orgService';

// ── Validation schemas (Zod v4 — read .issues, not .errors) ──────────────────

const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  company: z.string().trim().max(255).optional(),
  email: z.string().trim().toLowerCase().email('a valid email is required'),
});

const InvitesSchema = z.object({
  emails: z.array(z.string().trim().email()).min(1, 'at least one email is required'),
  team: z.string().trim().max(120).optional(),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

/** PUBLIC — register a free management account (dual account: manager + org). */
export async function handleOrgRegister(req: Request, res: Response, next: NextFunction) {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  try {
    const result = await registerManager(parsed.data);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

/** Manager invites teammates (free member accounts, tagged with a team). */
export async function handleOrgInvites(req: Request, res: Response, next: NextFunction) {
  const parsed = InvitesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  try {
    const members = await inviteMembers(req.org!.id, req.participant!.sub, parsed.data);
    res.status(201).json({ members });
  } catch (err) { next(err); }
}

export async function handleOrgOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const overview = await getOverview(req.org!.id);
    res.json(overview);
  } catch (err) { next(err); }
}

export async function handleOrgRoster(req: Request, res: Response, next: NextFunction) {
  try {
    const roster = await getRoster(req.org!.id);
    res.json({ members: roster });
  } catch (err) { next(err); }
}

export async function handleOrgMemberDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const detail = await getMemberDetail(req.org!.id, req.params.enrollmentId as string);
    res.json(detail);
  } catch (err: any) {
    if (err?.status === 404) {
      res.status(404).json({ error: 'Member not found in your organization' });
      return;
    }
    next(err);
  }
}

export async function handleOrgFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const feed = await getFeed(req.org!.id);
    res.json({ feed });
  } catch (err) { next(err); }
}
