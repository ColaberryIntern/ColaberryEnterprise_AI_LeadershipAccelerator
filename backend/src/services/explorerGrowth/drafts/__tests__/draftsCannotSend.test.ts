import * as fs from 'fs';
import * as path from 'path';
import {
  EXPLORER_DRAFT_REJECTED_STATUS,
  EXPLORER_DRAFT_STATUS,
  SENDER_CLAIMED_STATUS,
} from '../draftContracts';

/**
 * THIS STAGE RENDERS, IT NEVER SENDS.
 *
 * ── WHY IT CANNOT BE THE GOVERNOR'S GUARD ──────────────────────────────────
 *
 * `governor/__tests__/noSendPaths.test.ts` forbids `ScheduledEmail.create`
 * outright, because the Governor has no business writing a message row. This
 * stage's entire job is to write one, so that guard cannot be reused and
 * copying it would assert a falsehood.
 *
 * The property that actually holds here is narrower and checkable: a draft is
 * written in a status the SENDER NEVER CLAIMS. The sender's candidate SELECT
 * and its claiming UPDATE both require `status = 'pending'`
 * (`schedulerService.ts`), and that predicate is the real lock. So the thing to
 * guard is not "does this file write to scheduled_emails" — it must — but "can
 * anything it writes ever be picked up".
 *
 * ── WHAT A DENYLIST WOULD MISS, AND WHY THERE IS A WHITELIST TOO ───────────
 *
 * `emailService.ts` exports twenty-six `send*` functions. A list of the six
 * everybody remembers would let `sendDigestEmail` through. So the denylist is
 * DERIVED FROM SOURCE, the same way the Governor's is, and it is paired with
 * an import check — the lesson EPIC 4 wrote down after the plan auditor caught
 * exactly that hole.
 */

const DRAFTS_DIR = path.join(__dirname, '..');
const SERVICES_DIR = path.join(__dirname, '..', '..', '..');
const BACKEND_SRC = path.join(__dirname, '..', '..', '..', '..');

function read(relativeToSrc: string): string {
  return fs.readFileSync(path.join(BACKEND_SRC, relativeToSrc), 'utf8');
}

