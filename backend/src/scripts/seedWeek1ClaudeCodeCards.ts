/**
 * seedWeek1ClaudeCodeCards — author Week 1's two Claude Code enablement cards.
 *
 * From Ram's 2026-08-06 self-study review:
 *   • `anthropic_skills_jar` ("Claude Code 101") — its body described Claude the chat
 *     assistant rather than Claude Code (todo 10174137603).
 *   • `prompt_lab` — becomes the Explore/Plan/Code/Commit WORKSHOP covering the four
 *     things Anthropic's video raises but never demonstrates: success criteria, tools,
 *     a test suite, and a code-review agent (todo 10174283832).
 *
 * Both are authored + LOCKED through the shared `authorCard` helper, so they never
 * regenerate over the hand-authored copy and re-running writes nothing when current.
 * Locking the prompt_lab card is deliberate: it was previously week-generated, and
 * generation would otherwise overwrite this workshop after 30 days.
 *
 * Run inside the backend container:
 *   node dist/scripts/seedWeek1ClaudeCodeCards.js            # apply
 *   node dist/scripts/seedWeek1ClaudeCodeCards.js --dry-run  # report only, no write
 *   node dist/scripts/seedWeek1ClaudeCodeCards.js --program=<uuid>
 */
import { sequelize } from '../config/database';
import { authorCard, AuthorCardResult } from './lib/authorTimelineCard';
import { CLAUDE_CODE_101_CARD } from '../data/claudeCode101Card';
import { CLAUDE_CODE_WORKSHOP_WEEK1 } from '../data/claudeCodeWorkshopWeek1';

const DEFAULT_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

export async function seedWeek1ClaudeCodeCards(
  programId: string = DEFAULT_PROGRAM,
  dryRun = false,
): Promise<AuthorCardResult[]> {
  const results: AuthorCardResult[] = [];

  results.push(await authorCard({
    label: 'Claude Code 101',
    week: 1,
    type: 'anthropic_skills_jar',
    content: CLAUDE_CODE_101_CARD.content,
    meta: { course: CLAUDE_CODE_101_CARD.course },
  }, programId, dryRun));

  results.push(await authorCard({
    label: 'E-P-C-C Workshop',
    week: 1,
    type: 'prompt_lab',
    title: CLAUDE_CODE_WORKSHOP_WEEK1.title,
    content: CLAUDE_CODE_WORKSHOP_WEEK1,
  }, programId, dryRun));

  return results;
}

if (require.main === module) {
  const programId = argValue('--program') || DEFAULT_PROGRAM;
  const dryRun = process.argv.includes('--dry-run');
  seedWeek1ClaudeCodeCards(programId, dryRun)
    .then(async (r) => {
      console.log(`[seedWeek1ClaudeCodeCards] ${JSON.stringify(r)}`);
      await sequelize.close();
      // A missing card is a real failure — the copy did not land where it was meant to.
      process.exit(r.some((x) => x.reason === 'not-found') ? 1 : 0);
    })
    .catch(async (e) => {
      console.error('[seedWeek1ClaudeCodeCards] ERROR ' + (e && e.message ? e.message : e));
      try { await sequelize.close(); } catch { /* already closed */ }
      process.exit(1);
    });
}

export default seedWeek1ClaudeCodeCards;
