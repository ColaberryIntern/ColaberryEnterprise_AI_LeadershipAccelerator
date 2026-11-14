// C125: the controller marks a code minted from a read-only View-as session with the viewer, and
// leaves a normal member's code unmarked. The service turns a marked code into a read-only session.
jest.mock('../../services/portalHandoffService', () => ({
  createHandoff: jest.fn(async () => ({ url: 'u', qrSvg: '<svg/>', expiresAt: 'x', ttlMs: 90000, readOnly: false })),
  exchangeHandoff: jest.fn(),
  sqlHandoffStore: { name: 'sql' },
}));
jest.mock('../../services/portalFlagsService', () => ({ getPortalFlags: jest.fn(() => ({})) }));

import { handleCreateHandoff } from '../portalHandoffController';
import { createHandoff } from '../../services/portalHandoffService';

const create = createHandoff as unknown as jest.Mock;

function call(participant: any) {
  const req: any = { participant };
  const res: any = { json: jest.fn() };
  const next = jest.fn();
  return handleCreateHandoff(req, res, next).then(() => ({ res, next }));
}

describe('handleCreateHandoff (C125)', () => {
  beforeEach(() => create.mockClear());

  it('a read-only viewer mints a code marked with who is viewing', async () => {
    await call({ sub: 'e1', read_only: true, impersonated_by: 'ali@colaberry.com' });
    expect(create).toHaveBeenCalledWith('e1', expect.anything(), { impersonatedBy: 'ali@colaberry.com' });
  });

  it('a read-only token with no impersonated_by claim is still marked, never left writable', async () => {
    await call({ sub: 'e1', read_only: true });
    expect(create).toHaveBeenCalledWith('e1', expect.anything(), { impersonatedBy: 'admin' });
  });

  it('a normal member mints an unmarked code', async () => {
    await call({ sub: 'e1' });
    expect(create).toHaveBeenCalledWith('e1', expect.anything(), { impersonatedBy: null });
  });
});
