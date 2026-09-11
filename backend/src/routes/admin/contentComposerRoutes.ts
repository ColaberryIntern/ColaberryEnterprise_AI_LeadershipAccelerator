import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { ContentItem } from '../../models';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { PROVIDER_KEYS, decidePublishMode, getProviderCapabilities } from '../../services/publishing/providerCapabilities';
import { CONTENT_ITEM_STATUSES } from '../../models/ContentItem';
import {
  editItemVariant,
  generateItemVariants,
  revertItemVariant,
  validateItem,
} from '../../services/content/composerService';
import { assertWritable, transitionContentItem, WorkflowError } from '../../services/content/contentWorkflowService';
import { generateItemLinks } from '../../services/content/composerLinkService';
import { buildItemConfirmation } from '../../services/content/composerConfirmationService';
import { COMPOSER_ACTIONS, runComposerAction, type ComposerAction } from '../../services/content/composerActionService';
import { APPROVAL_DECISIONS, decideApproval, type ApprovalDecision } from '../../services/content/contentApprovalService';

/**
 * Marketing content composer API — spec 8.1 steps 1-7: draft, variants, validation.
 *
 * Named contentComposerRoutes because composerRoutes.ts already exists and is the CURRICULUM
 * composer (Experience Studio, /api/admin/composer, section 'program'). Different product,
 * different section, and the two must never be confused - so this one lives under
 * /api/admin/content and is mapped to 'campaigns' in mgmtSectionGate.
 *
 * Every body is Zod-validated before any service runs. Every item is resolved through the
 * tenant scope BEFORE it is read, for the reason brandRoutes gives: the services take a bare
 * id and check nothing.
 */

const router = Router();
const UUID = z.string().uuid();
const providerSchema = z.enum(PROVIDER_KEYS as unknown as [string, ...string[]]);
const contentTypeSchema = z.enum(['text', 'image', 'video', 'carousel', 'thread', 'link']);

const CreateDraftSchema = z.object({
  brand_id: UUID,
  campaign_id: UUID.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  canonical_body: z.string().max(20000).default(''),
  content_type: contentTypeSchema.default('text'),
  // Governance inputs the check needs that the row does not otherwise carry.
  is_paid: z.boolean().default(false),
  has_offer: z.boolean().default(false),
  kinds: z.array(z.string()).default([]),
}).strict();

const UpdateDraftSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  canonical_body: z.string().max(20000).optional(),
  content_type: contentTypeSchema.optional(),
  scheduled_for: z.string().datetime().nullable().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const GenerateSchema = z.object({ providers: z.array(providerSchema).min(1) }).strict();
const EditVariantSchema = z.object({ text: z.string().max(20000) }).strict();
const TransitionSchema = z.object({ to: z.enum(CONTENT_ITEM_STATUSES as unknown as [string, ...string[]]) }).strict();
// Shape only. The allowlist check needs the brand domains and runs in the service (422).
const LinksSchema = z.object({ destination_url: z.string().trim().url().max(2048) }).strict();
const ActionSchema = z.object({
  action: z.enum(COMPOSER_ACTIONS as unknown as [string, ...string[]]),
  scheduled_for: z.string().datetime({ offset: true }).optional(),
}).strict();
const ApprovalSchema = z.object({
  decision: z.enum(APPROVAL_DECISIONS as unknown as [string, ...string[]]),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict();
const ListSchema = z.object({
  brand_id: UUID.optional(),
  status: z.enum(CONTENT_ITEM_STATUSES as unknown as [string, ...string[]]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

const NOT_FOUND = { error: 'Not found', error_class: 'NotFound' };

function bad(res: Response, details: unknown): void {
  res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details });
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof WorkflowError) {
    res.status(err.status).json({ error: err.message, error_class: err.errorClass });
    return;
  }
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'content', event, outcome: 'failure',
    error_class: e?.name ?? 'Error', context: { message: String(e?.message ?? e).slice(0, 200) },
  }));
  res.status(500).json({ error: 'Composer operation failed', error_class: 'InternalError' });
}

/** Load an item the caller may see, or null - a 404 for foreign tenants, never a 403. */
async function visibleItem(req: Request, id: string): Promise<ContentItem | null> {
  const scope = await adminTenantScope(req.admin);
  const item = await ContentItem.findByPk(id);
  if (!item || !scopeAllows(scope, item.tenant_id)) return null;
  return item;
}

router.post('/api/admin/content', requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateDraftSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') return void res.status(404).json(NOT_FOUND);

    // The brand fixes the tenant. Resolved server-side, never taken from the body.
    const { Brand } = await import('../../models');
    const brand = await Brand.findByPk(parsed.data.brand_id);
    if (!brand || !scopeAllows(scope, brand.tenant_id)) return void res.status(404).json({ error: 'Brand not found', error_class: 'NotFound' });

    const item = await ContentItem.create({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      campaign_id: parsed.data.campaign_id ?? null,
      title: parsed.data.title,
      canonical_body: parsed.data.canonical_body,
      content_type: parsed.data.content_type,
      status: 'draft',
      created_by: req.admin?.email ?? null,
      metadata: { isPaid: parsed.data.is_paid, hasOffer: parsed.data.has_offer, kinds: parsed.data.kinds },
    } as any);
    res.status(201).json({ item });
  } catch (err) { fail(res, err, 'composer_create_failed'); }
});

