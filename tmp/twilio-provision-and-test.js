#!/usr/bin/env node
// Search for an available 682 area code number, buy ONE, send a test SMS.
// Idempotent: skips purchase if TWILIO_NUMBER already set.

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
const aliPhone = process.env.ALI_PHONE_NUMBER;
let twilioNumber = process.env.TWILIO_NUMBER;

if (!accountSid || !apiKeySid || !apiKeySecret) { console.error('Missing Twilio creds'); process.exit(1); }
if (!aliPhone) { console.error('Missing ALI_PHONE_NUMBER'); process.exit(1); }

const auth = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
const headers = { Authorization: `Basic ${auth}` };
const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

(async () => {
  if (!twilioNumber) {
    console.log('=== Searching available 682 area code numbers (SMS capable) ===');
    const searchUrl = `${base}/AvailablePhoneNumbers/US/Local.json?AreaCode=682&SmsEnabled=true&Limit=5`;
    const r = await fetch(searchUrl, { headers });
    const data = await r.json();
    if (!data.available_phone_numbers || data.available_phone_numbers.length === 0) {
      // Fall back: any US number with SMS
      console.log('No 682 numbers available. Trying any US SMS-capable number...');
      const r2 = await fetch(`${base}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&Limit=5`, { headers });
      const d2 = await r2.json();
      if (!d2.available_phone_numbers || d2.available_phone_numbers.length === 0) {
        console.error('No available numbers at all'); process.exit(2);
      }
      data.available_phone_numbers = d2.available_phone_numbers;
    }
    const candidates = data.available_phone_numbers.slice(0, 5);
    for (const n of candidates) console.log(`  ${n.phone_number}  ${n.friendly_name}  (${n.locality || ''}, ${n.region || ''})`);
    const pick = candidates[0];
    console.log(`Picking: ${pick.phone_number}`);

    console.log('=== Purchasing ===');
    const buyR = await fetch(`${base}/IncomingPhoneNumbers.json`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ PhoneNumber: pick.phone_number, FriendlyName: 'Colaberry CB System (Ali VIP SMS routing)' }).toString(),
    });
    if (!buyR.ok) { console.error('Purchase failed:', buyR.status, await buyR.text()); process.exit(3); }
    const bought = await buyR.json();
    twilioNumber = bought.phone_number;
    console.log(`PURCHASED: ${twilioNumber} (sid ${bought.sid})`);
    console.log(`\n>>> Add to /opt/colaberry-accelerator/.env: TWILIO_NUMBER=${twilioNumber} <<<`);
  } else {
    console.log(`Using existing TWILIO_NUMBER=${twilioNumber}`);
  }

  console.log('\n=== Sending test SMS to Ali ===');
  const sendR = await fetch(`${base}/Messages.json`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      To: aliPhone, From: twilioNumber,
      Body: 'VIP SMS routing test from CB System. If you got this, Track A1 end-to-end works. Reply with anything to confirm.',
    }).toString(),
  });
  if (!sendR.ok) { console.error('Send failed:', sendR.status, await sendR.text()); process.exit(4); }
  const sent = await sendR.json();
  console.log(`SENT: msg sid ${sent.sid}, status ${sent.status}`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
