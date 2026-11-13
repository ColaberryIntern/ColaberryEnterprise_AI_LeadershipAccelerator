/**
 * The REAL delivery wiring behind Maya's welcome (MR4).
 *
 * ── WHY THIS FILE EXISTS, AND A CORRECTION ──────────────────────────────────
 *
 * MR4 was filed claiming Maya's welcome "has nowhere to deliver", on the evidence that all
 * 13 production ledger rows carry an empty `room_id` and a NULL `delivered_at`. That reading
 * was wrong, and the correction matters more than the original claim:
 *
 *   - `defaultDeps().sendDm` DOES open a room. It calls `openDm`, which is a
 *     `findOrCreate` on the canonical `dm-<a>-<b>` slug and creates both memberships
 *     idempotently. Nothing was missing.
 *   - The empty `room_id` is CORRECT for shadow mode, which never delivers. It was evidence
 *     of shadow working, not of a broken delivery path.
 *   - `mayaWelcomeService.test.ts` already drives the live branch with a stubbed `sendDm`,
 *     so the service logic was covered too.
 *
 * What genuinely had no test is the dep itself: the glue from an enrollment id to
 * `getMayaEnrollmentId` -> `openDm` -> `sendDmMessage`, and the identity precondition it
 * depends on. That glue is what runs for the first time on the day the capability is
 * promoted, so it is what this file pins.
 */
export {};

const mockGetMayaEnrollmentId = jest.fn();
const mockOpenDm = jest.fn();
const mockSendDmMessage = jest.fn();

// Both are dynamic imports inside the dep, so they are mocked by module path rather than
// injected. Keeping them dynamic is deliberate in the service: it keeps the DM stack out of
// the signup import graph.
jest.mock('../../mayaIdentitySeed', () => ({ getMayaEnrollmentId: () => mockGetMayaEnrollmentId() }));
jest.mock('../../communityRooms/dmService', () => ({
  openDm: (...a: unknown[]) => mockOpenDm(...a),
  sendDmMessage: (...a: unknown[]) => mockSendDmMessage(...a),
}));
// config/database is deliberately NOT mocked. `env.databaseUrl` has a default, so Sequelize
// constructs without connecting, and transitively imported models need a real instance to
// call `Model.init` against. Stubbing it with `{ query }` broke the suite at load with
// "Cannot read properties of undefined (reading 'define')". Nothing here issues a query.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mayaWelcomeDepsForTests } = require('../mayaWelcomeService');

const MAYA = '11111111-1111-4111-8111-111111111111';
const LEARNER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMayaEnrollmentId.mockResolvedValue(MAYA);
  mockOpenDm.mockResolvedValue({ roomId: 'room-9' });
  mockSendDmMessage.mockResolvedValue({ id: 'msg-9' });
});

describe('sendDm opens the room and posts as Maya', () => {
  it('opens the DM between Maya and the learner, creating it if absent', async () => {
    await __mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.');
    // Maya first, learner second: openDm sorts internally, but the FIRST argument is the
    // sender, and posting as the learner would attribute Maya's words to them.
    expect(mockOpenDm).toHaveBeenCalledWith(MAYA, LEARNER, null);
  });

  it('posts into the room that openDm returned, not a guessed one', async () => {
    await __mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.');
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: MAYA, cohortId: null, isAdmin: false }, 'room-9', 'Welcome.',
    );
  });

  it('returns the room and message ids the ledger records', async () => {
    expect(await __mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.'))
      .toEqual({ roomId: 'room-9', messageId: 'msg-9' });
  });

  it('never claims admin rights when posting', async () => {
    await __mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.');
    expect(mockSendDmMessage.mock.calls[0][0].isAdmin).toBe(false);
  });
});

describe('the identity precondition fails loudly', () => {
  it('throws, and posts nothing, when Maya has no seeded enrollment', async () => {
    // The caller turns a throw here into outcome 'send_failed' with no retry. Posting from a
    // missing identity would either attribute the message to nobody or to the learner.
    mockGetMayaEnrollmentId.mockResolvedValue(null);
    await expect(__mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.'))
      .rejects.toThrow('maya_identity_not_seeded');
    expect(mockOpenDm).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
  });

  it('does not swallow a refusal from the DM layer', async () => {
    // openDm throws DmError when the pair is not allowed to talk. Maya is cohort-exempt in
    // both directions, so this should not fire in practice, but swallowing it would record a
    // delivery that never happened.
    mockOpenDm.mockRejectedValue(new Error('Direct messages are limited to your cohort'));
    await expect(__mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.')).rejects.toThrow(/cohort/);
    expect(mockSendDmMessage).not.toHaveBeenCalled();
  });

  it('tolerates a message row with no id rather than throwing after the post landed', async () => {
    // The post has already happened by this point. Throwing here would mark a delivered
    // message as failed and, with no retry, lose the record of a message the learner can see.
    mockSendDmMessage.mockResolvedValue(null);
    expect(await __mayaWelcomeDepsForTests().sendDm(LEARNER, 'Welcome.'))
      .toEqual({ roomId: 'room-9', messageId: '' });
  });
});