// The channel picker reads limits and publish mode from the registry, so the frontend never
// carries a second copy of X's 280 - the same reason composerValidation reads nothing else.
router.get('/api/admin/content/providers', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    providers: PROVIDER_KEYS.map((key) => {
      const caps = getProviderCapabilities(key);
      const decision = decidePublishMode(caps, 'publish');
      return {
        provider: key,
        displayName: caps.displayName,
        contentTypes: caps.contentTypes,
        maxChars: caps.text.maxChars,
        linkBehavior: caps.linkBehavior,
        mode: decision.mode,
        reasons: decision.mode === 'handoff' ? decision.reasons : [],
        asOf: caps.asOf,
      };
    }),
  });
});

router.get('/api/admin/content', requireAdmin, async (req: Request, res: Response) => {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') return void res.json({ items: [], scope_mode: scope.mode });
    const where: Record<string, unknown> = { archived_at: null };
    if (scope.mode === 'scoped') where.tenant_id = scope.tenantIds;
    if (parsed.data.brand_id) where.brand_id = parsed.data.brand_id;
    if (parsed.data.status) where.status = parsed.data.status;
    const items = await ContentItem.findAll({ where, order: [['updated_at', 'DESC']], limit: parsed.data.limit });
    res.json({ items, scope_mode: scope.mode });
  } catch (err) { fail(res, err, 'composer_list_failed'); }
});

router.get('/api/admin/content/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  try {
    const item = await visibleItem(req, id.data);
    if (!item) return void res.status(404).json(NOT_FOUND);
    const { ContentVariant } = await import('../../models');
    const variants = await ContentVariant.findAll({ where: { content_item_id: item.id }, order: [['provider', 'ASC']] });
    res.json({ item, variants });
  } catch (err) { fail(res, err, 'composer_read_failed'); }
});

router.patch('/api/admin/content/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = UpdateDraftSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const item = await visibleItem(req, id.data);
    if (!item) return void res.status(404).json(NOT_FOUND);
    assertWritable(item);
    const { scheduled_for, ...rest } = parsed.data;
    await item.update({
      ...rest,
      ...(scheduled_for !== undefined ? { scheduled_for: scheduled_for ? new Date(scheduled_for) : null } : {}),
      revision: (item.revision ?? 0) + 1,
    } as any);
    res.json({ item });
  } catch (err) { fail(res, err, 'composer_update_failed'); }
});

router.post('/api/admin/content/:id/variants/generate', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    const variants = await generateItemVariants(id.data, parsed.data.providers as any);
    res.json({ variants });
  } catch (err) { fail(res, err, 'composer_generate_failed'); }
});

router.patch('/api/admin/content/:id/variants/:provider', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  const provider = providerSchema.safeParse(req.params.provider);
  if (!id.success || !provider.success) return bad(res, { id: id.success, provider: provider.success });
  const parsed = EditVariantSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    const variant = await editItemVariant(id.data, provider.data as any, parsed.data.text, req.admin?.email ?? null);
    res.json({ variant });
  } catch (err) { fail(res, err, 'composer_edit_failed'); }
});

router.post('/api/admin/content/:id/variants/:provider/revert', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  const provider = providerSchema.safeParse(req.params.provider);
  if (!id.success || !provider.success) return bad(res, { id: id.success, provider: provider.success });
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    res.json({ variant: await revertItemVariant(id.data, provider.data as any) });
  } catch (err) { fail(res, err, 'composer_revert_failed'); }
});

router.post('/api/admin/content/:id/validate', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    res.json(await validateItem(id.data));
  } catch (err) { fail(res, err, 'composer_validate_failed'); }
});

router.post('/api/admin/content/:id/transition', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = TransitionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    const { item, result } = await transitionContentItem(id.data, parsed.data.to as any);
    res.json({ item, result });
  } catch (err) { fail(res, err, 'composer_transition_failed'); }
});

router.post('/api/admin/content/:id/links', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = LinksSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    res.json({ links: await generateItemLinks(id.data, parsed.data.destination_url.trim(), req.admin?.email ?? null) });
  } catch (err) { fail(res, err, 'composer_links_failed'); }
});

router.get('/api/admin/content/:id/confirmation', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    res.json({ confirmation: await buildItemConfirmation(id.data) });
  } catch (err) { fail(res, err, 'composer_confirmation_failed'); }
});

router.post('/api/admin/content/:id/action', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = ActionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    const actor = { adminId: req.admin?.sub ?? null, email: req.admin?.email ?? null };
    const when = parsed.data.scheduled_for ? new Date(parsed.data.scheduled_for) : null;
    const result = await runComposerAction(id.data, parsed.data.action as ComposerAction, actor, when);
    res.json({
      action: result.action,
      item: result.item,
      approval_request_id: result.approvalRequestId,
      jobs: result.jobs,
      validation: result.validation ? { ok: result.validation.ok, blockers: result.validation.providers.blockers } : null,
    });
  } catch (err) { fail(res, err, 'composer_action_failed'); }
});

// The reviewer's decision. Separate from /action because a different person makes it: the
// author sends for approval, the reviewer decides, and the audit trail keeps them apart.
router.post('/api/admin/content/:id/approval', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = ApprovalSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    if (!(await visibleItem(req, id.data))) return void res.status(404).json(NOT_FOUND);
    const actor = { adminId: req.admin?.sub ?? null, email: req.admin?.email ?? null };
    const { item, request } = await decideApproval(id.data, parsed.data.decision as ApprovalDecision, actor, parsed.data.note ?? null);
    res.json({ item, request });
  } catch (err) { fail(res, err, 'composer_approval_failed'); }
});

export default router;
