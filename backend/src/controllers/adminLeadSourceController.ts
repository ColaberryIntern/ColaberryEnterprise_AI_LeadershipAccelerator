import { Request, Response } from 'express';
import { LeadSource, EntryPoint, FormDefinition, RoutingRule, RawLeadPayload, Lead } from '../models';

/* --- LeadSource CRUD --- */

export async function listSources(_req: Request, res: Response) {
  const rows = await LeadSource.findAll({
    include: [{ model: EntryPoint, as: 'entryPoints' }],
    order: [['created_at', 'DESC']],
  });
  res.json({ sources: rows });
}

export async function createSource(req: Request, res: Response) {
  const { slug, name, domain, api_key_hash, hmac_secret, hmac_secret_prev, rate_limit, is_active } = req.body || {};
  if (!slug || !name || !domain) {
    res.status(400).json({ error: 'slug, name, and domain are required' });
    return;
  }
  try {
    const src = await LeadSource.create({
      slug, name, domain,
      api_key_hash: api_key_hash || null,
      hmac_secret: hmac_secret || null,
      hmac_secret_prev: hmac_secret_prev || null,
      rate_limit: rate_limit ?? null,
      is_active: is_active !== false,
    } as any);
    res.status(201).json({ source: src });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create source' });
  }
}

export async function updateSource(req: Request, res: Response) {
  const src = await LeadSource.findByPk(String(req.params.id));
  if (!src) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const allowed = ['name', 'domain', 'api_key_hash', 'hmac_secret', 'hmac_secret_prev', 'rate_limit', 'is_active'];
  const updates: Record<string, any> = { updated_at: new Date() };
  for (const k of allowed) if (req.body?.[k] !== undefined) updates[k] = req.body[k];
  await src.update(updates as any);
  res.json({ source: src });
}

export async function deleteSource(req: Request, res: Response) {
  const src = await LeadSource.findByPk(String(req.params.id));
  if (!src) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  await src.update({ is_active: false, updated_at: new Date() } as any);
  res.json({ success: true });
}

/* --- EntryPoint CRUD --- */

export async function createEntryPoint(req: Request, res: Response) {
  const sourceId = String(req.params.id);
  const src = await LeadSource.findByPk(sourceId);
  if (!src) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const { slug, name, page, form_name, description, is_active } = req.body || {};
  if (!slug) {
    res.status(400).json({ error: 'slug is required' });
    return;
  }
  try {
    const ep = await EntryPoint.create({
      source_id: sourceId, slug,
      name: name || null,
      page: page || null,
      form_name: form_name || null,
      description: description || null,
      is_active: is_active !== false,
    } as any);
    res.status(201).json({ entry_point: ep });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create entry point' });
  }
}

export async function updateEntryPoint(req: Request, res: Response) {
  const ep = await EntryPoint.findByPk(String(req.params.entryId));
  if (!ep) {
    res.status(404).json({ error: 'Entry point not found' });
    return;
  }
  const allowed = ['name', 'page', 'form_name', 'description', 'is_active'];
  const updates: Record<string, any> = { updated_at: new Date() };
  for (const k of allowed) if (req.body?.[k] !== undefined) updates[k] = req.body[k];
  await ep.update(updates as any);
  res.json({ entry_point: ep });
}

export async function deleteEntryPoint(req: Request, res: Response) {
  const ep = await EntryPoint.findByPk(String(req.params.entryId));
  if (!ep) {
    res.status(404).json({ error: 'Entry point not found' });
    return;
  }
  await ep.update({ is_active: false, updated_at: new Date() } as any);
  res.json({ success: true });
}

/* --- FormDefinition CRUD --- */

export async function listFormDefinitions(req: Request, res: Response) {
  const where: Record<string, any> = {};
  if (req.query.entry_point_id) where.entry_point_id = req.query.entry_point_id;
  const rows = await FormDefinition.findAll({ where, order: [['version', 'DESC']] });
  res.json({ form_definitions: rows });
}

