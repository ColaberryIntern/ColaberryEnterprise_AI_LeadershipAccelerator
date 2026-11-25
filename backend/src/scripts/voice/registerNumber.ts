/**
 * voice:numbers:register (VS2.5): register ONE Twilio number we already own (M0 Q3: reuse an idle
 * number, $0) as the Voice Studio test line, by its Twilio SID. Nobody types the number.
 *
 *   node dist/scripts/voice/registerNumber.js --sid PN... [--ref test-line] [--dry]
 *
 * Reads the number from the Twilio API (GET, read-only, 10 s timeout), requires voice capability,
 * then upserts voice_numbers (status active) idempotently on (provider, provider_number_id).
 * It does NOT change the number's Twilio voice webhook or any routing. Prints the last 4 digits only.
 */
import { QueryTypes } from 'sequelize';
import { loadTwilioCredentials, type TwilioCredentials } from '../../services/voice/twilio/twilioCredentials';

const arg = (argv: string[], name: string): string | undefined => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };
export const last4 = (e164: string): string => `***${e164.slice(-4)}`;

export interface OwnedNumber { sid: string; e164: string; voice: boolean }

export async function fetchOwnedNumber(creds: TwilioCredentials, sid: string, fetchImpl: typeof fetch = fetch): Promise<OwnedNumber> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers/${encodeURIComponent(sid)}.json`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${creds.apiKeySid}:${creds.apiKeySecret}`).toString('base64') }, signal: ctl.signal,
    });
    if (res.status === 404) throw Object.assign(new Error('number not on this account'), { name: 'NumberNotOwned' });
    if (!res.ok) throw Object.assign(new Error(`twilio status ${res.status}`), { name: 'UpstreamUnavailable' });
    const body = (await res.json()) as { sid?: string; phone_number?: string; capabilities?: { voice?: boolean } };
    if (!body.phone_number || !/^\+[1-9]\d{6,14}$/.test(body.phone_number)) throw Object.assign(new Error('no E.164 number in response'), { name: 'ContractViolation' });
    return { sid, e164: body.phone_number, voice: body.capabilities?.voice === true };
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<number> {
  const sid = arg(process.argv, '--sid');
  const ref = arg(process.argv, '--ref') ?? 'test-line';
  if (!sid || !/^PN[0-9a-f]{32}$/i.test(sid)) { console.error('usage: --sid PN<32 hex> [--ref test-line] [--dry]'); return 2; }
  const creds = loadTwilioCredentials();
  if (!creds.ok) { console.error(`Twilio credentials invalid: ${creds.invalid.join(', ')}`); return 2; }
  const n = await fetchOwnedNumber(creds.creds, sid);
  if (!n.voice) { console.error(`number ${last4(n.e164)} is not voice-capable`); return 2; }
  if (process.argv.includes('--dry')) { console.log(JSON.stringify({ dry: true, sid, ref, number: last4(n.e164), voice: n.voice })); return 0; }
  const { sequelize } = await import('../../config/database');
  const { TEST_TENANT_ID } = await import('../../services/voice/testlab/testLabService');
  await sequelize.query(
    `INSERT INTO voice_numbers (tenant_id, provider, provider_number_id, number_ref, e164_restricted, capabilities, ownership, status)
     VALUES (:t, 'twilio', :sid, :ref, :e164, '{"voice": true}'::jsonb, 'owned', 'active')
     ON CONFLICT (provider, provider_number_id) DO UPDATE SET number_ref = EXCLUDED.number_ref, status = 'active', updated_at = NOW()`,
    { replacements: { t: TEST_TENANT_ID, sid, ref, e164: n.e164 }, type: QueryTypes.INSERT });
  console.log(JSON.stringify({ registered: true, sid, ref, number: last4(n.e164) }));
  await sequelize.close();
  return 0;
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_register_number_failed', error_class: e.name || 'Error' })); process.exit(1); });
}
