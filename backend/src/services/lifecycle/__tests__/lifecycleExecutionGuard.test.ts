/**
 * P7-T2 — attack `executeStage`, and prove the guard the worker path never had. **LC-14.**
 *
 * ## What was actually wrong
 *
 * `plan-phase7.md` §0.1: `executeStage` "imports one type and checks nothing". It ran stage
 * commands without ever consulting `prerequisiteGaps` or the transition table, so every
 * protection Phases 3 to 6 built lived on the route and approval paths and **not** on this one.
 * The acceptance for this packet is therefore behavioural, not a sweep: the evidence is a
 * refusal, not the absence of a caller.
 *
 * ## Why every case here is one field away from the permitting fixture
 *
 * `permitting()` passes all three checks. Each refusal below is that object with EXACTLY ONE
 * field changed. That is what makes the refusal attributable: a bespoke broken authorization per
 * case could refuse for a reason the case does not name, and several would still pass. The
 * positive control is the same fixture unmodified, which is the half without which a guard that
 * refused everything would score full marks.
 *
 * ## The flag is ON in production, so this is not a dormant change
 *
 * The guard is held by `ENABLE_PROJECT_LIFECYCLE`, following the repo's only precedent
 * (`storyAuthorization.ts:87`): with the flag off it permits and logs that it was not consulted.
 * Unlike T1.3's overflow flag, which defaults off everywhere, **this one was measured as
 * `true` on production**, so the guard becomes live on the next deploy rather than waiting for
 * an opt-in. That is the intended outcome — it is the audit's named fix — and it is why the
 * flag-off branch is tested in the dangerous direction below: a would-be-refused command must
 * be shown to PROCEED with the flag off, or "flag-held" is a claim about nothing.
 *
 * There are no non-test callers of `executeStage` (§0.2, re-measured with a name-collision-aware
 * sweep), so the required-field change breaks no caller today.
 */
import { executeStage, type StageAuthorization } from '../lifecycleExecution';
import { completeEvidence } from './evidenceFixture';
import { makeStore, permitting, withFlag, SUBJECT } from './executionFixture';

/** Captured audit lines, parsed. Only this module's authorization event is kept. */
function captureAudit() {
  const lines: Array<Record<string, unknown>> = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    try {
      const parsed = JSON.parse(String(args[0]));
      if (parsed?.event === 'lifecycle_stage_authorization') lines.push(parsed);
    } catch {
      // Not our structured line. Swallowed deliberately: this is a test probe, not a code path.
    }
  });
  return { lines, restore: () => spy.mockRestore() };
}

/**
 * Drive `executeStage` with the shared store and a work function that records whether it ran.
 *
 * `ran` is the property that matters most in this file. An outcome string is what the function
 * SAYS; `ran` is whether the side effect happened. A guard that returned `refused` and still
 * executed the work would pass every assertion about outcomes.
 */
async function attempt(authorization: StageAuthorization, flagOn = true) {
  const s = makeStore();
  let ran = false;
  const audit = captureAudit();
  try {
    const result = await withFlag(flagOn, () => executeStage({
      ...SUBJECT,
      correlationId: 'corr-guard-1',
      authorization,
      work: async () => { ran = true; },
      store: s.store,
    }));
    return { result, ran, store: s, audit: audit.lines };
  } finally {
    audit.restore();
  }
}

/** The assertions every refusal must satisfy, regardless of which check refused it. */
function expectCleanRefusal(r: Awaited<ReturnType<typeof attempt>>, errorClass: string) {
  expect(r.result.outcome).toBe('refused');
  expect(r.result.errorClass).toBe(errorClass);

  // THE SIDE EFFECT DID NOT HAPPEN. The whole point.
  expect(r.ran).toBe(false);

  // A refusal is NOT a failed attempt. `retry_scheduled` and `dead_lettered` both mean the work
  // ran and did not succeed, so a refusal that consumed an attempt or scheduled a retry would
  // make an authorization decision look like a flaky job and invite the retry that must never
  // happen.
  expect(r.result.attempts).toBe(0);
  expect(r.result.retryAfterMs).toBeUndefined();
  expect(r.store.deadLetters).toEqual([]);

  // No write AND no read. The read count is the stronger claim: a guard that refused only after
  // loading the row would still show zero writes.
  expect(r.store.putCount).toBe(0);
  expect(r.store.getCount).toBe(0);
  expect(r.store.current()).toBeNull();
}

// ────────────────────── the required field, enforced at RUNTIME ──────────────────────

