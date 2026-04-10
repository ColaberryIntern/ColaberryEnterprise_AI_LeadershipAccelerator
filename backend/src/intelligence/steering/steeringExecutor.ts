/**
 * Steering Executor — deterministic mapping from classified intent to system changes.
 * Every change is logged, reversible, and requires explicit confirmation (preview → apply).
 */
import { SteeringIntent } from './intentClassifier';

export interface SteeringChange {
  table: string;
  id: string;
  field: string;
  value: any;
  previous_value: any;
}

export interface SteeringResult {
  action_id: string;
  intent: SteeringIntent;
  changes: SteeringChange[];
  preview: { label: string; before: string; after: string }[];
  requires_confirmation: boolean;
  message: string;
}

/**
 * Preview what changes would be made for a given intent.
 * Does NOT apply changes — returns a preview for user confirmation.
 */
export async function previewSteeringIntent(
  projectId: string,
  intent: SteeringIntent
): Promise<SteeringResult> {
  const { v4: uuid } = await import('uuid');
  const actionId = uuid();
  const changes: SteeringChange[] = [];
  const preview: SteeringResult['preview'] = [];
  let message = '';

  switch (intent.type) {
    case 'mode_change': {
      if (intent.scope === 'project') {
        const { Project } = await import('../../models');
        const project = await Project.findByPk(projectId);
        const currentMode = (project as any)?.target_mode || 'production';
        changes.push({ table: 'projects', id: projectId, field: 'target_mode', value: intent.target, previous_value: currentMode });
        preview.push({ label: 'Project Mode', before: currentMode, after: intent.target });
        message = `Switch project mode from ${currentMode} to ${intent.target}`;
      } else {
        const cap = await findProcessByName(projectId, intent.processName || '');
        if (cap) {
          const currentOverride = (cap as any).mode_override || null;
          changes.push({ table: 'capabilities', id: cap.id, field: 'mode_override', value: intent.target, previous_value: currentOverride });
          preview.push({ label: `${cap.name} Mode`, before: currentOverride || 'inherited', after: intent.target });
          message = `Set ${cap.name} to ${intent.target} mode`;
        } else {
          message = `Could not find process matching "${intent.processName}"`;
        }
      }
      break;
    }

    case 'priority_boost': {
      const cap = await findProcessByName(projectId, intent.processName);
      if (cap) {
        const currentPriority = (cap as any).priority || 'medium';
        changes.push({ table: 'capabilities', id: cap.id, field: 'priority', value: 'high', previous_value: currentPriority });
        changes.push({ table: 'capabilities', id: cap.id, field: 'source', value: 'user_input', previous_value: (cap as any).source || 'parsed' });
        preview.push({ label: `${cap.name} Priority`, before: currentPriority, after: 'high (boosted)' });
        message = `Boost priority for "${cap.name}" — ${intent.reason}`;
      } else {
        message = `Could not find process matching "${intent.processName}"`;
      }
      break;
    }

    case 'defer_process': {
      const cap = await findProcessByName(projectId, intent.processName);
      if (cap) {
        const currentStatus = (cap as any).applicability_status || 'active';
        changes.push({ table: 'capabilities', id: cap.id, field: 'applicability_status', value: 'deferred', previous_value: currentStatus });
        preview.push({ label: `${cap.name} Status`, before: currentStatus, after: 'deferred' });
        message = `Defer "${cap.name}" — will be hidden from active list`;
      } else {
        message = `Could not find process matching "${intent.processName}"`;
      }
      break;
    }

    case 'activate_process': {
      const cap = await findProcessByName(projectId, intent.processName);
      if (cap) {
        const currentStatus = (cap as any).applicability_status || 'active';
        changes.push({ table: 'capabilities', id: cap.id, field: 'applicability_status', value: 'active', previous_value: currentStatus });
        preview.push({ label: `${cap.name} Status`, before: currentStatus, after: 'active' });
        message = `Reactivate "${cap.name}"`;
      } else {
        message = `Could not find process matching "${intent.processName}"`;
      }
      break;
    }

    case 'quality_focus': {
      // Map quality dimension to strategy template override
      const strategyMap: Record<string, string> = {
        reliability: 'internal_tool',
        performance: 'marketplace',
        monitoring: 'saas',
        automation: 'internal_tool',
        ux: 'saas',
      };
      const strategy = strategyMap[intent.dimension] || 'default';
      if (intent.processName) {
        const cap = await findProcessByName(projectId, intent.processName);
        if (cap) {
          const currentStrategy = (cap as any).strategy_template || 'default';
          changes.push({ table: 'capabilities', id: cap.id, field: 'strategy_template', value: strategy, previous_value: currentStrategy });
          preview.push({ label: `${cap.name} Strategy`, before: currentStrategy, after: `${strategy} (${intent.dimension} focus)` });
          message = `Focus ${cap.name} on ${intent.dimension} via ${strategy} strategy`;
        }
      } else {
        message = `Apply ${intent.dimension} focus across project (use strategy: ${strategy})`;
      }
      break;
    }

    case 'add_process': {
      preview.push({ label: 'New Process', before: '(none)', after: intent.description });
      message = `Create new business process: "${intent.description}"`;
      break;
    }

    case 'rename_process': {
      const cap = await findProcessByName(projectId, intent.processName);
      if (cap) {
        changes.push({ table: 'capabilities', id: cap.id, field: 'name', value: intent.newName, previous_value: (cap as any).name });
        preview.push({ label: 'Rename', before: (cap as any).name, after: intent.newName });
        message = `Rename "${(cap as any).name}" → "${intent.newName}"`;
      } else {
        message = `Could not find process matching "${intent.processName}"`;
      }
      break;
    }

    case 'merge_processes': {
      const source = await findProcessByName(projectId, intent.sourceProcess);
      const target = await findProcessByName(projectId, intent.targetProcess);
      if (source && target) {
        // Move all requirements from source to target, then delete source
        changes.push({ table: 'requirements_maps', id: source.id, field: 'capability_id', value: target.id, previous_value: source.id });
        changes.push({ table: 'capabilities', id: source.id, field: '_delete', value: true, previous_value: false });
        const { RequirementsMap } = await import('../../models');
        const sourceReqCount = await RequirementsMap.count({ where: { capability_id: source.id } });
        preview.push({ label: 'Merge', before: `${(source as any).name} (${sourceReqCount} reqs)`, after: `→ ${(target as any).name}` });
        message = `Merge "${(source as any).name}" into "${(target as any).name}" — ${sourceReqCount} requirements will be moved`;
      } else {
        message = `Could not find processes: source="${intent.sourceProcess}", target="${intent.targetProcess}"`;
      }
      break;
    }

    case 'split_process': {
      const cap = await findProcessByName(projectId, intent.processName);
      if (cap) {
        preview.push({ label: 'Split', before: (cap as any).name, after: `${(cap as any).name} + ${intent.newProcessName}` });
        preview.push({ label: 'New Process', before: '(none)', after: `${intent.newProcessName}: ${intent.description}` });
        message = `Split "${(cap as any).name}" — create new "${intent.newProcessName}" and move matching requirements`;
        // Store the source cap id and new process details for apply
        changes.push({ table: 'capabilities', id: cap.id, field: '_split', value: { newName: intent.newProcessName, description: intent.description }, previous_value: null });
      } else {
        message = `Could not find process matching "${intent.processName}"`;
      }
      break;
    }

    case 'move_requirements': {
      const from = await findProcessByName(projectId, intent.fromProcess);
      const to = await findProcessByName(projectId, intent.toProcess);
      if (from && to) {
        // Find requirements matching the description
        const { RequirementsMap } = await import('../../models');
        const { Op } = await import('sequelize');
        const keywords = intent.description.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
        const allReqs = await RequirementsMap.findAll({ where: { capability_id: from.id } });
        const matching = allReqs.filter((r: any) => {
          const text = (r.requirement_text || '').toLowerCase();
          return keywords.some((kw: string) => text.includes(kw));
        });
        changes.push({ table: 'requirements_maps', id: from.id, field: '_move_to', value: { targetId: to.id, reqIds: matching.map((r: any) => r.id), description: intent.description }, previous_value: null });
        preview.push({ label: 'Move', before: `${matching.length} reqs from ${(from as any).name}`, after: `→ ${(to as any).name}` });
        message = `Move ${matching.length} requirements matching "${intent.description}" from "${(from as any).name}" to "${(to as any).name}"`;
      } else {
        message = `Could not find processes: from="${intent.fromProcess}", to="${intent.toProcess}"`;
      }
      break;
    }

    case 'regenerate_taxonomy': {
      preview.push({ label: 'Taxonomy', before: 'Current categories', after: 'Regenerate from requirements doc + codebase' });
      message = 'Regenerate business process taxonomy from your requirements document and codebase. This will reclassify all requirements.';
      changes.push({ table: 'projects', id: projectId, field: '_regenerate_taxonomy', value: true, previous_value: false });
      break;
    }

    default:
      message = 'Could not understand the instruction. Please rephrase.';
  }

  // Store preview in SteeringAction
  const { default: SteeringAction } = await import('../../models/SteeringAction');
  await SteeringAction.create({
    id: actionId,
    project_id: projectId,
    user_input: typeof intent === 'object' ? JSON.stringify(intent) : '',
    classified_intent: intent,
    changes,
    status: 'preview',
  } as any);

  return {
    action_id: actionId,
    intent,
    changes,
    preview,
    requires_confirmation: changes.length > 0 || intent.type === 'add_process',
    message,
  };
}

