/**
 * runDaraPresenceHeartbeat — thin wrapper over the generic
 * agentBlueprint/agentPresenceHeartbeat.ts, mirroring
 * reesePresenceHeartbeat.ts's own extraction. Proves it calls the generic
 * function with DARA_EMAIL specifically, not a hardcoded/wrong value.
 */
jest.mock('../../agentBlueprint/agentPresenceHeartbeat', () => ({ runAgentPresenceHeartbeat: jest.fn() }));

import { runAgentPresenceHeartbeat } from '../../agentBlueprint/agentPresenceHeartbeat';
import { runDaraPresenceHeartbeat } from '../daraPresenceHeartbeat';
import { DARA_EMAIL } from '../daraIdentitySeed';

const mockRunHeartbeat = runAgentPresenceHeartbeat as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

it("delegates to the generic heartbeat with Dara's own real email, not Reese's or a hardcoded default", async () => {
  await runDaraPresenceHeartbeat();

  expect(mockRunHeartbeat).toHaveBeenCalledWith(DARA_EMAIL);
  expect(mockRunHeartbeat).toHaveBeenCalledWith('dara@colaberry.com');
  expect(mockRunHeartbeat).not.toHaveBeenCalledWith('reese@colaberry.com');
});
