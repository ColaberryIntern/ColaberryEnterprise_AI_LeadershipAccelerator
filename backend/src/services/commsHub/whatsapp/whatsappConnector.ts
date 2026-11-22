import { readWhatsAppConfig, NOT_CONFIGURED_TEXT, type WhatsAppConfig } from '../channelConfig';
import { ConnectorHoldError, ConnectorPermanentError, type Connector, type ConnectorDelivery, type ConnectorResult } from '../connectors/types';
import { ForbiddenError, NotConnectedError, QuotaExceededError, RateLimitedError, WhatsAppProviderError, BadRequestError, type WhatsAppProvider } from './provider';
import { requireConnection } from './whatsappConnection';
import {
  CHECK_FAILED_HOLD_MS, DISCONNECTED_HOLD_MS, dailyCapHoldUntil, findEarlierSend, lookBackFrom, nextSendAt, windowHoldUntil,
} from './sendRules';
import { sendStateStore, type SendStateStore } from './sendState';
import { raiseChannelAlert, type ChannelAlert } from './channelAlerts';

/**
 * CH10.4 The WhatsApp connector: one approved message to one switched-on group, sent once.
 *
 * In this order, every check that says "not now" is a HOLD (the try is given back, W6/W7):
 *   1. WhatsApp switched on and allowed (otherwise a permanent failure with the reason);
 *   2. the breaker (WhatsApp limited the number: 48 hours) and the pacing gap, re-read under the
 *      hub-wide send lock (the claim already skips them; this holds even with two backends);
 *   3. the 8 AM to 8 PM Central window, and the daily cap;
 *   4. the phone is linked (health AUTH): otherwise a 10-minute hold, so a re-link resumes sending;
 *   5. W5 dedup: our own messages in the group since the first claim (minus 120 s of clock margin),
 *      matched on the exact text (normalized), excluding ids other deliveries recorded. One match:
 *      recorded as sent, not sent again. Several: a permanent failure and an alert (never resend).
 *      The check failing: a 5-minute hold, and no send;
 *   6. reserve the send (today's count, the next gap: 40 s plus a random 0 to 40 s) BEFORE sending,
 *      so a crash can never let a burst through;
 *   7. ONE message: the banner image with the text as its caption, or the text alone.
 * Provider errors (W7): 429 opens the breaker and alerts once; 403 marks the group can't-send and
 * fails; 402 fails and alerts; 401 holds; 5xx or a timeout retries (and the retry runs step 5 first).
 */
export interface WhatsAppConnectorDeps {
  config: () => WhatsAppConfig;
  connect: () => Promise<{ provider: WhatsAppProvider; number: string }>;
  state: SendStateStore;
  alert: (a: ChannelAlert) => Promise<void>;
  now: () => Date;
  random: () => number;
}

const defaults: WhatsAppConnectorDeps = {
  config: () => readWhatsAppConfig(), connect: () => requireConnection(), state: sendStateStore,
  alert: raiseChannelAlert, now: () => new Date(), random: Math.random,
};

