/**
 * One-time seed: merge per-pair prompts into single section prompt.
 * Consolidates concept/build/mentor/kc/reflection prompt fields into
 * concept_prompt_system as the unified "Section Prompt" field.
 * Clears the other prompt fields.
 *
 * Run: cd backend && npx ts-node src/seeds/backfillSectionPrompts.ts
 */
import '../models'; // init associations
import { sequelize } from '../config/database';
import MiniSection from '../models/MiniSection';

const PROMPT_DELIMITER = '\n\n---SECTION-SPECIFIC---\n\n';

const PROMPT_FIELDS = [
  'concept_prompt_system',
  'build_prompt_system',
  'mentor_prompt_system',
  'kc_prompt_system',
  'reflection_prompt_system',
];

function decomposePrompt(fullText: string): { structural: string; sectionSpecific: string } {
  if (!fullText) return { structural: '', sectionSpecific: '' };
  const idx = fullText.indexOf(PROMPT_DELIMITER);
  if (idx === -1) return { structural: '', sectionSpecific: fullText };
  return {
    structural: fullText.substring(0, idx),
    sectionSpecific: fullText.substring(idx + PROMPT_DELIMITER.length),
  };
}

function composePrompt(structural: string, sectionSpecific: string): string {
  const s = (structural || '').trim();
  const ss = (sectionSpecific || '').trim();
  if (!s && !ss) return '';
  if (!s) return ss;
  if (!ss) return s;
  return s + PROMPT_DELIMITER + ss;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const miniSections = await MiniSection.findAll();
    console.log(`Found ${miniSections.length} mini-sections.\n`);

    let updated = 0;
    for (const ms of miniSections) {
      // Collect section-specific portions from all prompt fields
      const sectionParts: string[] = [];
      let conceptStructural = '';

      for (const field of PROMPT_FIELDS) {
        const fullText = (ms as any)[field] || '';
        if (!fullText) continue;
        const { structural, sectionSpecific } = decomposePrompt(fullText);

        // Keep the structural portion from concept_prompt_system
        if (field === 'concept_prompt_system' && structural) {
          conceptStructural = structural;
        }

        if (sectionSpecific) {
          sectionParts.push(sectionSpecific);
        }
      }

      // Merge into single section prompt in concept_prompt_system
      const mergedSectionSpecific = sectionParts.join('\n\n');
      const composed = composePrompt(conceptStructural, mergedSectionSpecific);

      // Only update if something changed
      const currentConcept = (ms as any).concept_prompt_system || '';
      const hasOtherPrompts = ['build_prompt_system', 'mentor_prompt_system', 'kc_prompt_system', 'reflection_prompt_system']
        .some(f => !!(ms as any)[f]);

      if (composed !== currentConcept || hasOtherPrompts) {
        await ms.update({
          concept_prompt_system: composed,
          concept_prompt_user: '',
          build_prompt_system: '',
          build_prompt_user: '',
          mentor_prompt_system: '',
          mentor_prompt_user: '',
          kc_prompt_system: '',
          kc_prompt_user: '',
          reflection_prompt_system: '',
          reflection_prompt_user: '',
        });
        console.log(`  OK: "${ms.title}" — merged into single section prompt`);
        updated++;
      } else {
        console.log(`  SKIP: "${ms.title}" — already unified`);
      }
    }

    console.log(`\nUpdated ${updated} mini-section(s).`);
    console.log('Backfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
}

run();
