/**
 * W32 (Phase 5 review): an Enterprise client's sign-in token is signed with the same secret as
 * the inbox digest links and is given to anyone who books a pilot. It must never act on Ali's
 * inbox through /api/admin/inbox/digest-action. A real digest token still works.
 */
import jwt from 'jsonwebtoken';

const mockFindOne = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));
jest.mock('../../models/InboxEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/InboxClassification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockFindOne(...a) } }));
jest.mock('../../models/InboxReplyDraft', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/InboxRule', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/InboxVip', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/InboxAuditLog', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/InboxLearningEvent', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/InboxStyleProfile', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/inbox/inboxAuditService', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../models/EnterpriseIntake', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/emailService', () => ({ sendEnterpriseClientLink: jest.fn() }));

/* eslint-disable import/first */
import { handleDigestAction } from '../inboxController';
import { issueClientToken } from '../../services/enterpriseIntake/enterpriseClientPortal';
import { env } from '../../config/env';
/* eslint-enable import/first */

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.send = jest.fn(() => r);
  return r;
}

beforeEach(() => jest.clearAllMocks());

it('refuses a client sign-in token before touching any email', async () => {
  const r = res();
  await handleDigestAction({ query: { token: issueClientToken('i-1'), emailId: 'e-1', action: 'hold' } } as any, r);
  expect(r.status).toHaveBeenCalledWith(401);
  expect(mockFindOne).not.toHaveBeenCalled();
});

it('still accepts a real digest token', async () => {
  mockFindOne.mockResolvedValue(null);
  const r = res();
  const digest = jwt.sign({ batch_id: 'b-1', email_ids: ['e-1'] }, env.jwtSecret, { expiresIn: '1h' });
  await handleDigestAction({ query: { token: digest, emailId: 'e-1', action: 'hold' } } as any, r);
  expect(mockFindOne).toHaveBeenCalled();
  expect(r.status).toHaveBeenCalledWith(404);
});
