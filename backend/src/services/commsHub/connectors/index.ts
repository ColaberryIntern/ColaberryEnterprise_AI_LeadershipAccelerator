import type { CommsHubChannel } from '../../../models/CommsHubDraft';
import { communityPostConnector } from './communityPostConnector';
import { inAppConnector } from './inAppConnector';
import { ConnectorPermanentError, type Connector } from './types';

/**
 * CH10.3 stand-in until CH10.4's WhatsApp connector: it refuses every send permanently, so a WhatsApp
 * delivery can never go out before the real connector (with its dedup, pacing and breaker) exists.
 */
export const whatsappStubConnector: Connector = {
  channel: 'whatsapp',
  async send() { throw new ConnectorPermanentError('WhatsApp sending is not built yet.', 'whatsapp_not_built'); },
};

/** The connector for each channel (CH7.1; WhatsApp CH10.3/CH10.4). */
const CONNECTORS: Record<CommsHubChannel, Connector> = {
  community_post: communityPostConnector,
  in_app: inAppConnector,
  whatsapp: whatsappStubConnector,
};

export function connectorFor(channel: CommsHubChannel): Connector {
  return CONNECTORS[channel];
}

export * from './types';
export { ensureTeamIdentity, TEAM_NAME } from './teamIdentity';