export function createWhatsAppConnector(overrides: Partial<WhatsAppConnectorDeps> = {}): Connector {
  const deps = { ...defaults, ...overrides };
  return {
    channel: 'whatsapp',
    async send(d: ConnectorDelivery): Promise<ConnectorResult> {
      const config = deps.config();
      if (config.notConfigured) throw new ConnectorPermanentError(`${NOT_CONFIGURED_TEXT[config.notConfigured]} Nothing was sent.`, 'whatsapp_off');
      const now = deps.now();
      const s = await deps.state.read();
      if (s.breaker_until && s.breaker_until > now) throw new ConnectorHoldError(s.breaker_until, 'whatsapp_paused_by_whatsapp');
      if (s.next_send_at && s.next_send_at > now) throw new ConnectorHoldError(s.next_send_at, 'whatsapp_pacing');
      const closed = windowHoldUntil(now);
      if (closed) throw new ConnectorHoldError(closed, 'whatsapp_window');
      const capped = dailyCapHoldUntil(s, config.dailyCap, now);
      if (capped) throw new ConnectorHoldError(capped, 'whatsapp_daily_cap');

      const group = await deps.state.providerGroupId(d.destination.target_id);
      if (!group) throw new ConnectorPermanentError('That WhatsApp group is no longer in the hub.', 'whatsapp_group_gone');
      let provider: WhatsAppProvider;
      try { ({ provider } = await deps.connect()); } catch (err) {
        if (err instanceof RateLimitedError) return handleProviderError(err, d, group, now);
        // Not linked, not AUTH, or the health check did not answer: wait 10 minutes (a re-link resumes sending).
        if (err instanceof WhatsAppProviderError) throw new ConnectorHoldError(new Date(now.getTime() + DISCONNECTED_HOLD_MS), 'whatsapp_disconnected');
        throw err;
      }
      const body = d.draft.body;

      // 5. W5: was it already sent by an earlier attempt?
      let earlier;
      try {
        const sent = await provider.listSentSince(group, lookBackFrom(d.since));
        earlier = findEarlierSend(sent, body, await deps.state.recordedElsewhere(sent.map((m) => m.id), d.deliveryId));
      } catch (err) {
        if (err instanceof RateLimitedError) return handleProviderError(err, d, group, now);
        throw new ConnectorHoldError(new Date(now.getTime() + CHECK_FAILED_HOLD_MS), 'whatsapp_check_failed');
      }
      if (earlier.kind === 'one') return { provider_message_id: earlier.id, reached: 1, already_done: true };
      if (earlier.kind === 'many') {
        await deps.alert({ key: `ambiguous:${d.deliveryId}`, title: 'A WhatsApp message was not resent: it looked sent more than once', description: `The hub found ${earlier.ids.length} matching messages in the group and did not send again. Check the group and Schedule & history.` });
        throw new ConnectorPermanentError('Found more than one matching message in the group, so it was not sent again.', 'whatsapp_ambiguous');
      }

      // 6 and 7.
      await deps.state.reserve(now, nextSendAt(now, deps.random));
      try {
        const media = d.media_urls?.[0];
        const r = media ? await provider.sendImage(group, media, body) : await provider.sendText(group, body);
        return { provider_message_id: r.id, reached: 1, already_done: false };
      } catch (err) {
        return handleProviderError(err, d, group, now);
      }
    },
  };

  async function handleProviderError(err: unknown, d: ConnectorDelivery, _group: string, now: Date): Promise<never> {
    if (err instanceof RateLimitedError) {
      const until = await deps.state.openBreaker(now, 'rate_limited');
      await deps.alert({ key: `breaker:${until.toISOString()}`, title: 'WhatsApp paused the hub number for 48 hours', description: 'WhatsApp is limiting the hub number, so the hub stopped sending to WhatsApp for 48 hours. Other channels keep sending. Do not clear this early.' });
      throw new ConnectorHoldError(until, 'whatsapp_paused_by_whatsapp');
    }
    if (err instanceof ForbiddenError) {
      await deps.state.markForbidden(d.destination.target_id);
      throw new ConnectorPermanentError('WhatsApp refused a message to this group. The group is switched off.', 'whatsapp_forbidden');
    }
    if (err instanceof QuotaExceededError) {
      await deps.alert({ key: `quota:${now.toISOString().slice(0, 10)}`, title: 'The WhatsApp plan has no messages left', description: 'WhatsApp sends are failing because the plan quota is used up. Check the Whapi.Cloud plan.' });
      throw new ConnectorPermanentError('The WhatsApp plan has no messages left.', 'whatsapp_quota');
    }
    if (err instanceof NotConnectedError) throw new ConnectorHoldError(new Date(now.getTime() + DISCONNECTED_HOLD_MS), 'whatsapp_disconnected');
    if (err instanceof BadRequestError) throw new ConnectorPermanentError(`WhatsApp rejected the message: ${err.message}`, 'whatsapp_rejected');
    throw err; // UpstreamUnavailable and anything else: retried, and the retry checks for the message first.
  }
}
