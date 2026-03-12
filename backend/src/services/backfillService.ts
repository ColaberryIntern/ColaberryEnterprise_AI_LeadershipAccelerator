import MiniSection from '../models/MiniSection';
import PromptTemplate from '../models/PromptTemplate';

interface BackfillReport {
  backfilled: number;
  alreadyHadInline: number;
  brokenReferences: { miniSectionId: string; field: string; templateId: string }[];
  incomplete: { miniSectionId: string; title: string; missingPrompts: string[] }[];
  total: number;
}

const FK_INLINE_MAP: { fk: string; systemField: string; userField: string; label: string; assoc: string }[] = [
  { fk: 'concept_prompt_template_id', systemField: 'concept_prompt_system', userField: 'concept_prompt_user', label: 'concept', assoc: 'conceptPrompt' },
  { fk: 'build_prompt_template_id', systemField: 'build_prompt_system', userField: 'build_prompt_user', label: 'build', assoc: 'buildPrompt' },
  { fk: 'mentor_prompt_template_id', systemField: 'mentor_prompt_system', userField: 'mentor_prompt_user', label: 'mentor', assoc: 'mentorPrompt' },
];

export async function backfillInlinePrompts(): Promise<BackfillReport> {
  const miniSections = await MiniSection.findAll({
    include: [
      { model: PromptTemplate, as: 'conceptPrompt', required: false },
      { model: PromptTemplate, as: 'buildPrompt', required: false },
      { model: PromptTemplate, as: 'mentorPrompt', required: false },
    ],
  });

  const report: BackfillReport = {
    backfilled: 0,
    alreadyHadInline: 0,
    brokenReferences: [],
    incomplete: [],
    total: miniSections.length,
  };

  for (const ms of miniSections) {
    let backfilledAny = false;
    const missingPrompts: string[] = [];

    for (const mapping of FK_INLINE_MAP) {
      const fkValue = (ms as any)[mapping.fk];
      const existingSystem = (ms as any)[mapping.systemField];
      const existingUser = (ms as any)[mapping.userField];

      // Already has inline content — skip
      if (existingSystem || existingUser) {
        report.alreadyHadInline++;
        continue;
      }

      if (!fkValue) {
        // No FK and no inline — mark as incomplete
        missingPrompts.push(mapping.label);
        continue;
      }

      // Has FK — try to copy from template
      const template = (ms as any)[mapping.assoc] as PromptTemplate | null;
      if (!template) {
        // FK points to non-existent template
        report.brokenReferences.push({
          miniSectionId: ms.id,
          field: mapping.fk,
          templateId: fkValue,
        });
        continue;
      }

      // Copy template text into single prompt field (system field holds combined prompt)
      const parts = [template.system_prompt, (template as any).user_prompt_template].filter(Boolean);
      await ms.update({
        [mapping.systemField]: parts.join('\n\n'),
        [mapping.userField]: '',
        prompt_source: 'hybrid',
      } as any);
      backfilledAny = true;
    }

    if (backfilledAny) report.backfilled++;
    if (missingPrompts.length > 0) {
      report.incomplete.push({
        miniSectionId: ms.id,
        title: ms.title,
        missingPrompts,
      });
    }
  }

  return report;
}

export async function getBackfillStatus(): Promise<{
  total: number;
  withInlinePrompts: number;
  withFKOnly: number;
  withNeither: number;
}> {
  const { Op } = await import('sequelize');
  const total = await MiniSection.count();

  const withInline = await MiniSection.count({
    where: {
      [Op.or]: [
        { concept_prompt_system: { [Op.ne]: null } },
        { concept_prompt_user: { [Op.ne]: null } },
        { build_prompt_system: { [Op.ne]: null } },
        { build_prompt_user: { [Op.ne]: null } },
        { mentor_prompt_system: { [Op.ne]: null } },
        { mentor_prompt_user: { [Op.ne]: null } },
      ],
    } as any,
  });

  const withFK = await MiniSection.count({
    where: {
      [Op.or]: [
        { concept_prompt_template_id: { [Op.ne]: null } },
        { build_prompt_template_id: { [Op.ne]: null } },
        { mentor_prompt_template_id: { [Op.ne]: null } },
      ],
      concept_prompt_system: null,
      concept_prompt_user: null,
      build_prompt_system: null,
      build_prompt_user: null,
      mentor_prompt_system: null,
      mentor_prompt_user: null,
    } as any,
  });

  const inlineCount = typeof withInline === 'number' ? withInline : 0;
  const fkCount = typeof withFK === 'number' ? withFK : 0;

  return {
    total,
    withInlinePrompts: inlineCount,
    withFKOnly: fkCount,
    withNeither: total - inlineCount - fkCount,
  };
}
