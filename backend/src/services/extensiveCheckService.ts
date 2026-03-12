import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import { PromptTemplate, SkillDefinition, ArtifactDefinition } from '../models';

interface DiagnosticCheck {
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

interface DiagnosticCategory {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  details: DiagnosticCheck[];
}

interface DiagnosticReport {
  miniSectionId: string;
  timestamp: string;
  overallStatus: 'pass' | 'warning' | 'fail';
  categories: DiagnosticCategory[];
  score: number;
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

export async function extensiveCheckMiniSection(id: string): Promise<DiagnosticReport> {
  const ms = await MiniSection.findByPk(id, {
    include: [
      { model: PromptTemplate, as: 'conceptPrompt', required: false },
      { model: PromptTemplate, as: 'buildPrompt', required: false },
      { model: PromptTemplate, as: 'mentorPrompt', required: false },
    ],
  });
  if (!ms) throw new Error('Mini-section not found');

  const categories: DiagnosticCategory[] = [];

  // 1. Prompt Compilation
  categories.push(await checkPromptCompilation(ms));

  // 2. Cross-Reference Check
  categories.push(await checkCrossReferences(ms));

  // 3. FK Integrity
  categories.push(await checkFKIntegrity(ms));

  // 4. Empty Field Check
  categories.push(checkEmptyFields(ms));

  // 5. Variable Resolution
  categories.push(await checkVariableResolution(ms));

  // 6. Ordering Check (needs lesson context)
  categories.push(await checkOrdering(ms));

  const hasFailure = categories.some(c => c.status === 'fail');
  const hasWarning = categories.some(c => c.status === 'warning');
  const overallStatus = hasFailure ? 'fail' : hasWarning ? 'warning' : 'pass';

  return {
    miniSectionId: id,
    timestamp: new Date().toISOString(),
    overallStatus,
    categories,
    score: ms.quality_score || 0,
  };
}

async function checkPromptCompilation(ms: MiniSection): Promise<DiagnosticCategory> {
  const details: DiagnosticCheck[] = [];
  const promptFields: { field: string; label: string }[] = [
    { field: 'concept_prompt_system', label: 'Concept Prompt' },
    { field: 'build_prompt_system', label: 'Build Prompt' },
    { field: 'mentor_prompt_system', label: 'Mentor Prompt' },
    { field: 'kc_prompt_system', label: 'KC Prompt' },
    { field: 'reflection_prompt_system', label: 'Reflection Prompt' },
  ];

  // Get all defined variable keys for placeholder resolution
  const allVarDefs = await VariableDefinition.findAll({ where: { is_active: true } });
  const definedKeys = new Set(allVarDefs.map(v => v.variable_key));

  for (const pf of promptFields) {
    const text = (ms as any)[pf.field] as string;
    if (!text) {
      details.push({ label: pf.label, status: 'warning', message: 'Not configured' });
      continue;
    }

    const placeholders = extractPlaceholders(text);
    const unresolved = placeholders.filter(p => !definedKeys.has(p));

    if (unresolved.length > 0) {
      details.push({ label: pf.label, status: 'warning', message: `Unresolved placeholders: ${unresolved.join(', ')}` });
    } else if (placeholders.length > 0) {
      details.push({ label: pf.label, status: 'pass', message: `${placeholders.length} placeholder(s) resolved` });
    } else {
      details.push({ label: pf.label, status: 'pass', message: 'No placeholders (static text)' });
    }
  }

  const status = details.some(d => d.status === 'fail') ? 'fail' : details.some(d => d.status === 'warning') ? 'warning' : 'pass';
  return { name: 'Prompt Compilation', status, details };
}

async function checkCrossReferences(ms: MiniSection): Promise<DiagnosticCategory> {
  const details: DiagnosticCheck[] = [];

  // Check skill IDs
  if (ms.associated_skill_ids?.length) {
    const skills = await SkillDefinition.findAll({ where: { skill_id: ms.associated_skill_ids } });
    const foundIds = new Set(skills.map(s => s.skill_id));
    const missing = ms.associated_skill_ids.filter(id => !foundIds.has(id));
    if (missing.length > 0) {
      details.push({ label: 'Skill References', status: 'fail', message: `Missing skill(s): ${missing.join(', ')}` });
    } else {
      details.push({ label: 'Skill References', status: 'pass', message: `${ms.associated_skill_ids.length} skill(s) valid` });
    }
  }

  // Check artifact IDs
  if (ms.creates_artifact_ids?.length) {
    const arts = await ArtifactDefinition.findAll({ where: { id: ms.creates_artifact_ids } });
    const foundIds = new Set(arts.map(a => a.id));
    const missing = ms.creates_artifact_ids.filter(id => !foundIds.has(id));
    if (missing.length > 0) {
      details.push({ label: 'Artifact References', status: 'fail', message: `Missing artifact(s): ${missing.join(', ')}` });
    } else {
      details.push({ label: 'Artifact References', status: 'pass', message: `${ms.creates_artifact_ids.length} artifact(s) valid` });
    }
  }

  // Check variable keys
  if (ms.associated_variable_keys?.length) {
    const vars = await VariableDefinition.findAll({ where: { variable_key: ms.associated_variable_keys } });
    const foundKeys = new Set(vars.map(v => v.variable_key));
    const missing = ms.associated_variable_keys.filter(k => !foundKeys.has(k));
    if (missing.length > 0) {
      details.push({ label: 'Variable References', status: 'warning', message: `Undefined variable(s): ${missing.join(', ')}` });
    } else {
      details.push({ label: 'Variable References', status: 'pass', message: `${ms.associated_variable_keys.length} variable(s) valid` });
    }
  }

  if (details.length === 0) {
    details.push({ label: 'Cross References', status: 'pass', message: 'No cross-references to validate' });
  }

  const status = details.some(d => d.status === 'fail') ? 'fail' : details.some(d => d.status === 'warning') ? 'warning' : 'pass';
  return { name: 'Cross-Reference Check', status, details };
}

async function checkFKIntegrity(ms: MiniSection): Promise<DiagnosticCategory> {
  const details: DiagnosticCheck[] = [];

  const fkFields = [
    { field: 'concept_prompt_template_id', label: 'Concept Prompt Template' },
    { field: 'build_prompt_template_id', label: 'Build Prompt Template' },
    { field: 'mentor_prompt_template_id', label: 'Mentor Prompt Template' },
  ];

  for (const fk of fkFields) {
    const value = (ms as any)[fk.field];
    if (!value) {
      details.push({ label: fk.label, status: 'pass', message: 'Not linked' });
      continue;
    }
    const exists = await PromptTemplate.findByPk(value);
    if (!exists) {
      details.push({ label: fk.label, status: 'fail', message: `Broken reference: ${value}` });
    } else {
      details.push({ label: fk.label, status: 'pass', message: `Valid: ${(exists as any).name}` });
    }
  }

  const status = details.some(d => d.status === 'fail') ? 'fail' : 'pass';
  return { name: 'FK Integrity', status, details };
}

function checkEmptyFields(ms: MiniSection): DiagnosticCategory {
  const details: DiagnosticCheck[] = [];

  if (!ms.title) details.push({ label: 'Title', status: 'fail', message: 'Required field is empty' });
  else details.push({ label: 'Title', status: 'pass', message: ms.title });

  if (!ms.description) details.push({ label: 'Description', status: 'warning', message: 'Recommended field is empty' });
  else details.push({ label: 'Description', status: 'pass', message: 'Set' });

  const settingsJson = ms.settings_json || {};
  if (!settingsJson.learning_goal) details.push({ label: 'Learning Goal', status: 'warning', message: 'Not set' });
  else details.push({ label: 'Learning Goal', status: 'pass', message: 'Set' });

  if (ms.mini_section_type === 'knowledge_check') {
    if (!ms.knowledge_check_config?.enabled) {
      details.push({ label: 'KC Config', status: 'warning', message: 'Knowledge check not enabled' });
    } else {
      details.push({ label: 'KC Config', status: 'pass', message: `${ms.knowledge_check_config.question_count} questions, ${ms.knowledge_check_config.pass_score}% pass` });
    }
  }

  const status = details.some(d => d.status === 'fail') ? 'fail' : details.some(d => d.status === 'warning') ? 'warning' : 'pass';
  return { name: 'Empty Field Check', status, details };
}

async function checkVariableResolution(ms: MiniSection): Promise<DiagnosticCategory> {
  const details: DiagnosticCheck[] = [];
  const referenced = ms.associated_variable_keys || [];
  const created = ms.creates_variable_keys || [];

  if (referenced.length === 0 && created.length === 0) {
    return { name: 'Variable Resolution', status: 'pass', details: [{ label: 'Variables', status: 'pass', message: 'None referenced or created' }] };
  }

  if (referenced.length > 0) {
    const defs = await VariableDefinition.findAll({ where: { variable_key: referenced } });
    const defKeys = new Set(defs.map(d => d.variable_key));
    for (const key of referenced) {
      if (defKeys.has(key)) {
        details.push({ label: `Ref: ${key}`, status: 'pass', message: 'Definition exists' });
      } else {
        details.push({ label: `Ref: ${key}`, status: 'warning', message: 'No definition found' });
      }
    }
  }

  if (created.length > 0) {
    const defs = await VariableDefinition.findAll({ where: { variable_key: created } });
    const defKeys = new Set(defs.map(d => d.variable_key));
    for (const key of created) {
      if (defKeys.has(key)) {
        details.push({ label: `Create: ${key}`, status: 'pass', message: 'Definition exists' });
      } else {
        details.push({ label: `Create: ${key}`, status: 'warning', message: 'No definition — will be created at runtime' });
      }
    }
  }

  const status = details.some(d => d.status === 'fail') ? 'fail' : details.some(d => d.status === 'warning') ? 'warning' : 'pass';
  return { name: 'Variable Resolution', status, details };
}

async function checkOrdering(ms: MiniSection): Promise<DiagnosticCategory> {
  const details: DiagnosticCheck[] = [];

  // Load all mini-sections in the same lesson
  const lessonMiniSections = await MiniSection.findAll({
    where: { lesson_id: ms.lesson_id, is_active: true },
    order: [['mini_section_order', 'ASC']],
  });

  // Build variable creation map
  const createdBefore = new Set<string>();
  // Add system variables
  const systemVars = await VariableDefinition.findAll({ where: { source_type: 'system', is_active: true } });
  systemVars.forEach(v => createdBefore.add(v.variable_key));

  let foundSelf = false;
  for (const other of lessonMiniSections) {
    if (other.id === ms.id) {
      foundSelf = true;
      // Check if this ms references any vars not yet available
      const referenced = ms.associated_variable_keys || [];
      for (const key of referenced) {
        if (!createdBefore.has(key)) {
          // Check if it's defined at all
          const isDefined = await VariableDefinition.findOne({ where: { variable_key: key } });
          if (isDefined) {
            details.push({ label: `Order: ${key}`, status: 'warning', message: `Referenced at order ${ms.mini_section_order} but not yet created by earlier sections` });
          }
        }
      }
      // Add this section's created vars
      (ms.creates_variable_keys || []).forEach(k => createdBefore.add(k));
    } else if (!foundSelf) {
      // Before current: accumulate created vars
      (other.creates_variable_keys || []).forEach(k => createdBefore.add(k));
    }
  }

  if (details.length === 0) {
    details.push({ label: 'Ordering', status: 'pass', message: 'No ordering violations detected' });
  }

  const status = details.some(d => d.status === 'fail') ? 'fail' : details.some(d => d.status === 'warning') ? 'warning' : 'pass';
  return { name: 'Ordering Check', status, details };
}

export async function extensiveCheckLesson(lessonId: string): Promise<DiagnosticReport[]> {
  const miniSections = await MiniSection.findAll({ where: { lesson_id: lessonId, is_active: true } });
  const reports: DiagnosticReport[] = [];
  for (const ms of miniSections) {
    reports.push(await extensiveCheckMiniSection(ms.id));
  }
  return reports;
}

export async function extensiveCheckAll(): Promise<{ total: number; passed: number; warnings: number; failed: number; reports: DiagnosticReport[] }> {
  const all = await MiniSection.findAll({ where: { is_active: true } });
  const reports: DiagnosticReport[] = [];
  let passed = 0, warnings = 0, failed = 0;
  for (const ms of all) {
    const report = await extensiveCheckMiniSection(ms.id);
    reports.push(report);
    if (report.overallStatus === 'pass') passed++;
    else if (report.overallStatus === 'warning') warnings++;
    else failed++;
  }
  return { total: all.length, passed, warnings, failed, reports };
}

export async function checkPreviewConfidence(id: string): Promise<{
  valid: boolean;
  confidence: number;
  unresolvedPlaceholders: string[];
  missingVariables: string[];
  warnings: string[];
}> {
  const ms = await MiniSection.findByPk(id);
  if (!ms) throw new Error('Mini-section not found');

  const warnings: string[] = [];
  const unresolvedPlaceholders: string[] = [];
  const missingVariables: string[] = [];

  // Get all defined variables
  const allVars = await VariableDefinition.findAll({ where: { is_active: true } });
  const varKeys = new Set(allVars.map(v => v.variable_key));

  // Check all inline prompts for unresolved placeholders
  const promptFields = ['concept_prompt_system', 'build_prompt_system',
    'mentor_prompt_system', 'kc_prompt_system', 'reflection_prompt_system'];

  let totalPlaceholders = 0;
  let resolvedPlaceholders = 0;

  for (const field of promptFields) {
    const text = (ms as any)[field] as string;
    if (!text) continue;
    const ph = extractPlaceholders(text);
    totalPlaceholders += ph.length;
    for (const p of ph) {
      if (varKeys.has(p)) {
        resolvedPlaceholders++;
      } else {
        unresolvedPlaceholders.push(p);
      }
    }
  }

  // Check referenced variables exist
  for (const key of (ms.associated_variable_keys || [])) {
    if (!varKeys.has(key)) missingVariables.push(key);
  }

  // Calculate confidence
  const hasPrompts = promptFields.some(f => !!(ms as any)[f]);
  if (!hasPrompts) {
    warnings.push('No inline prompts configured');
  }

  let confidence = 100;
  if (!hasPrompts) confidence -= 30;
  if (unresolvedPlaceholders.length > 0) confidence -= unresolvedPlaceholders.length * 10;
  if (missingVariables.length > 0) confidence -= missingVariables.length * 5;
  if (!ms.description) confidence -= 5;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    valid: confidence >= 70 && unresolvedPlaceholders.length === 0,
    confidence,
    unresolvedPlaceholders: [...new Set(unresolvedPlaceholders)],
    missingVariables,
    warnings,
  };
}
