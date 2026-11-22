jest.mock('../communityPostConnector', () => ({ communityPostConnector: { channel: 'community_post', send: jest.fn() } }));
jest.mock('../inAppConnector', () => ({ inAppConnector: { channel: 'in_app', send: jest.fn() } }));
jest.mock('../teamIdentity', () => ({ ensureTeamIdentity: jest.fn(), TEAM_NAME: 'Team' }));

import { connectorFor, ConnectorPermanentError, whatsappStubConnector } from '../index';

/** CH10.3 until CH10.4's connector exists, a WhatsApp delivery can only ever fail permanently: nothing is sent. */
it('the WhatsApp channel has a connector, and it refuses every send permanently', async () => {
  expect(connectorFor('whatsapp')).toBe(whatsappStubConnector);
  const err = await whatsappStubConnector.send({} as never).catch((e) => e);
  expect(err).toBeInstanceOf(ConnectorPermanentError);
  expect(err.reason).toBe('whatsapp_not_built');
});
