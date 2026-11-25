/**
 * VS4.2 Test Lab limits against a REAL Postgres (the CI integration tier): one start at a time, and an
 * opt-out said on a test call stops that run only.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts testLabLimits.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[testLabLimits.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('Test Lab limits against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let L: typeof import('../../testlab/testLabService');
  const run = (runId: string) => ({ runId, destinationId: 'test-allowed', engine: 'conversation_relay', script: 'smoke', confirm: true }) as Parameters<typeof L.testGatewayDeps>[0];
  const suppressed = (runId: string) => L.testGatewayDeps(run(runId), {} as Parameters<typeof L.testGatewayDeps>[1]).suppressedFor({} as never, '');

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    L = await import('../../testlab/testLabService');
  });
  beforeEach(async () => { await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${L.TEST_TENANT_ID}'`); });
  afterAll(async () => { await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${L.TEST_TENANT_ID}'`); await sequelize.close(); });

  it('of 30 at once, one holds the lock and the rest are refused at once, leaving the pool usable', async () => {
    const { withLock } = L.productionTestLabDeps();
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    const first = withLock(async () => { await held; return 'ok'; });
    await new Promise((r) => { setTimeout(r, 200); });
    const rest = await Promise.allSettled(Array.from({ length: 30 }, () => withLock(async () => 'no')));
    expect(rest.every((r) => r.status === 'rejected' && (r.reason as Error).name === 'TestLockBusy')).toBe(true);
    await expect(sequelize.query('SELECT 1')).resolves.toBeDefined();
    release();
    expect(await first).toBe('ok');
    expect(await withLock(async () => 'again')).toBe('again');
  });

  it('an opt-out on a test call stops that run, and only that run', async () => {
    await sequelize.query(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose, test_mode, state_reason) VALUES ('${L.TEST_TENANT_ID}', 'conversation_relay', 'testlab:run-aaaaaa:1', 'r', 't', TRUE, 'caller_opt_out')`);
    expect(await suppressed('run-aaaaaa')).toBe(true);
    expect(await suppressed('run-bbbbbb')).toBe(false);
  });
});