describe('the authorization is REQUIRED, and the compiler is not the only thing enforcing it', () => {
  /**
   * `plan-phase7.md` §3b: "TypeScript cannot be the only guard because **nothing typechecks this
   * repo's backend test files**, so a test could omit it and still compile." The same hole is
   * open to any JavaScript caller and to one `as any`. A guard that can be skipped by a cast is
   * the defect this packet exists to close, so it is checked at runtime too.
   */
  it('throws a ContractViolation when it is omitted, rather than defaulting to permit', async () => {
    const s = makeStore();
    let ran = false;
    // The cast IS the test. It reproduces exactly what an untypechecked caller can do.
    const input = {
      ...SUBJECT,
      correlationId: 'corr-guard-1',
      work: async () => { ran = true; },
      store: s.store,
    } as unknown as Parameters<typeof executeStage>[0];

    await expect(withFlag(true, () => executeStage(input))).rejects.toThrow(/ContractViolation/);
    expect(ran).toBe(false);
    expect(s.putCount).toBe(0);
  });

  it('throws it with the flag OFF too, because an absent contract is not an enforcement choice', async () => {
    // Deliberate asymmetry. The flag holds the DECISION, not the shape of the call: if the
    // runtime check sat behind the flag, every caller written while the flag was off would
    // compile, ship, and start throwing on the deploy that enabled it.
    const s = makeStore();
    const input = {
      ...SUBJECT, correlationId: 'c', work: async () => {}, store: s.store,
    } as unknown as Parameters<typeof executeStage>[0];
    await expect(withFlag(false, () => executeStage(input))).rejects.toThrow(/ContractViolation/);
  });

  it('and the message says what to pass, not merely that something is missing', async () => {
    const s = makeStore();
    const input = {
      ...SUBJECT, correlationId: 'c', work: async () => {}, store: s.store,
    } as unknown as Parameters<typeof executeStage>[0];
    await expect(executeStage(input)).rejects.toThrow(/actor tenant/);
  });
});

// ─────────────────────────── the positive control, first ───────────────────────────

describe('POSITIVE CONTROL: a legal transition with met prerequisites PROCEEDS', () => {
  /**
   * First, not last, because every refusal below is only meaningful against it. A guard that
   * refuses everything satisfies all six security cases and is useless.
   */
  it('runs the work and completes', async () => {
    const r = await attempt(permitting());

    expect(r.ran).toBe(true);
    expect(r.result.outcome).toBe('completed');
    expect(r.store.current()?.completedAt).toBeTruthy();
  });

  it('and records the permit decision with its reason, so a permit is auditable too', async () => {
    // Permits are logged at info. An audit trail that only records refusals cannot answer
    // "who was allowed to do this", which is the question an incident actually asks.
    const r = await attempt(permitting());
    expect(r.audit).toHaveLength(1);
    expect(r.audit[0]).toMatchObject({
      event: 'lifecycle_stage_authorization',
      outcome: 'success',
      level: 'info',
      correlation_id: 'corr-guard-1',
      context: { decision: 'permitted', reason: 'all_checks_passed', stage: 'planning' },
    });
  });
});

// ───────────────────── case: cross-tenant, on the APPROVE-consuming stage ─────────────────────

describe('cross-tenant: refused on the stage that CONSUMES the approval', () => {
  /**
   * The plan is specific that this is the uncovered half: "P5-T7 covered routes and P6-T7 the
   * registration seam; neither covered **approve**." `planning` is the stage that consumes a
   * blueprint approval, so a foreign actor reaching it is the cross-tenant approve path.
   */
  it('a foreign actor tenant is refused as a TenantIsolationViolation', async () => {
    const r = await attempt(permitting({ actorTenantId: 't-OTHER' }));
    expectCleanRefusal(r, 'TenantIsolationViolation');
  });

  it('and the refusal does NOT disclose the owning tenant, so it cannot be used to enumerate', async () => {
    const r = await attempt(permitting({ actorTenantId: 't-OTHER' }));
    // The message says the actor does not own the row. It does not say who does.
    expect(r.result.message).not.toContain(SUBJECT.tenantId);
    expect(r.result.message).toMatch(/does not own/);
  });

  it('an EMPTY or absent actor tenant is refused, not waved through', async () => {
    // The verifier's X2 mutation — `auth.actorTenantId && auth.actorTenantId !== tenantId` —
    // survived the whole suite, because no case supplied a falsy tenant. The shipped code is
    // already correct; nothing pinned it. A fail-open guard is worse than no guard, because the
    // audit line says "permitted".
    for (const actorTenantId of ['', undefined as unknown as string]) {
      const r = await attempt(permitting({ actorTenantId }));
      expectCleanRefusal(r, 'TenantIsolationViolation');
    }
  });

  it('and the decision IS audited, with the actor tenant recorded for triage', async () => {
    // Acceptance wording: "refused, **and the decision audited**". The actor's tenant belongs in
    // the log (which is not attacker-visible) even though it stays out of the message.
    const r = await attempt(permitting({ actorTenantId: 't-OTHER' }));
    expect(r.audit[0]).toMatchObject({
      level: 'warn',
      outcome: 'failure',
      context: { decision: 'refused', reason: 'tenant_mismatch', actor_tenant_id: 't-OTHER' },
    });
  });
});

