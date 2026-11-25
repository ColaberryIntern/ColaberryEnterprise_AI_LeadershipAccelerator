/**
 * voice:test:live (VS2.5): place ONE live test call to the authorized number through the Test Lab.
 * Run on the production host inside the backend container, by a person, inside the window agreed at
 * M2. It REFUSES in CI before touching anything, and requires --confirm.
 *
 *   node dist/scripts/voice/testLive.js --run <run-id> --engine relay|realtime --script live-01 --confirm
 *
 * Exit: 0 accepted (or unknown: reconcile, never retry), 2 refused/invalid, 3 CI refusal, 1 error.
 */
import { isCi } from '../../services/voice/testlab/testLabPolicy';
import type { TestLabDeps, TestLabResult } from '../../services/voice/testlab/testLabService';

export const HELP = `voice:test:live --run <id> --engine relay|realtime --script live-01|live-02|smoke --confirm
Places ONE call to the server-side authorized test number (never a number you type). Never in CI.`;

const arg = (argv: string[], name: string): string | undefined => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };

export async function runLiveCli(argv: string[], env: Record<string, string | undefined>, deps: () => Promise<{ start: (body: unknown, op: string, d: TestLabDeps) => Promise<TestLabResult>; deps: TestLabDeps }>): Promise<{ code: number; out: string }> {
  if (isCi(env)) return { code: 3, out: 'REFUSED: voice:test:live never runs in CI (a live call costs money and rings a real phone).' };
  if (argv.includes('--help')) return { code: 0, out: HELP };
  const engineArg = arg(argv, '--engine');
  const engine = engineArg === 'relay' ? 'conversation_relay' : engineArg === 'realtime' ? 'openai_realtime' : engineArg;
  const body = { runId: arg(argv, '--run'), destinationId: 'test-allowed', engine, script: arg(argv, '--script') ?? 'smoke', confirm: argv.includes('--confirm') ? true : undefined };
  const { start, deps: d } = await deps();
  const r = await start(body, `cli:${env.USER ?? env.USERNAME ?? 'operator'}`, d);
  return { code: r.status >= 200 && r.status < 300 ? 0 : r.status >= 500 ? 1 : 2, out: JSON.stringify({ status: r.status, ...r.body }) };
}

if (require.main === module) {
  runLiveCli(process.argv, process.env, async () => {
    const m = await import('../../services/voice/testlab/testLabService');
    return { start: m.startLiveTest, deps: m.productionTestLabDeps() };
  }).then(({ code, out }) => { console.log(out); process.exit(code); }, (e: Error) => {
    console.error(JSON.stringify({ level: 'error', event: 'voice_test_live_cli_failed', error_class: e.name || 'Error' }));
    process.exit(1);
  });
}