export async function createFormDefinition(req: Request, res: Response) {
  const { entry_point_id, field_map, required_fields, version, is_active } = req.body || {};
  if (!entry_point_id || !field_map) {
    res.status(400).json({ error: 'entry_point_id and field_map are required' });
    return;
  }
  try {
    const fd = await FormDefinition.create({
      entry_point_id, field_map,
      required_fields: required_fields || ['email'],
      version: version || 1,
      is_active: is_active !== false,
    } as any);
    res.status(201).json({ form_definition: fd });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create form definition' });
  }
}

export async function updateFormDefinition(req: Request, res: Response) {
  const fd = await FormDefinition.findByPk(String(req.params.id));
  if (!fd) {
    res.status(404).json({ error: 'Form definition not found' });
    return;
  }
  const allowed = ['field_map', 'required_fields', 'version', 'is_active'];
  const updates: Record<string, any> = { updated_at: new Date() };
  for (const k of allowed) if (req.body?.[k] !== undefined) updates[k] = req.body[k];
  await fd.update(updates as any);
  res.json({ form_definition: fd });
}

export async function deleteFormDefinition(req: Request, res: Response) {
  const fd = await FormDefinition.findByPk(String(req.params.id));
  if (!fd) {
    res.status(404).json({ error: 'Form definition not found' });
    return;
  }
  await fd.update({ is_active: false, updated_at: new Date() } as any);
  res.json({ success: true });
}

/* --- RoutingRule CRUD --- */

export async function listRoutingRules(_req: Request, res: Response) {
  const rows = await RoutingRule.findAll({ order: [['priority', 'ASC'], ['created_at', 'DESC']] });
  res.json({ routing_rules: rows });
}

export async function createRoutingRule(req: Request, res: Response) {
  const { name, priority, conditions, actions, continue_on_match, is_active } = req.body || {};
  if (!name || !conditions || !actions) {
    res.status(400).json({ error: 'name, conditions, and actions are required' });
    return;
  }
  try {
    const rr = await RoutingRule.create({
      name,
      priority: priority ?? 100,
      conditions,
      actions,
      continue_on_match: !!continue_on_match,
      is_active: is_active !== false,
    } as any);
    res.status(201).json({ routing_rule: rr });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create routing rule' });
  }
}

export async function updateRoutingRule(req: Request, res: Response) {
  const rr = await RoutingRule.findByPk(String(req.params.id));
  if (!rr) {
    res.status(404).json({ error: 'Routing rule not found' });
    return;
  }
  const allowed = ['name', 'priority', 'conditions', 'actions', 'continue_on_match', 'is_active'];
  const updates: Record<string, any> = { updated_at: new Date() };
  for (const k of allowed) if (req.body?.[k] !== undefined) updates[k] = req.body[k];
  await rr.update(updates as any);
  res.json({ routing_rule: rr });
}

export async function deleteRoutingRule(req: Request, res: Response) {
  const rr = await RoutingRule.findByPk(String(req.params.id));
  if (!rr) {
    res.status(404).json({ error: 'Routing rule not found' });
    return;
  }
  await rr.destroy();
  res.json({ success: true });
}

/* --- RawLeadPayload (read-only log) --- */

export async function listIngestLogs(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const where: Record<string, any> = {};
  if (req.query.source_slug) where.source_slug = req.query.source_slug;
  if (req.query.entry_slug) where.entry_slug = req.query.entry_slug;
  if (req.query.status) where.status = req.query.status;
  const rows = await RawLeadPayload.findAll({
    where,
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name', 'email'] }],
    order: [['received_at', 'DESC']],
    limit,
  });
  res.json({ logs: rows });
}

export async function getIngestLog(req: Request, res: Response) {
  const row = await RawLeadPayload.findByPk(String(req.params.id), {
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name', 'email'] }],
  });
  if (!row) {
    res.status(404).json({ error: 'Raw payload not found' });
    return;
  }
  res.json({ log: row });
}