// ──────────────────────────── case: illegal transition ────────────────────────────

describe('illegal transition: the edge must exist in ADVANCE, not merely be plausible', () => {
  it('refuses a jump from `discovery` straight to `planning`', async () => {
    // Six stages skipped, which is the shape of a direct-API bypass: the target stage is real
    // and the actor owns the row, but nothing in between was done.
    const r = await attempt(permitting({ from: 'discovery' }));
    expectCleanRefusal(r, 'IllegalTransition');
    expect(r.result.message).toContain('discovery');
  });

  it('refuses a BACKWARD edge too, which a one-sided check would miss', async () => {
    // `plan_ready` is where `planning` advances TO. Re-running `planning` from it is the replay
    // shape, and `ADVANCE.plan_ready` is `building`, so it is refused.
    const r = await attempt(permitting({ from: 'plan_ready' }));
    expectCleanRefusal(r, 'IllegalTransition');
  });

  it('refuses a self-edge, so a stage cannot re-authorize itself', async () => {
    const r = await attempt(permitting({ from: 'planning' }));
    expectCleanRefusal(r, 'IllegalTransition');
  });

  /**
   * THE CHECK ORDER, PINNED. `lifecycleExecution.ts` claims tenant is checked first so that a
   * foreign tenant "must not learn which transitions are legal or which prerequisites are
   * unmet". An independent verifier mutated the order — moving the tenant check last — and
   * NOTHING failed, because every other case here changes exactly one field and so cannot
   * observe precedence. A security property stated in prose and checked by no test is the
   * defect class this phase refuses, so it is checked here.
   */
  it('ORDER: all three wrong at once refuses on TENANT, leaking nothing about the rest', async () => {
    const r = await attempt(permitting({
      actorTenantId: 't-OTHER',
      from: 'discovery',
      evidence: { ...completeEvidence(), approval: null },
    }));

    expectCleanRefusal(r, 'TenantIsolationViolation');
    // The refusal names neither the transition nor the prerequisite. That is the whole point of
    // ordering it first: an attacker from another tenant learns only that they do not own it.
    expect(r.result.message).not.toContain('discovery');
    expect(r.result.message).not.toContain('approval_missing');
    // ONE decision was logged, not three. A guard that evaluated everything and reported the
    // tenant failure would still disclose the rest to anything reading the audit stream.
    expect(r.audit).toHaveLength(1);
    expect(r.audit[0]).toMatchObject({ context: { reason: 'tenant_mismatch' } });
  });

  it('ORDER: transition is checked BEFORE prerequisites, for the same reason', async () => {
    // The second edge of the same property. Same tenant, so the first check passes; both the
    // transition and the prerequisites are wrong; the transition is what gets reported.
    const r = await attempt(permitting({
      from: 'discovery',
      evidence: { ...completeEvidence(), approval: null },
    }));

    expectCleanRefusal(r, 'IllegalTransition');
    expect(r.result.message).not.toContain('approval_missing');
    expect(r.audit[0]).toMatchObject({ context: { reason: 'illegal_transition' } });
  });

  it('audits the illegal transition with the origin stage named', async () => {
    const r = await attempt(permitting({ from: 'discovery' }));
    expect(r.audit[0]).toMatchObject({
      context: { decision: 'refused', reason: 'illegal_transition', from: 'discovery' },
    });
  });
});

// ──────────── cases: prerequisites, by the SHIPPED predicate, with the rule NAMED ────────────

