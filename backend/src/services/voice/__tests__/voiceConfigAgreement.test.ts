/**
 * One source of truth (VS1.7 verifier attempt 1): every runtime reader of a validated VOICE_* setting must
 * agree with loadVoiceConfig, which is what the boot log and voice:preflight report. Before this, an
 * invalid unrelated VOICE_* value made preflight say "gateway off" while triggerVoiceCall still routed
 * through the gateway, and a too-short hash key was used at runtime while preflight said "unset".
 */
import { loadVoiceConfig } from '../voiceConfig';
import { isLegacyGatewayEnabled } from '../gateway/legacyFacade';
import { destinationHashKey, hashDestination } from '../gateway/destinationHash';

jest.mock('../../launchSafety', () => ({ isKillSwitchActiveStrict: jest.fn(async () => false) }));
jest.mock('../voiceDialGuard', () => ({ isStaffAlertNumber: jest.fn(async () => false) }));

const KEYS = ['VOICE_GATEWAY_LEGACY_ENABLED', 'VOICE_TEST_MAX_ATTEMPTS', 'VOICE_DESTINATION_HASH_KEY'];
function withEnv(vars: Record<string, string>, fn: () => void) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try { fn(); } finally {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

describe('validated voice config is the single source of truth', () => {
  it('a valid VOICE_GATEWAY_LEGACY_ENABLED=true turns the facade on everywhere', () => {
    withEnv({ VOICE_GATEWAY_LEGACY_ENABLED: 'true' }, () => {
      expect(loadVoiceConfig().VOICE_GATEWAY_LEGACY_ENABLED).toBe(true);
      expect(isLegacyGatewayEnabled()).toBe(true);
    });
  });

  it('VOICE_GATEWAY_LEGACY_ENABLED=true plus an INVALID unrelated value means OFF everywhere (fails safe, agrees with preflight)', () => {
    withEnv({ VOICE_GATEWAY_LEGACY_ENABLED: 'true', VOICE_TEST_MAX_ATTEMPTS: '4' }, () => {
      expect(loadVoiceConfig().valid).toBe(false);
      expect(loadVoiceConfig().VOICE_GATEWAY_LEGACY_ENABLED).toBe(false);
      expect(isLegacyGatewayEnabled()).toBe(false);
    });
  });

  it('a too-short hash key is not used at runtime; the derived key is, exactly as preflight reports', () => {
    withEnv({ VOICE_DESTINATION_HASH_KEY: 'shortkey' }, () => {
      expect(loadVoiceConfig().VOICE_DESTINATION_HASH_KEY).toBeUndefined();
      expect(destinationHashKey()).not.toBe('shortkey');
      expect(destinationHashKey()).toMatch(/^voice-destination:/);
    });
  });

  it('a valid hash key IS used, and changes the hash', () => {
    const before = hashDestination('+15555550100');
    withEnv({ VOICE_DESTINATION_HASH_KEY: 'a-long-enough-hash-key-123' }, () => {
      expect(destinationHashKey()).toBe('a-long-enough-hash-key-123');
      expect(hashDestination('+15555550100')).not.toBe(before);
    });
  });

  it('no source file reads these validated settings from process.env directly', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const root = path.resolve(__dirname, '..', '..', '..');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|js)$/.test(e.name) || p.endsWith('voiceConfig.ts')) continue;
        if (/process\.env\.(VOICE_GATEWAY_LEGACY_ENABLED|VOICE_DESTINATION_HASH_KEY|VOICE_STUDIO_ENABLED|VOICE_TEST_[A-Z_]+|VOICE_ENGINE_DEFAULT)\b/.test(fs.readFileSync(p, 'utf8'))) {
          offenders.push(path.relative(root, p).replace(/\\/g, '/'));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
