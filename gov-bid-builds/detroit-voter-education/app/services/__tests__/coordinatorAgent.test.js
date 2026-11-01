const assert = require('node:assert/strict');
const {
  computeNotificationLatencyMs, NOTIFICATION_SLA_MS,
  computePublishLatencyMs, PUBLISH_SLA_MS,
} = require('../coordinatorAgent');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('immediate notification — zero latency meets SLA', () => {
  const t = new Date('2026-07-14T12:00:00.000Z');
  const result = computeNotificationLatencyMs(t, t);
  assert.equal(result.latencyMs, 0);
  assert.equal(result.meetsSla, true);
});

test('notification within 15 minutes meets SLA', () => {
  const submitted = new Date('2026-07-14T12:00:00.000Z');
  const notified = new Date('2026-07-14T12:14:59.000Z');
  const result = computeNotificationLatencyMs(submitted, notified);
  assert.equal(result.meetsSla, true);
});

test('notification at exactly 15 minutes meets SLA (boundary)', () => {
  const submitted = new Date('2026-07-14T12:00:00.000Z');
  const notified = new Date(submitted.getTime() + NOTIFICATION_SLA_MS);
  const result = computeNotificationLatencyMs(submitted, notified);
  assert.equal(result.latencyMs, NOTIFICATION_SLA_MS);
  assert.equal(result.meetsSla, true);
});

test('notification past 15 minutes misses SLA', () => {
  const submitted = new Date('2026-07-14T12:00:00.000Z');
  const notified = new Date('2026-07-14T12:15:01.000Z');
  const result = computeNotificationLatencyMs(submitted, notified);
  assert.equal(result.meetsSla, false);
});

test('accepts ISO string inputs, not just Date objects', () => {
  const result = computeNotificationLatencyMs('2026-07-14T12:00:00.000Z', '2026-07-14T12:00:05.000Z');
  assert.equal(result.latencyMs, 5000);
  assert.equal(result.meetsSla, true);
});

test('negative latency (notified before submitted) never meets SLA', () => {
  const submitted = new Date('2026-07-14T12:00:00.000Z');
  const notified = new Date('2026-07-14T11:59:59.000Z');
  const result = computeNotificationLatencyMs(submitted, notified);
  assert.equal(result.latencyMs, -1000);
  assert.equal(result.meetsSla, false);
});

test('immediate publish — zero latency meets the 1-hour SLA', () => {
  const t = new Date('2026-07-14T12:00:00.000Z');
  const result = computePublishLatencyMs(t, t);
  assert.equal(result.latencyMs, 0);
  assert.equal(result.meetsSla, true);
});

test('publish at exactly 1 hour meets SLA (boundary)', () => {
  const approved = new Date('2026-07-14T12:00:00.000Z');
  const published = new Date(approved.getTime() + PUBLISH_SLA_MS);
  const result = computePublishLatencyMs(approved, published);
  assert.equal(result.latencyMs, PUBLISH_SLA_MS);
  assert.equal(result.meetsSla, true);
});

test('publish past 1 hour misses SLA', () => {
  const approved = new Date('2026-07-14T12:00:00.000Z');
  const published = new Date('2026-07-14T13:00:01.000Z');
  const result = computePublishLatencyMs(approved, published);
  assert.equal(result.meetsSla, false);
});

test('publish latency and notification latency use independent SLA windows', () => {
  assert.equal(PUBLISH_SLA_MS, 60 * 60 * 1000);
  assert.equal(NOTIFICATION_SLA_MS, 15 * 60 * 1000);
  assert.notEqual(PUBLISH_SLA_MS, NOTIFICATION_SLA_MS);
});

console.log(`\n${passed} passed`);