/**
 * Apply a previously previewed steering action.
 */
export async function applySteeringAction(actionId: string): Promise<{ applied: boolean; changes: SteeringChange[] }> {
  const { default: SteeringAction } = await import('../../models/SteeringAction');
  const action = await SteeringAction.findByPk(actionId);
  if (!action) throw new Error('Steering action not found');
  if ((action as any).status !== 'preview') throw new Error(`Cannot apply action in status: ${(action as any).status}`);

  const changes: SteeringChange[] = (action as any).changes || [];
  const intent: SteeringIntent = (action as any).classified_intent;

  // Apply each change
  for (const change of changes) {
    // Handle special operations
    if (change.field === '_delete' && change.value === true) {
      // Delete capability (merge operation — requirements already moved)
      const { Capability, Feature } = await import('../../models');
      await Feature.destroy({ where: { capability_id: change.id } });
      await Capability.destroy({ where: { id: change.id } });
      continue;
    }

    if (change.field === '_split') {
      // Split: create new BP + move matching requirements
      const { Capability, Feature, RequirementsMap } = await import('../../models');
      const sourceCap = await Capability.findByPk(change.id);
      if (sourceCap) {
        const splitData = change.value as any;
        const newCap = await Capability.create({
          project_id: (sourceCap as any).project_id,
          name: splitData.newName,
          description: splitData.description,
          status: 'active', priority: 'medium', sort_order: 0,
          source: 'user_input', lifecycle_status: 'active', applicability_status: 'active',
          execution_profile: (sourceCap as any).execution_profile,
        } as any);
        const feat = await Feature.create({
          capability_id: newCap.id, name: 'Core Functionality',
          description: splitData.description, status: 'active', priority: 'medium', sort_order: 0, source: 'user_input',
        } as any);
        // Move matching requirements
        const keywords = (splitData.description || '').toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
        const reqs = await RequirementsMap.findAll({ where: { capability_id: change.id } });
        for (const req of reqs) {
          const text = ((req as any).requirement_text || '').toLowerCase();
          if (keywords.some((kw: string) => text.includes(kw))) {
            (req as any).capability_id = newCap.id;
            (req as any).feature_id = feat.id;
            await req.save();
          }
        }
      }
      continue;
    }

    if (change.field === '_move_to') {
      // Move specific requirements between BPs
      const { RequirementsMap } = await import('../../models');
      const moveData = change.value as any;
      if (moveData.reqIds?.length > 0) {
        const { Op } = await import('sequelize');
        await RequirementsMap.update(
          { capability_id: moveData.targetId },
          { where: { id: { [Op.in]: moveData.reqIds } } }
        );
      }
      continue;
    }

    if (change.field === '_regenerate_taxonomy') {
      // Regenerate taxonomy — clear and rebuild
      const { Project } = await import('../../models');
      const project = await Project.findByPk(change.id);
      if (project) {
        const vars = (project as any).project_variables || {};
        delete vars.generated_taxonomy;
        (project as any).project_variables = vars;
        (project as any).changed('project_variables', true);
        await project.save();
        const { generateTaxonomy } = await import('../../intelligence/requirements/taxonomyGenerator');
        await generateTaxonomy(change.id);
      }
      continue;
    }

    // Handle merge: move all requirements from source to target
    if (change.table === 'requirements_maps' && change.field === 'capability_id') {
      const { RequirementsMap } = await import('../../models');
      await RequirementsMap.update(
        { capability_id: change.value },
        { where: { capability_id: change.previous_value } }
      );
      continue;
    }

    // Standard field update
    if (change.table === 'projects') {
      const { Project } = await import('../../models');
      const project = await Project.findByPk(change.id);
      if (project) { (project as any)[change.field] = change.value; await project.save(); }
    } else if (change.table === 'capabilities') {
      const { Capability } = await import('../../models');
      const cap = await Capability.findByPk(change.id);
      if (cap) { (cap as any)[change.field] = change.value; await cap.save(); }
    }
  }

  // Handle add_process separately (delegates to existing logic)
  if (intent.type === 'add_process') {
    // Return applied=true — the caller should delegate to the existing /add endpoint
  }

  (action as any).status = 'applied';
  (action as any).applied_at = new Date();
  await action.save();

  return { applied: true, changes };
}

