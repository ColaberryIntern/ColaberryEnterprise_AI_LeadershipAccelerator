import fs from 'fs';
import path from 'path';
import { renderReeseBehaviourInventoryMarkdown } from '../lib/renderReeseBehaviourInventory';
import { REESE_BEHAVIOURS } from '../lib/reeseBehaviourInventory';

// R2 verification (plan.md): "Generator output equals the committed file (test)."
// Proves docs/reese-agentic-employee/BEHAVIOUR_INVENTORY.md was produced by the
// generator, not hand-edited out of sync with it.
describe('BEHAVIOUR_INVENTORY.md generator', () => {
  const committedPath = path.resolve(
    __dirname,
    '../../../../docs/reese-agentic-employee/BEHAVIOUR_INVENTORY.md',
  );

  it('the committed file is byte-identical to a fresh render', () => {
    const committed = fs.readFileSync(committedPath, 'utf8');
    expect(committed).toBe(renderReeseBehaviourInventoryMarkdown());
  });

  it('lists exactly the 7 behaviours plan.md names: reactive reply, outreach sweep, follow-ups, welcome DMs, supersession resolver, presence heartbeat, health assessment', () => {
    expect(REESE_BEHAVIOURS.map((r) => r.name)).toEqual([
      'Reactive DM reply',
      'Autonomous outreach sweep',
      'Outreach follow-ups',
      'Welcome DMs',
      'Student support supersession resolver',
      'Presence heartbeat',
      'Health assessment',
    ]);
  });

  it('every row states a controller, a kill switch, and a population rule', () => {
    for (const r of REESE_BEHAVIOURS) {
      expect(r.controller.length).toBeGreaterThan(0);
      expect(r.killSwitch.length).toBeGreaterThan(0);
      expect(r.population.length).toBeGreaterThan(0);
    }
  });

  // The 4 cron-registered behaviours (outreach sweep, follow-ups, supersession
  // resolver, presence heartbeat) all route through schedulerService.ts's
  // instrumentCronJob(), whose own enabled/paused kill-switch behaviour is
  // already proven generically in services/__tests__/cronInstrumentation.test.ts
  // ("a disabled agent is skipped entirely" / "a paused agent is skipped
  // entirely") — not re-duplicated per-behaviour here. The 2 Reese-only switch
  // gaps this phase actually closes (reactive reply, welcome DMs) are tested in
  // reeseReplyService.test.ts and reeseWelcomeService.test.ts respectively; the
  // 7th behaviour (health assessment) inherits the reply switch, also tested
  // there ("stops the reply before any DB/LLM work" asserts
  // maybeRefreshStudentAssessment is not called).
  it('documents where each kill-switch test actually lives, rather than re-asserting them here', () => {
    const cronGated = REESE_BEHAVIOURS.filter((r) => r.killSwitch.includes('instrumentCronJob'));
    expect(cronGated.length).toBe(4);
  });
});
