#!/usr/bin/env node
const path = require('path');
const { routeInboundEmail, readMode, writeMode } = require(path.resolve(__dirname, '../backend/src/scripts/lib/vipSmsRouter'));

(async () => {
  console.log('mode before:', readMode());
  writeMode('live');
  console.log('mode after:', readMode());

  // Simulate an inbound email from Adalene (priority 1, VIP)
  const result = await routeInboundEmail({
    senderEmail: 'addie.m.mack@gmail.com',
    senderName: 'Adalene Mack Muwwakkil',
    subject: 'Need you to call school - pickup change tomorrow',
    body: 'Hey, school just emailed - tomorrow they need pickup at 2:15 instead of 3pm because of an early dismissal. I am stuck in a meeting til 3. Can you cover? Reply asap. -A',
    gmailMessageUrl: null,
  });

  console.log('\n--- Result ---');
  console.log(JSON.stringify(result, null, 2));

  // Test non-VIP (should NOT fire)
  const result2 = await routeInboundEmail({
    senderEmail: 'spam@randommarketing.com',
    senderName: 'Random Marketing',
    subject: 'Free trial!',
    body: 'Hey check this out...',
  });
  console.log('\n--- Non-VIP result (should not fire) ---');
  console.log(JSON.stringify(result2, null, 2));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
