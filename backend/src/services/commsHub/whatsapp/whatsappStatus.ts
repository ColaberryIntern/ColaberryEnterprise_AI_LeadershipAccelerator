import { NOT_CONFIGURED_TEXT, readWhatsAppConfig, type WhatsAppConfig } from './config';
import { WhatsAppProviderError, type WhatsAppProvider } from './provider';
import { createWhapiProvider } from './whapiProvider';

/**
 * CH10.1 What the WhatsApp card shows. A pure read: one health call when configured, none otherwise.
 * The connected number is reduced to its last 4 digits here; the full number and the token never
 * leave the backend.
 */
export type WhatsAppState = 'not_configured' | 'connected' | 'waiting_for_qr' | 'disconnected';

export interface WhatsAppStatus {
  configured: boolean;
  enabled: boolean;
  state: WhatsAppState;
  number_last4: string | null;
  reason: string | null;
}

const STATE_REASON: Record<string, string> = {
  NOT_INIT: 'The WhatsApp channel has not started yet.',
  INIT: 'The WhatsApp channel is starting.',
  LAUNCH: 'The WhatsApp channel is starting.',
  ERROR: 'The WhatsApp channel reported an error.',
  SYNC_ERROR: 'The phone and the WhatsApp channel are out of sync.',
};

/** The one place that turns the configuration into a provider (or none). */
export function providerFor(config: WhatsAppConfig): WhatsAppProvider | null {
  return config.token ? createWhapiProvider({ baseUrl: config.baseUrl, token: config.token }) : null;
}

export function stateFromHealth(raw: string): { state: WhatsAppState; reason: string | null } {
  if (raw === 'AUTH') return { state: 'connected', reason: null };
  if (raw === 'QR') return { state: 'waiting_for_qr', reason: 'Scan the QR code on the WhatsApp channel with the company phone.' };
  return { state: 'disconnected', reason: STATE_REASON[raw] ?? `The WhatsApp channel is in an unexpected state (${raw.slice(0, 20)}).` };
}

export async function whatsappStatus(deps: { config?: WhatsAppConfig; provider?: WhatsAppProvider | null } = {}): Promise<WhatsAppStatus> {
  const config = deps.config ?? readWhatsAppConfig();
  if (config.notConfigured) {
    return { configured: false, enabled: config.enabled, state: 'not_configured', number_last4: null, reason: NOT_CONFIGURED_TEXT[config.notConfigured] };
  }
  const provider = deps.provider !== undefined ? deps.provider : providerFor(config);
  if (!provider) return { configured: false, enabled: config.enabled, state: 'not_configured', number_last4: null, reason: NOT_CONFIGURED_TEXT.no_token };
  try {
    const h = await provider.health();
    const { state, reason } = stateFromHealth(h.state);
    return { configured: true, enabled: true, state, number_last4: state === 'connected' && h.number ? h.number.slice(-4) : null, reason };
  } catch (err) {
    const reason = err instanceof WhatsAppProviderError
      ? (err.errorClass === 'NotConnectedError' ? 'The WhatsApp token was refused. Check the token on the channel.' : err.message)
      : 'The WhatsApp status could not be read.';
    return { configured: true, enabled: true, state: 'disconnected', number_last4: null, reason };
  }
}
