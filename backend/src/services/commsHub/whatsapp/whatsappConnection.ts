import { readWhatsAppConfig, NOT_CONFIGURED_TEXT, type WhatsAppConfig } from './config';
import { NotConnectedError, type WhatsAppProvider } from './provider';
import { providerFor, stateFromHealth } from './whatsappStatus';

/**
 * CH10.2 "Is WhatsApp usable right now?" for anything that acts (sync, and in CH10.4 sending).
 * Returns the provider and our number only when the channel is configured AND linked (health AUTH);
 * otherwise throws NotConnectedError with the plain-words reason.
 */
export interface Connection { provider: WhatsAppProvider; number: string }

export async function requireConnection(deps: { config?: WhatsAppConfig; provider?: WhatsAppProvider | null } = {}): Promise<Connection> {
  const config = deps.config ?? readWhatsAppConfig();
  if (config.notConfigured) throw new NotConnectedError(NOT_CONFIGURED_TEXT[config.notConfigured], null);
  const provider = deps.provider !== undefined ? deps.provider : providerFor(config);
  if (!provider) throw new NotConnectedError(NOT_CONFIGURED_TEXT.no_token, null);
  const health = await provider.health();
  const { state, reason } = stateFromHealth(health.state);
  if (state !== 'connected') throw new NotConnectedError(reason ?? 'WhatsApp is not connected.', null);
  if (!health.number) throw new NotConnectedError('WhatsApp is connected but did not say which number it is.', null);
  return { provider, number: health.number };
}

/** A participant id may be bare digits or "digits@s.whatsapp.net"; compare the digits. */
export function sameNumber(participantId: string, number: string): boolean {
  const digits = (participantId.split('@')[0] ?? '').replace(/\D/g, '');
  return digits.length > 0 && digits === number.replace(/\D/g, '');
}
