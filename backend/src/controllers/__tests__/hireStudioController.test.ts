/**
 * The candidate studio's Hire routes only ever touch the SESSION's enrollment (kit §5): an id in
 * the body or the URL never selects whose row is read or written.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../services/hire/hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));
jest.mock('../../services/hire/hireStudioSettings', () => {
  const actual = jest.requireActual('../../services/hire/hireStudioSettings');
  return { ...actual, readHireIntro: jest.fn(), writeHireIntro: jest.fn(), readAvailability: jest.fn(), writeAvailability: jest.fn(), readCaseStudyOrder: jest.fn(), writeCaseStudyOrder: jest.fn() };
});
jest.mock('../../services/hire/hireInterviewInbox', () => {
  const actual = jest.requireActual('../../services/hire/hireInterviewInbox');
  return { ...actual, listMyInterviews: jest.fn(), actOnInterview: jest.fn() };
});

import type { Request, Response } from 'express';
import { sequelize } from '../../config/database';
import { loadHireIndex } from '../../services/hire/hireTalentIndex';
import * as settings from '../../services/hire/hireStudioSettings';
import * as inbox from '../../services/hire/hireInterviewInbox';
import {
  handleActOnHireInterview, handleListHireInterviews, handlePutCaseStudyOrder, handlePutHireIntro, handlePutInterviewAvailability,
} from '../hireStudioController';

const m = (f: unknown) => f as jest.Mock;
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

function call(handler: (req: Request, res: Response, next: () => void) => Promise<void>, body: unknown = {}, params: Record<string, string> = {}) {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  const next = jest.fn();
  return handler({ participant: { sub: ME }, body, params } as unknown as Request, res as Response, next).then(() => ({ res, next }));
}

beforeEach(() => jest.clearAllMocks());

it('writes the intro for the session enrollment, ignoring any id in the body', async () => {
  m(settings.writeHireIntro).mockResolvedValue({});
  const body = { headlineDraft: null, answers: [], roles: [], setups: [], location: null, earliestStart: null, workAuth: null };
  const { res } = await call(handlePutHireIntro, { ...body, enrollmentId: OTHER });
  expect(res.statusCode).toBe(400); // strict: a smuggled id is refused outright
  await call(handlePutHireIntro, body);
  expect(settings.writeHireIntro).toHaveBeenCalledWith(ME, body);
});

it('writes availability for the session enrollment, and 400s a bad block', async () => {
  m(settings.writeAvailability).mockResolvedValue({});
  const ok = { ...settings.DEFAULT_AVAILABILITY, enabled: true, blocks: ['Tue-afternoon'] };
  await call(handlePutInterviewAvailability, ok);
  expect(settings.writeAvailability).toHaveBeenCalledWith(ME, ok);
  expect((await call(handlePutInterviewAvailability, { ...ok, blocks: ['Sun-night'] })).res.statusCode).toBe(400);
});

it('orders against the caller\'s OWN published case studies', async () => {
  m(sequelize.query).mockResolvedValue([[{ slug: 'me-slug' }]]);
  m(loadHireIndex).mockResolvedValue([{ cases: [{ slug: 'a' }, { slug: 'b' }] }]);
  m(settings.writeCaseStudyOrder).mockResolvedValue(['b', 'a']);
  const { res } = await call(handlePutCaseStudyOrder, { slugs: ['b', 'a'] });
  expect(m(sequelize.query).mock.calls[0][1]).toEqual({ bind: [ME] });
  expect(loadHireIndex).toHaveBeenCalledWith(['public', 'unlisted'], 'me-slug');
  expect(settings.writeCaseStudyOrder).toHaveBeenCalledWith(ME, ['b', 'a'], ['a', 'b']);
  expect(res.body).toEqual({ ok: true, slugs: ['b', 'a'] });
});

it('lists and acts on interviews as the session enrollment, and 404s an unknown action', async () => {
  m(inbox.listMyInterviews).mockResolvedValue([]);
  await call(handleListHireInterviews);
  expect(inbox.listMyInterviews).toHaveBeenCalledWith(ME);
  m(inbox.actOnInterview).mockResolvedValue({ status: 'confirmed' });
  await call(handleActOnHireInterview, {}, { id: 'abc', action: 'confirm' });
  expect(inbox.actOnInterview).toHaveBeenCalledWith(ME, 'abc', 'confirm', {});
  expect((await call(handleActOnHireInterview, {}, { id: 'abc', action: 'delete' })).res.statusCode).toBe(404);
});

it('passes a service status straight through (409 stays 409)', async () => {
  m(inbox.actOnInterview).mockRejectedValue(new settings.StudioError('Cannot confirm', 409, 'InvalidTransition'));
  const { res } = await call(handleActOnHireInterview, {}, { id: 'abc', action: 'confirm' });
  expect(res.statusCode).toBe(409);
  expect(res.body.error_class).toBe('InvalidTransition');
});
