import type { CommsHubChannel } from '../../../models/CommsHubDraft';
import { communityPostConnector } from './communityPostConnector';
import { inAppConnector } from './inAppConnector';
import type { Connector } from './types';

/** The connector for each channel (CH7.1). WhatsApp joins after the build. */
const CONNECTORS: Record<CommsHubChannel, Connector> = {
  community_post: communityPostConnector,
  in_app: inAppConnector,
};

export function connectorFor(channel: CommsHubChannel): Connector {
  return CONNECTORS[channel];
}

export * from './types';
export { ensureTeamIdentity, TEAM_NAME } from './teamIdentity';
