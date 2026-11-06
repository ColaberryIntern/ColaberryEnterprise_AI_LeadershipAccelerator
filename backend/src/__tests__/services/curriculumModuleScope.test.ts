/**
 * One curriculum, shared by every batch (C10.14, Ali 2026-11-06):
 * "We should not be holding curriculum per cohort - everyone can use the same
 * curriculum until future notice."
 *
 * Two kinds of test here. The first group asserts the queries carry no cohort
 * term. The second is a source ratchet over the read sites, because the
 * behavioural tests alone cannot catch someone adding a SIXTH cohort-scoped
 * reader somewhere else in the tree - and that is how the scope grew the first
 * time.
 */

jest.mock('../../models/CurriculumModule', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../models/CurriculumLesson', () => ({ __esModule: true, default: { name: 'CurriculumLesson' } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import CurriculumModule from '../../models/CurriculumModule';
import { findSharedModules, findSharedModuleByNumber } from '../../services/curriculumModuleScope';

const findAll = (CurriculumModule as any).findAll as jest.Mock;
const findOne = (CurriculumModule as any).findOne as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findAll.mockResolvedValue([]);
  findOne.mockResolvedValue(null);
});

describe('the shared curriculum query carries no cohort scope', () => {
  it('asks for every module, unfiltered by cohort', async () => {
    await findSharedModules();

    const where = findAll.mock.calls[0][0].where;
    expect(where).toEqual({});
    expect(where).not.toHaveProperty('cohort_id');
  });

  it('selects the next module by number alone', async () => {
    await findSharedModuleByNumber(4);

    const where = findOne.mock.calls[0][0].where;
    expect(where).toEqual({ module_number: 4 });
    expect(where).not.toHaveProperty('cohort_id');
  });

  it('orders modules and their lessons for teaching, which four call sites had drifted on', async () => {
    await findSharedModules();

    const { order } = findAll.mock.calls[0][0];
    expect(order[0]).toEqual(['module_number', 'ASC']);
    expect(order[1][1]).toBe('lesson_number');
    expect(order[1][2]).toBe('ASC');
  });

  it('passes a lesson attribute list through for the admin list, and omits it otherwise', async () => {
    await findSharedModules(['id', 'title']);
    expect(findAll.mock.calls[0][0].include[0].attributes).toEqual(['id', 'title']);

    findAll.mockClear();
    await findSharedModules();
    expect(findAll.mock.calls[0][0].include[0]).not.toHaveProperty('attributes');
  });
});

/**
 * THE SOURCE RATCHET.
 *
 * Comments are stripped before matching, and that is not a nicety. Every file
 * below EXPLAINS the change by quoting the query it replaced - the literal text
 * `where: { cohort_id: enrollment.cohort_id }` appears in curriculumService's
 * own comment. A scanner that reads comments would match those tombstones and
 * pass or fail on prose rather than on code. This bit once already: a
 * production verification counted a deleted symbol in `dist/` and found it
 * four times, all of them in comments, because tsc preserves them.
 */
const READ_SITES = [
  'services/curriculumService.ts',
  'services/curriculumModuleScope.ts',
  'controllers/orchestrationController.ts',
];

function sourceWithoutComments(relativePath: string): string {
  const raw = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Scoped to CurriculumModule query windows, NOT to whole files.
 *
 * The first version of this ratchet scanned each file for `cohort_id:` and
 * failed on `orchestrationController` - correctly finding two
 * `LiveSession.findAll({ where: { cohort_id: cohortId } })` calls that have
 * nothing to do with curriculum. Sessions genuinely ARE per-batch: a batch has
 * its own meetings even though it shares the curriculum. So the ratchet reads
 * the text of each module query instead of the file around it.
 */
const QUERY_WINDOW = 400;

function moduleQueryWindows(relativePath: string): string[] {
  const code = sourceWithoutComments(relativePath);
  const windows: string[] = [];
  const finder = /CurriculumModule\s*\.\s*(findAll|findOne|findByPk|count)/g;
  let match: RegExpExecArray | null;
  while ((match = finder.exec(code)) !== null) {
    windows.push(code.slice(match.index, match.index + QUERY_WINDOW));
  }
  return windows;
}

describe('no reader scopes curriculum_modules by cohort', () => {
  it.each(READ_SITES)('%s: no module query mentions cohort_id', (relativePath) => {
    for (const window of moduleQueryWindows(relativePath)) {
      expect(window).not.toMatch(/cohort_id/);
    }
  });

  it('still inspects something: the read sites do contain module queries', () => {
    // A window scan over zero windows passes trivially. This is the control
    // that distinguishes "no cohort scope" from "nothing was scanned".
    const total = READ_SITES.reduce((n, p) => n + moduleQueryWindows(p).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('proves the ratchet can fail: the pre-C10.14 query is caught', () => {
    const old = 'CurriculumModule.findAll({ where: { cohort_id: enrollment.cohort_id } });';
    const window = old.slice(old.search(/CurriculumModule/), QUERY_WINDOW);
    expect(window).toMatch(/cohort_id/);
  });

  it('proves comment-stripping works, so a tombstone cannot pass for code', () => {
    const service = readFileSync(join(__dirname, '..', '..', 'services/curriculumService.ts'), 'utf8');
    // The explanation quotes the old query...
    expect(service).toMatch(/cohort_id:\s*enrollment\.cohort_id/);
    // ...and it is gone once comments are removed.
    expect(sourceWithoutComments('services/curriculumService.ts')).not.toMatch(/cohort_id:\s*enrollment\.cohort_id/);
  });
});