describe('prerequisites: refused WITH THE RULE NAMED, which the acceptance requires', () => {
  /**
   * Each of these is a real rule in `lifecyclePrerequisites.PREREQUISITES.planning`, reached
   * through `blockingGaps(prerequisiteGaps(...))` — the shipped predicate, not a second opinion
   * written for this test. A guard with its own copy of "is this ready" would eventually
   * disagree with the one the rest of the lifecycle uses, and the divergence would be invisible.
   */
  const evidenceWith = (over: Partial<ReturnType<typeof completeEvidence>>) =>
    permitting({ evidence: { ...completeEvidence(), ...over } });

  it('STALE APPROVAL: the manifest moved past the approved revision', async () => {
    // The named case "stale approval". The approval is real, the approver was authorized, the
    // tenant owns the row — and the thing approved is not the thing that would be built.
    const r = await attempt(evidenceWith({ currentManifestRevision: 9 }));
    expectCleanRefusal(r, 'PrerequisitesUnmet');
    expect(r.result.message).toContain('approval_revision_moved');
  });

  it('SUPERSEDED APPROVAL: a replaced approval does not carry forward', async () => {
    const r = await attempt(evidenceWith({
      approval: { ...completeEvidence().approval!, superseded: true },
    }));
    expectCleanRefusal(r, 'PrerequisitesUnmet');
    expect(r.result.message).toContain('approval_superseded');
  });

  it('ROLE ESCALATION: authority revoked between approval and use is re-checked here', async () => {
    // The named case "role escalation", in its time-of-check/time-of-use form. `planning`
    // re-reads the actor's CURRENT authority rather than trusting the authority that existed
    // when the approval was recorded.
    const r = await attempt(evidenceWith({ actorStillAuthorized: false }));
    expectCleanRefusal(r, 'PrerequisitesUnmet');
    expect(r.result.message).toContain('authority_revoked');
  });

  it('SELF-APPROVAL: the proposer cannot be the approver, which is the ceremonial loophole', async () => {
    const e = completeEvidence();
    const r = await attempt(evidenceWith({ proposedBy: e.approval!.approvedBy }));
    expectCleanRefusal(r, 'PrerequisitesUnmet');
    expect(r.result.message).toContain('approval_self_approved');
  });

  it('MISSING APPROVAL: an unapproved blueprint cannot reach planning at all', async () => {
    const r = await attempt(evidenceWith({ approval: null }));
    expectCleanRefusal(r, 'PrerequisitesUnmet');
    expect(r.result.message).toContain('approval_missing');
  });

  /**
   * NOT_MEASURED BLOCKS. This is the doctrine the whole phase rests on, asserted on this path:
   * `blockingGaps` filters only `ADVISORY_RULES`, and no gap KIND is advisory, so a field nobody
   * measured refuses exactly like a field measured bad. The dangerous alternative is the one
   * this repo already shipped once — an unread field comparing equal to its own placeholder and
   * the refusal silently vanishing.
   */
  it('UNMEASURED authority blocks, rather than permitting for want of data', async () => {
    const e = completeEvidence();
    const assessedFields = new Set(e.assessedFields);
    assessedFields.delete('actorStillAuthorized');
    const r = await attempt(permitting({ evidence: { ...e, assessedFields } }));

    expectCleanRefusal(r, 'PrerequisitesUnmet');
    expect(r.result.message).toContain('authority_revoked');
    // And it is reported AS unmeasured, not as a measured failure. The distinction is the
    // difference between "we checked and it is revoked" and "nobody looked".
    expect(r.result.message).toContain('not_assessed');
  });

  it('reports the COUNT of blocking rules, so two problems do not read as one', async () => {
    const r = await attempt(evidenceWith({ currentManifestRevision: 9, actorStillAuthorized: false }));
    expect(r.result.message).toContain('2 blocking');
    expect(r.result.message).toContain('approval_revision_moved');
    expect(r.result.message).toContain('authority_revoked');
  });

  it('audits the unmet prerequisites with the rule list, not just a count', async () => {
    const r = await attempt(evidenceWith({ actorStillAuthorized: false }));
    expect(r.audit[0]).toMatchObject({
      level: 'warn',
      context: { decision: 'refused', reason: 'prerequisites_unmet', blocking: 'authority_revoked:unmet' },
    });
  });
});

// ──────────────────────── the flag actually holds the guard ────────────────────────

describe('held by ENABLE_PROJECT_LIFECYCLE: off means permit, and SAYS it was not consulted', () => {
  /**
   * Tested in the dangerous direction. Asserting that a PERMITTED command still permits with the
   * flag off would pass against a guard wired to nothing at all.
   */
  it('a command that the guard WOULD refuse proceeds with the flag off', async () => {
    const r = await attempt(permitting({ actorTenantId: 't-OTHER', from: 'discovery' }), false);

    expect(r.result.outcome).toBe('completed');
    expect(r.ran).toBe(true);
  });

  it('and it logs that it was not consulted, so "permitted" is never silent', async () => {
    // `storyAuthorization.ts:87`'s contract. A flag-off path that logged nothing would be
    // indistinguishable from a guard that was never reached.
    const r = await attempt(permitting({ actorTenantId: 't-OTHER' }), false);
    expect(r.audit[0]).toMatchObject({
      context: { decision: 'permitted', reason: 'not_consulted_flag_off' },
    });
  });

  it('the SAME authorization flips outcome with the flag, which is what "flag-held" means', async () => {
    // REPLACES an assertion that read `expect(typeof FLAGS.lifecycleEnforcement).toBe('boolean')`
    // under a headline about one env var controlling the surface. That would pass if the guard
    // never read the flag at all — a vacuous test under a claim it did not support, found by an
    // independent verifier. The property is now asserted as the pair it actually is: one
    // authorization object, two flag states, two different outcomes.
    const foreign = permitting({ actorTenantId: 't-OTHER' });

    expect((await attempt(foreign, true)).result.outcome).toBe('refused');
    expect((await attempt(foreign, false)).result.outcome).toBe('completed');
  });
});
