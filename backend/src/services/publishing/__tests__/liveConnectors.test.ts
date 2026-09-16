/**
 * The ON switch for direct publishing lives in the environment. What must hold: unset is off;
 * a real implemented provider turns on; a typo or an unimplemented provider is dropped with a
 * warning rather than switched on; and the implemented list matches the adapters that exist.
 */

import { liveConnectorsFromEnv, IMPLEMENTED_CONNECTORS, LIVE_CONNECTORS, decidePublishMode, getProviderCapabilities } from '../providerCapabilities';
import { LIVE_ADAPTER_KEYS } from '../adapterRegistry';

beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

it('unset or empty means OFF, with no default-on', () => {
  expect(liveConnectorsFromEnv({}).size).toBe(0);
  expect(liveConnectorsFromEnv({ LIVE_CONNECTORS: '' }).size).toBe(0);
  expect(liveConnectorsFromEnv({ LIVE_CONNECTORS: ' , ' }).size).toBe(0);
  expect(LIVE_CONNECTORS.size).toBe(0); // this test process has no LIVE_CONNECTORS set
});

it('turns on exactly the implemented providers named, tolerating spaces', () => {
  const on = liveConnectorsFromEnv({ LIVE_CONNECTORS: ' linkedin_member, linkedin_organization ' });
  expect([...on].sort()).toEqual(['linkedin_member', 'linkedin_organization']);
  expect(decidePublishMode(getProviderCapabilities('linkedin_member'), 'publish', on).mode).toBe('direct');
  expect(decidePublishMode(getProviderCapabilities('linkedin_member'), 'publish', new Set()).mode).toBe('handoff');
});

it('drops a typo and a provider with no adapter, each with a warning, rather than switching it on', () => {
  const on = liveConnectorsFromEnv({ LIVE_CONNECTORS: 'linkedin_member,linkedn_member,meta_instagram' });
  expect([...on]).toEqual(['linkedin_member']);
  const warned = (console.warn as jest.Mock).mock.calls.map((c) => JSON.parse(c[0]));
  expect(warned.map((w) => [w.event, w.context.key])).toEqual([
    ['live_connector_unknown', 'linkedn_member'],
    ['live_connector_not_implemented', 'meta_instagram'],
  ]);
  // Meta has a self-serve-looking registry entry but no adapter; switching it on would recreate
  // the first dev deploy's no_live_adapter dead letters. The env cannot do that.
  expect(decidePublishMode(getProviderCapabilities('meta_instagram'), 'publish', on).mode).toBe('handoff');
});

it('IMPLEMENTED_CONNECTORS is exactly the set of adapters the registry can build', () => {
  expect([...IMPLEMENTED_CONNECTORS].sort()).toEqual([...LIVE_ADAPTER_KEYS].sort());
});
