/**
 * Put one enrollment on the career_prep allow-list (Career Prep v27, CP1.1).
 *
 *   node dist/scripts/seedCareerPrepFlag.js --enrollment <id> [--remove] [--dry]
 *
 * Idempotent: adding an id that is already listed changes nothing; --remove is the rollback.
 * Refuses an id that is not an existing enrollment. Never touches any other setting.
 */
import { sequelize } from '../config/database';
import { getSetting, setSetting } from '../services/settingsService';
import { FLAG_KEY, parseAllowList } from '../services/careerPrep/careerPrepFlag';

export function nextAllowList(current: unknown, id: string, remove: boolean): { list: string[]; changed: boolean } {
  const ids = parseAllowList(current) ?? new Set<string>();
  const had = ids.has(id);
  if (remove) ids.delete(id); else ids.add(id);
  return { list: [...ids].sort(), changed: remove ? had : !had };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--enrollment');
  const id = i >= 0 ? argv[i + 1] : '';
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('usage: --enrollment <enrollment uuid> [--remove] [--dry]');
  const [rows] = await sequelize.query('SELECT id FROM enrollments WHERE id = :id', { replacements: { id } });
  if ((rows as unknown[]).length !== 1) throw new Error(`no enrollment ${id}`);
  const { list, changed } = nextAllowList(await getSetting(FLAG_KEY), id, argv.includes('--remove'));
  // setSetting's third argument is an admin user uuid (updated_by); a label there fails the uuid cast. A script has no admin.
  if (changed && !argv.includes('--dry')) await setSetting(FLAG_KEY, list);
  console.log(JSON.stringify({ event: 'career_prep_flag_seed', changed, dry: argv.includes('--dry'), count: list.length }));
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(JSON.stringify({ event: 'career_prep_flag_seed', outcome: 'failure', error_class: 'ValidationError', message: (e as Error).message })); process.exitCode = 1; })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
