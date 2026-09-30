#!/usr/bin/env node
/**
 * testPaySimpleWebhook.js
 *
 * Fires a signed PaySimple payment_created webhook at the local backend.
 * No external CLI tool required — we generate the HMAC signature ourselves.
 *
 * Usage:
 *   node backend/scripts/testPaySimpleWebhook.js [external_id]
 *
 * Env vars:
 *   PAYSIMPLE_WEBHOOK_SECRET  — must match what the backend is started with
 *                               (default: local-test-secret-paysimple)
 *   PORT                      — backend port (default: 3001)
 *
 * Prerequisites:
 *   1. A pending enrollment row with the given paysimple_external_id exists in DB
 *   2. Backend is running: pwsh ./backend/start-paysimple-test.ps1
 *
 * Quick DB seed (run once):
 *   docker exec accelerator-db psql "postgresql://accelerator:accelerator@localhost/accelerator_dev" -c \
 *     "INSERT INTO enrollments (id, full_name, email, company, cohort_id, paysimple_external_id, payment_status, payment_method) \
 *      SELECT gen_random_uuid(), 'Test User', 'webhook-test@colaberry-test.local', 'TestCo', \
 *             id, 'CB-TEST-1234567890', 'pending', 'credit_card' \
 *      FROM cohorts WHERE status='open' ORDER BY created_at ASC LIMIT 1 \
 *      ON CONFLICT DO NOTHING;"
 */

const http = require('http');
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.PAYSIMPLE_WEBHOOK_SECRET || 'local-test-secret-paysimple';
const PORT = parseInt(process.env.PORT || '3001', 10);
const EXTERNAL_ID = process.argv[2] || 'CB-TEST-1234567890';

const payload = JSON.stringify({
  event_type: 'payment_created',
  event_id: `evt_local_${Date.now()}`,
  merchant_id: 99999,
  data: {
    order_external_id: EXTERNAL_ID,
    payment_id: Date.now() * 1000 + Math.floor(Math.random() * 1000), // unique per run
    amount: 4500,
    payment_status: 'authorized',
    payment_type: 'credit_card',
    customer_id: 100,
  },
});

const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

console.log(`\nFiring PaySimple webhook to localhost:${PORT}`);
console.log(`  external_id: ${EXTERNAL_ID}`);
console.log(`  secret:      ${WEBHOOK_SECRET}`);
console.log(`  signature:   ${signature.slice(0, 16)}...`);
console.log('');

const options = {
  hostname: 'localhost',
  port: PORT,
  path: '/api/webhook/paysimple',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'paysimple-hmac-sha256': signature,
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    console.log(`Status: ${res.statusCode} ${ok ? '✓ OK' : '✗ FAILED'}`);
    console.log(`Response: ${data}`);
    if (!ok) process.exit(1);

    console.log('\nVerify DB (run in another terminal):');
    console.log(`  docker exec accelerator-db psql "postgresql://accelerator:accelerator@localhost/accelerator_dev" \\`);
    console.log(`    -c "SELECT id, email, payment_status, amount_paid, enrolled_at, paysimple_payment_id FROM enrollments WHERE paysimple_external_id='${EXTERNAL_ID}';"`);
    console.log('');
    console.log(`  docker exec accelerator-db psql "postgresql://accelerator:accelerator@localhost/accelerator_dev" \\`);
    console.log(`    -c "SELECT email, status, enrollment_id FROM enrollment_leads WHERE email='webhook-test@colaberry-test.local';"`);
  });
});

req.on('error', (err) => {
  console.error('\n✗ Request failed:', err.message);
  console.error('Is the backend running? pwsh ./backend/start-paysimple-test.ps1');
  process.exit(1);
});

req.write(payload);
req.end();
