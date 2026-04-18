import { Request, Response } from 'express';
import { readInsights, runInsightsJob, markApplied, IngestInsight } from '../jobs/autonomousIngestInsights';
import { RoutingRule, EventLedger, FormDefinition } from '../models';

const AUTOAPPLY = process.env.AUTONOMOUS_AUTOAPPLY === 'true';

export async function listInsights(_req: Request, res: Response) {
  const list = readInsights();
  res.json({ insights: list, autoapply: AUTOAPPLY });
}

export async function refreshInsights(_req: Request, res: Response) {
  try {
    const list = await runInsightsJob();
    res.json({ insights: list, autoapply: AUTOAPPLY });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to refresh' });
  }
}

async function applySuggestedRoutingRule(insight: IngestInsight): Promise<Record<string, any>> {
  const cfg = insight.suggested_config as any;
  const created = await RoutingRule.create({
    name: cfg.name,
    priority: cfg.priority ?? 200,
    conditions: cfg.conditions || {},
    actions: cfg.actions || [],
    continue_on_match: !!cfg.continue_on_match,
    is_active: cfg.is_active !== false,
  } as any);
  return { routing_rule_id: created.id };
}

async function applySuggestedFieldMapEntry(insight: IngestInsight): Promise<Record<string, any>> {
  const cfg = insight.suggested_config as any;
  if (!cfg?.entry_point_id || !cfg?.field_map_entry) {
    throw new Error('Invalid field-map suggestion payload');
  }
  const current = await FormDefinition.findOne({
    where: { entry_point_id: cfg.entry_point_id, is_active: true },
    order: [['version', 'DESC']],
  });
  if (!current) throw new Error('No active form definition for this entry point');

  const newMap = { ...(current.field_map as Record<string, string>), ...cfg.field_map_entry };
  await current.update({ is_active: false, updated_at: new Date() } as any);
  const next = await FormDefinition.create({
    entry_point_id: cfg.entry_point_id,
    field_map: newMap,
    required_fields: current.required_fields,
    version: (current.version || 1) + 1,
    is_active: true,
  } as any);
  return { form_definition_id: next.id, new_version: next.version };
}

export async function applyInsight(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const list = readInsights();
    const insight = list.find(i => i.id === id);
    if (!insight) {
      res.status(404).json({ error: 'Insight not found' });
      return;
    }
    if (insight.applied) {
      res.status(400).json({ error: 'Insight already applied' });
      return;
    }

    let result: Record<string, any> = {};
    if (insight.type === 'suggest_routing_rule') {
      result = await applySuggestedRoutingRule(insight);
    } else if (insight.type === 'suggest_field_map_entry') {
      result = await applySuggestedFieldMapEntry(insight);
    } else {
      res.status(400).json({ error: `No apply handler for insight type: ${insight.type}` });
      return;
    }

    markApplied(id);

    await EventLedger.create({
      event_type: 'autonomous_insight.applied',
      actor: (req as any).user?.email || 'admin',
      entity_type: 'ingest_insight',
      entity_id: id,
      payload: { insight_type: insight.type, suggested_config: insight.suggested_config, result },
    } as any);

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to apply' });
  }
}