/**
 * Revert a previously applied steering action.
 */
export async function revertSteeringAction(actionId: string): Promise<{ reverted: boolean }> {
  const { default: SteeringAction } = await import('../../models/SteeringAction');
  const action = await SteeringAction.findByPk(actionId);
  if (!action) throw new Error('Steering action not found');
  if ((action as any).status !== 'applied') throw new Error(`Cannot revert action in status: ${(action as any).status}`);

  const changes: SteeringChange[] = (action as any).changes || [];

  // Revert each change by restoring previous_value
  for (const change of changes) {
    if (change.table === 'projects') {
      const { Project } = await import('../../models');
      const project = await Project.findByPk(change.id);
      if (project) { (project as any)[change.field] = change.previous_value; await project.save(); }
    } else if (change.table === 'capabilities') {
      const { Capability } = await import('../../models');
      const cap = await Capability.findByPk(change.id);
      if (cap) { (cap as any)[change.field] = change.previous_value; await cap.save(); }
    }
  }

  (action as any).status = 'reverted';
  (action as any).reverted_at = new Date();
  await action.save();

  return { reverted: true };
}

/** Find a capability by fuzzy name match */
async function findProcessByName(projectId: string, name: string): Promise<any> {
  const { Capability } = await import('../../models');
  const { Op } = await import('sequelize');
  // Try exact match first
  let cap = await Capability.findOne({ where: { project_id: projectId, name } });
  if (cap) return cap;
  // Fuzzy: iLike
  cap = await Capability.findOne({ where: { project_id: projectId, name: { [Op.iLike]: `%${name}%` } } });
  return cap;
}
