/**
 * voice:test:mock - run one call end to end through the real Voice Gateway against the mock provider
 * (VS1.7). No database, no network, no phone. Exercises all four provider outcomes and checks the
 * gateway's handling of each: accepted -> reservation accepted; refused -> released; unknown and a
 * hung provider -> ambiguous (never released, never retried). Every run must report networkAttempts 0.
 *
 * Run: npm run voice:test:mock      Exit: 0 every scenario as expected · 1 a scenario diverged
 */
import { runMockCall } from '../../services/voice/gateway/mockRun';

const EXPECTED = {
  accepted: { dispatchOutcome: 'accepted', reservationStatus: 'accepted' },
  refused: { dispatchOutcome: 'refused', reservationStatus: 'released' },
  unknown: { dispatchOutcome: 'unknown', reservationStatus: 'ambiguous' },
  hang: { dispatchOutcome: 'unknown', reservationStatus: 'ambiguous' },
} as const;

export async function runAllMockScenarios() {
  const results = [];
  for (const [outcome, want] of Object.entries(EXPECTED)) {
    const r = await runMockCall(outcome as keyof typeof EXPECTED, 200);
    const ok = r.authorized && r.dispatchOutcome === want.dispatchOutcome && r.reservationStatus === want.reservationStatus
      && r.dispatchedCount === 1 && r.realCalls === 0 && r.networkAttempts === 0;
    results.push({ scenario: outcome, ok, ...r });
  }
  return results;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(`voice:test:mock - one call through the real Voice Gateway against the mock provider, four scenarios
(accepted, refused, unknown, hang). No database, no network, no phone. Exit 0 all as expected, 1 otherwise.`);
    return;
  }
  const results = await runAllMockScenarios();
  for (const r of results) console.log(JSON.stringify({ event: 'voice_test_mock', outcome: r.ok ? 'success' : 'failure', ...r }));
  const failed = results.filter((r) => !r.ok).length;
  console.log(JSON.stringify({ event: 'voice_test_mock_summary', scenarios: results.length, failed, realCalls: 0 }));
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(JSON.stringify({ event: 'voice_test_mock', outcome: 'failure', error_class: e?.constructor?.name })); process.exit(1); });