/** Every .ts file in drafts/, tests excluded. */
function draftSourceFiles(dir: string = DRAFTS_DIR): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...draftSourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Source with comments stripped, so prose cannot trip or satisfy an assertion. */
function codeOf(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function importsOf(file: string): string[] {
  const src = codeOf(file);
  const out: string[] = [];
  for (const m of src.matchAll(/^[ \t]*(?:import|export)[^;]*?from[ \t]*['"]([^'"]+)['"]/gm)) {
    out.push(m[1]);
  }
  for (const m of src.matchAll(/^[ \t]*import[ \t]+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/(?:require|import)[ \t]*\([ \t]*['"]([^'"]+)['"][ \t]*\)/g)) {
    out.push(m[1]);
  }
  return out;
}

const FORBIDDEN_MODULES = [
  'emailService',
  'schedulerService',
  'sequenceService',
  'synthflowService',
  'mandrill',
  'nodemailer',
  'communicationSafetyService',
];

const files = draftSourceFiles();

describe('the extractor works, so the assertions below mean something', () => {
  it('finds the real imports of a real file', () => {
    // If this returns nothing, every other test in this file passes while
    // checking nothing at all.
    const render = files.find((f) => f.endsWith('renderDecisionDraft.ts'))!;
    expect(importsOf(render)).toContain('./draftEligibility');
  });

  it('sweeps every source file in the directory', () => {
    const names = files.map((f) => path.basename(f)).sort();
    expect(names).toEqual([
      'draftContracts.ts',
      'draftEligibility.ts',
      'draftRepository.ts',
      'renderDecisionDraft.ts',
      'runDraftRender.ts',
    ]);
  });
});

describe('a draft can never be claimed by the sender', () => {
  it('neither draft status equals the status the sender claims', () => {
    expect(EXPLORER_DRAFT_STATUS).not.toBe(SENDER_CLAIMED_STATUS);
    expect(EXPLORER_DRAFT_REJECTED_STATUS).not.toBe(SENDER_CLAIMED_STATUS);
    expect(EXPLORER_DRAFT_STATUS).not.toBe(EXPLORER_DRAFT_REJECTED_STATUS);
  });

  it("the sender really does gate on 'pending' — the claim this rests on", () => {
    // Asserted against the SENDER's source, not restated as a comment. If
    // somebody widens that predicate, this stage stops being safe and this
    // test is where that surfaces.
    const scheduler = read('services/schedulerService.ts');
    expect(scheduler).toContain("AND status = 'pending'");
    expect(scheduler).toContain("WHERE status = 'pending'");
  });

  it('no draft source writes a pending status', () => {
    for (const file of files) {
      const code = codeOf(file);
      // The constant naming it is allowed to exist — that is the guard itself.
      const withoutConstant = code
        .replace(/SENDER_CLAIMED_STATUS\s*=\s*'pending'/g, '')
        .replace(/SENDER_CLAIMED_STATUS/g, '');
      expect(withoutConstant).not.toContain("'pending'");
    }
  });

  it('the repository refuses a pending status at runtime too', () => {
    // Defence in depth: the type forbids it, and the writer checks anyway.
    const repo = codeOf(files.find((f) => f.endsWith('draftRepository.ts'))!);
    expect(repo).toContain('SENDER_CLAIMED_STATUS');
    expect(repo).toMatch(/throw new Error\(/);
  });
});

describe('drafts cannot reach a send path', () => {
  it.each(FORBIDDEN_MODULES)('no draft source imports %s', (mod) => {
    for (const file of files) {
      for (const spec of importsOf(file)) {
        expect(spec).not.toContain(mod);
      }
    }
  });

  it('names no send function that emailService exports', () => {
    // DERIVED FROM SOURCE. A hardcoded list of six would have missed twenty of
    // the twenty-six, which is the hole the Governor's guard was built to close.
    const emailSrc = read('services/emailService.ts');
    const sendFns = Array.from(
      emailSrc.matchAll(/^export (?:async )?function (send[A-Za-z]+)/gm),
    ).map((m) => m[1]);
    expect(sendFns.length).toBeGreaterThan(20);

    for (const file of files) {
      const code = codeOf(file);
      for (const fn of sendFns) {
        expect(code).not.toContain(fn);
      }
    }
  });

  it.each(['triggerVoiceCall', 'sendSmsViaGhl', 'enrollLeadInSequence', 'guardedSendMail'])(
    'no draft source calls %s',
    (fn) => {
      for (const file of files) {
        expect(codeOf(file)).not.toContain(fn);
      }
    },
  );
});

describe('the write is atomic, because a partial commit breaks the replay guard', () => {
  it('the draft insert and the decision stamp share one transaction', () => {
    // The idempotency guard is `decision.scheduled_email_id IS NOT NULL`. An
    // insert that committed without its update would leave an unstamped
    // decision and get drafted a second time tomorrow.
    const repo = codeOf(files.find((f) => f.endsWith('draftRepository.ts'))!);
    expect(repo).toContain('sequelize.transaction');

    // POSITION IS NOT THE PROPERTY, and this assertion used to test position: it compared
    // the index of the INSERT against the index of `sequelize.transaction`. That broke the
    // moment the insert was extracted into a helper declared ABOVE the transaction - while
    // still being handed the transaction and still being atomic. It also had a hole in the
    // other direction, which matters more: a query written lexically INSIDE the callback but
    // missing `transaction: t` runs outside the transaction entirely, and the position test
    // would have passed it. So assert the thing that actually makes the write atomic.
    const WRITES = [
      'INSERT INTO scheduled_emails',
      'UPDATE explorer_journey_decisions',
      'UPDATE scheduled_emails',
    ];

    for (const write of WRITES) {
      let from = 0;
      let seen = 0;
      for (;;) {
        const at = repo.indexOf(write, from);
        if (at === -1) break;
        seen += 1;
        // The options object follows the SQL string; the transaction must be in it.
        expect(repo.slice(at, at + 1200)).toContain('transaction: t');
        from = at + write.length;
      }
      // A write that disappeared would otherwise pass this loop vacuously.
      expect(seen).toBeGreaterThan(0);
    }

    // And the extracted insert is handed the transaction rather than opening its own.
    expect(repo).toContain('insertDraftRow(input, t)');
  });

  it('the prior-draft count excludes the row being rendered', () => {
    // `decision_date < :before`, never `<=`. With `<=` a replay would advance
    // the step index and render a different message for the same decision.
    const repo = codeOf(files.find((f) => f.endsWith('draftRepository.ts'))!);
    expect(repo).toContain('decision_date < :before');
    expect(repo).not.toContain('decision_date <= :before');
  });
});

describe('it is dark until two flags are on', () => {
  it('reads the flag through the only sanctioned gate', () => {
    // A direct sub-flag read would let rendering activate while the master
    // switch is off, which is the one thing a dark launch exists to prevent.
    const runner = codeOf(files.find((f) => f.endsWith('runDraftRender.ts'))!);
    expect(runner).toContain("isExplorerFeatureEnabled('draftRender'");
    expect(runner).not.toMatch(/env\.explorerGrowth\.draftRenderEnabled/);
  });

  it('the flag defaults off and is registered in every place the others are', () => {
    const flags = read('config/explorerGrowthFlags.ts');
    expect(flags).toContain("| 'draftRender'");
    expect(flags).toContain('draftRenderEnabled');
    expect(flags).toContain("draftRenderEnabled: 'EXPLORER_DRAFT_RENDER_ENABLED'");
    expect(flags).toContain("draftRender: 'draftRenderEnabled'");
  });
});

describe('the cron is wired, and wired in the right order', () => {
  const scheduler = read('services/schedulerService.ts');
  const registry = read('services/agentRegistrySeed.ts');

  it('is registered so it is pausable from Admin > Agents without a redeploy', () => {
    expect(registry).toContain("agent_name: 'ExplorerDraftRender'");
    expect(scheduler).toContain("instrumentCronJob('ExplorerDraftRender'");
  });

  it('declares the SAME schedule in both places', () => {
    // A registry entry that disagrees with the real cron misleads whoever
    // reads Admin > Agents to decide whether a job has run.
    expect(scheduler).toContain("cron.schedule('10 4 * * *'");
    expect(registry).toContain("schedule: '10 4 * * *'");
  });

  it('runs AFTER the Governor, whose rows it reads', () => {
    // Rendering before the Governor writes would draft yesterday's decisions
    // and leave today's with no message against them.
    const governorAt = scheduler.indexOf("cron.schedule('50 3 * * *'");
    const draftAt = scheduler.indexOf("cron.schedule('10 4 * * *'");
    expect(governorAt).toBeGreaterThan(-1);
    expect(draftAt).toBeGreaterThan(-1);
    // 03:50 then 04:10 — twenty minutes later on the clock, not just later in
    // the file, which is what actually determines the order.
    expect(4 * 60 + 10).toBeGreaterThan(3 * 60 + 50);
  });

  it('is a separate cron block, so the Governor keeps its decides-only promise', () => {
    // Folding this into the Governor's block would make that block's stated
    // guarantee read as narrower than it looks, and would stop Admin > Agents
    // pausing the paid half without pausing the free half.
    //
    // COMMENTS STRIPPED FIRST. The draft block's own docblock names
    // `runScheduledDraftRender` and sits between the two cron calls, so a raw
    // slice fails on the prose that EXPLAINS the separation rather than on a
    // real call. A guard that trips on its own documentation teaches people to
    // reword the comment instead of trusting the guard.
    const code = scheduler.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const governorBlock = code.slice(
      code.indexOf("cron.schedule('50 3 * * *'"),
      code.indexOf("cron.schedule('10 4 * * *'"),
    );
    expect(governorBlock).toContain('runScheduledGovernor()');
    expect(governorBlock).not.toContain('runScheduledDraftRender');
  });
});

describe('the operator script is safe to hand to a human', () => {
  const script = read('scripts/runExplorerDraftRender.ts');

  it('defaults to a dry run', () => {
    // A bare invocation must not generate ~150 messages against a paid API
    // because somebody was trying the script out.
    expect(script).toContain('dryRun: true');
    expect(script).toContain("'--live'");
  });

  it('refuses to write to production without an explicit flag', () => {
    expect(script).toContain('--confirm-production');
    expect(script).toContain('Refusing to write');
  });

  it('names no send function, same as the Governor script', () => {
    const emailSrc = read('services/emailService.ts');
    for (const m of emailSrc.matchAll(/^export (?:async )?function (send[A-Za-z]+)/gm)) {
      expect(script).not.toContain(m[1]);
    }
  });
});

describe('the services tree still resolves from here', () => {
  it('drafts/ is a direct child of explorerGrowth/, like governor/ and content/', () => {
    // Depth matters: ../../../models and its siblings only resolve if this
    // directory sits where the others do.
    expect(path.basename(path.dirname(DRAFTS_DIR))).toBe('explorerGrowth');
    expect(path.basename(SERVICES_DIR)).toBe('services');
  });
});
