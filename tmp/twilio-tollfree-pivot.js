#!/usr/bin/env node
// Pivot: release the 10DLC-blocked 682 number, buy a toll-free, retest.
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
const aliPhone = process.env.ALI_PHONE_NUMBER;
const OLD_NUMBER_SID = 'PNdb371dd7762cc2064af937658db1c874';

const auth = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
const headers = { Authorization: `Basic ${auth}` };
const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

(async () => {
  console.log('=== Release blocked 682 number ===');
  const releaseR = await fetch(`${base}/IncomingPhoneNumbers/${OLD_NUMBER_SID}.json`, { method: 'DELETE', headers });
  console.log(`Release status: ${releaseR.status}`);

  console.log('\n=== Search available toll-free numbers (SMS capable) ===');
  const searchR = await fetch(`${base}/AvailablePhoneNumbers/US/TollFree.json?SmsEnabled=true&Limit=5`, { headers });
  const sd = await searchR.json();
  if (!sd.available_phone_numbers || sd.available_phone_numbers.length === 0) {
    console.error('No toll-free numbers available'); process.exit(2);
  }
  for (const n of sd.available_phone_numbers) console.log(`  ${n.phone_number}  ${n.friendly_name}`);
  const pick = sd.available_phone_numbers[0];
  console.log(`Picking: ${pick.phone_number}`);

  console.log('\n=== Purchase ===');
  const buyR = await fetch(`${base}/IncomingPhoneNumbers.json`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ PhoneNumber: pick.phone_number, FriendlyName: 'Colaberry CB System TF (Ali VIP SMS)' }).toString(),
  });
  if (!buyR.ok) { console.error('Buy failed:', buyR.status, await buyR.text()); process.exit(3); }
  const bought = await buyR.json();
  const newNumber = bought.phone_number;
  console.log(`PURCHASED: ${newNumber} (sid ${bought.sid})`);

  console.log('\n=== Send test SMS ===');
  const sendR = await fetch(`${base}/Messages.json`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      To: aliPhone, From: newNumber,
      Body: 'VIP SMS test from CB System (toll-free). End-to-end Track A1 working if you got this.',
    }).toString(),
  });
  if (!sendR.ok) { console.error('Send failed:', sendR.status, await sendR.text()); process.exit(4); }
  const sent = await sendR.json();
  console.log(`SENT: msg sid ${sent.sid}, status ${sent.status}`);
  console.log(`\n>>> Update /opt/colaberry-accelerator/.env: TWILIO_NUMBER=${newNumber} <<<`);

  // Poll status for 30s
  console.log('\n=== Polling delivery status (10s intervals, max 30s) ===');
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const statR = await fetch(`${base}/Messages/${sent.sid}.json`, { headers });
    const sd = await statR.json();
    console.log(`  t+${(i + 1) * 10}s: status=${sd.status} error_code=${sd.error_code || '-'} error_msg=${sd.error_message || '-'}`);
    if (sd.status === 'delivered' || sd.status === 'failed' || sd.status === 'undelivered') break;
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
