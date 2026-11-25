/**
 * voice:load --mock (VS4.1): load, soak and chaos on synthetic calls. Loopback only: no provider, no
 * database, no phone, nothing billed. Without --mock it refuses (a provider load test needs the
 * owner's approval and quotas, and is not implemented).
 *
 *   npm run voice:load -- --mock [--steps 1,5,20,50,100] [--out report.json]
 *
 * Exit: 0 every required step, the soak and every chaos scenario passed; 1 otherwise; 2 refused.
 * Steps above 20 only measure headroom: they set the capacity figure but do not fail the run.
 */
import fs from 'fs';
import { capacityFrom, ENGINES, loadStep, runChaos, soak, type StepResult } from '../../services/voice/load/loadRun';

const REQUIRED = [1, 5, 20];

export function parseArgs(argv: string[]): { mock: boolean; steps: number[]; out?: string } {
  const val = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const steps = (val('--steps') ?? '1,5,20,50,100').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 500);
  return { mock: argv.includes('--mock'), steps: [...new Set([...REQUIRED, ...steps])].sort((a, b) => a - b), out: val('--out') };
}

async function main(): Promise<number> {
  const a = parseArgs(process.argv.slice(2));
  if (!a.mock) { console.error('voice:load runs with --mock only. A provider load test needs owner approval.'); return 2; }
  const steps: StepResult[] = [];
  for (const c of a.steps) {
    for (const e of ENGINES) {
      const r = await loadStep(e, c); // eslint-disable-line no-await-in-loop -- one at a time: each measures alone
      steps.push(r);
      console.log(`${r.pass ? 'PASS' : 'FAIL'} load ${e} x${c}: ${r.completed}/${r.calls} completed, added latency p50/p95/p99 ${r.overheadMs.p50}/${r.overheadMs.p95}/${r.overheadMs.p99} ms, loop p99 ${r.loopDelayP99Ms} ms, cpu ${r.cpuPercent}%, rss ${r.peakRssMb} MB`);
    }
  }
  const sk = await soak();
  console.log(`${sk.pass ? 'PASS' : 'FAIL'} soak 20 callers x${sk.waves}: heap after each wave ${sk.heapMbAfterWave.join(', ')} MB, growth ${sk.measured ? `${sk.growthMb} MB` : 'NOT MEASURED (run with --expose-gc)'}`);
  const chaos = await runChaos();
  for (const c of chaos) console.log(`${c.pass ? 'PASS' : 'FAIL'} chaos ${c.scenario} [${c.engine}]: ${c.expected} ${JSON.stringify({ ...c.detail, leaks: c.leaks })}`);
  const capacity = capacityFrom(steps);
  const passed = steps.filter((x) => REQUIRED.includes(x.concurrency)).every((x) => x.pass) && sk.pass && chaos.every((c) => c.pass);
  console.log(`capacity on this machine: ${capacity.measured} concurrent measured, ${capacity.planned} planned. Providers, TLS and the database are not included.`);
  console.log(passed ? 'VOICE LOAD: PASS' : 'VOICE LOAD: FAIL');
  if (a.out) fs.writeFileSync(a.out, JSON.stringify({ at: new Date().toISOString(), node: process.version, passed, capacity, steps, soak: sk, chaos }, null, 2));
  return passed ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (e: Error) => { console.error(JSON.stringify({ event: 'voice_load', outcome: 'failure', error_class: e.name, message: e.message })); process.exit(1); });
}
