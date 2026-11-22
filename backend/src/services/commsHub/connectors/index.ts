import type { CommsHubChannel } from '../../../models/CommsHubDraft';
import { communityPostConnector } from './communityPostConnector';
import { inAppConnector } from './inAppConnector';
import type { Connector } from './types';
import { createWhatsAppConnector } from '../whatsapp/whatsappConnector';

/** The connector for each channel (CH7.1; WhatsApp CH10.3/CH10.4). */
const CONNECTORS: Record<CommsHubChannel, Connector> = {
  community_post: communityPostConnector,
  in_app: inAppConnector,
  // CH10.4: refuses permanently while WhatsApp is switched off (it ships off).
  whatsapp: createWhatsAppConnector(),
};

export function connectorFor(channel: CommsHubChannel): Connector {
  return CONNECTORS[channel];
}

export * from './types';
export { ensureTeamIdentity, TEAM_NAME } from './teamIdentity';
