#!/usr/bin/env node
const path = require('path');
const { findVip, listVips, readMode, smsCount24h } = require(path.resolve(__dirname, '../backend/src/scripts/lib/vipSmsRouter'));
console.log('mode:', readMode());
console.log('smsCount24h:', smsCount24h());
console.log('adalene:', JSON.stringify(findVip('addie.m.mack@gmail.com'), null, 2));
console.log('non-vip:', JSON.stringify(findVip('random@example.com')));
console.log('count:', listVips().length);
