/**
 * R0's title has to explain why R0 is full.
 *
 * On the 2 November 2026 call most builders reported "a bunch of stories in release 0", and they
 * were right: 624 of the 1,477 tasks across the ten boards sit on that one rung, 42% of the
 * programme, between 35 and 96 per board.
 *
 * It is not a placement bug. A capability story hangs on the rung its `starting_autonomy` names,
 * and all 443 capability records name `autonomy:R0`, so R0 necessarily holds the starting point of
 * every capability plus the shared foundation stories. Moving them would put work at an authority
 * level nobody approved, and gating the rungs above would render most of every board as locked.
 *
 * Owner decision, 2 Nov 2026: **leave the placement, fix the labels.** So R0 keeps the owner's own
 * wording and gains one clause that answers the question a 96-item list provokes. A builder should
 * be able to tell "this is where everything begins" from "something is broken", and before this the
 * title gave them nothing to tell it with.
 *
 * The assertions below are mostly about what a label change must NOT do.
 */
import {
  AUTONOMY_LEVELS,
  AUTONOMY_MEANINGS,
  AUTONOMY_NAMESPACE,
} from '../autonomyLadder';
import { AUTONOMY_RELEASES, FOUNDATION_STAGE, releaseName } from '../agentDomainReleaseLadder';

const foundation = AUTONOMY_RELEASES.find((r) => r.cluster === FOUNDATION_STAGE);
const others = AUTONOMY_RELEASES.filter((r) => r.cluster !== FOUNDATION_STAGE);

describe('the foundation rung explains its own size', () => {
  it('exists and is the first rung on the board', () => {
    expect(foundation).toBeDefined();
    expect(foundation?.position).toBe(0);
    expect(FOUNDATION_STAGE).toBe(`${AUTONOMY_NAMESPACE}R0`);
  });

  it('says that every capability starts here', () => {
    expect(foundation?.name).toContain('every capability starts here');
  });

  it('keeps the owner\'s own wording rather than replacing it', () => {
    // The clause is APPENDED. The rung's meaning is Ali's sentence from `AUTONOMY_MEANINGS` and
    // this change is a label fix, not a redefinition of what R0 is.
    expect(foundation?.name).toContain('Define the workflow, requirements, risks and human decisions');
    expect(foundation?.name.startsWith('R0 · ')).toBe(true);
  });

  it('leaves the other nine rungs untouched', () => {
    // A note on every rung would be noise, and a note on the wrong rung would be a false claim.
    for (const r of others) {
      expect(r.name).not.toContain('every capability starts here');
    }
    expect(others).toHaveLength(AUTONOMY_LEVELS.length - 1);
  });
});

describe('what a label change must not do', () => {
  it('does not touch any cluster key, because that is what stories hang on', () => {
    // `release_key` is the stored value read back by `coverageMatrix` and the migration. A title
    // is rendered and parsed by nothing. Changing a cluster key here would silently move stories
    // to a rung nobody placed them on -- the one mistake this ladder exists to prevent.
    expect(AUTONOMY_RELEASES.map((r) => r.cluster)).toEqual(
      AUTONOMY_LEVELS.map((l) => `${AUTONOMY_NAMESPACE}${l}`),
    );
  });

  it('keeps every title inside the 255-character column the provisioner asserts', () => {
    // `agentDomainProvisioner.test.ts` pins `r.title.length <= 255`. Appending prose to a title is
    // exactly how that gets breached, so it is checked at the source too.
    for (const r of AUTONOMY_RELEASES) {
      expect(r.name.length).toBeLessThanOrEqual(255);
    }
  });

  it('still carries each rung\'s meaning, so no rung lost its wording to the edit', () => {
    for (const level of AUTONOMY_LEVELS) {
      const r = AUTONOMY_RELEASES.find((x) => x.cluster === `${AUTONOMY_NAMESPACE}${level}`);
      expect(r?.name).toContain(AUTONOMY_MEANINGS[level].replace(/\.$/, ''));
      expect(r?.name.startsWith(`${level} · `)).toBe(true);
    }
  });

  it('resolves through releaseName, which is what the prompt header renders', () => {
    expect(releaseName(FOUNDATION_STAGE)).toBe(foundation?.name);
    expect(releaseName(FOUNDATION_STAGE)).toContain('every capability starts here');
  });

  it('leaves the three superseded workstream releases alone', () => {
    // `r0` and `autonomy:R0` coexist deliberately and are a different axis. A reader skimming for
    // "r0" must not find this note on the legacy list, which holds nothing.
    const legacy = releaseName('r0');
    expect(legacy).toContain('superseded by the ladder');
    expect(legacy).not.toContain('every capability starts here');
  });
});
