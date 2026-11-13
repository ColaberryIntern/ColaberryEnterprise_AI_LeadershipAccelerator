import { sequelize } from '../../config/database';

/**
 * What the person teaching should be told about whether the room can hear them (D9).
 *
 * ## Why this is NOT on the projected deck, which is what the draft ticket asked for
 *
 * D9 in DOC 18 says "the projected screen shows Off air / Backstage / On air / Reconnecting /
 * Cancelled ... legible at 1080p from 10 feet". That specifies the wrong surface, and the
 * evidence is in this repository's own studio runbook.
 *
 * `DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM.md` step 5 builds the teaching scene from "Display Capture
 * for the **teaching monitor only**", and step 10 makes that same OBS composition the local
 * recording master. The projected deck IS the captured picture. So a badge burned into it would
 * appear in the live stream, which is harmless, and in the recording and the published replay,
 * where a banner reading ON AIR is simply false. A replay is not on air.
 *
 * The presenter's own phone page is documented as "Never shown on the projected/shared deck;
 * opened only on the presenter's own device" (`sessionKitDocService.renderPresenterPage`). That
 * is a tally light: it faces the presenter and never reaches the output, which is how a studio
 * has always done this. The "10 feet" clause was my own assumption about where the badge lives,
 * not a requirement, and it does not survive the runbook.
 *
 * ## The one property that matters, and its safe direction
 *
 * Two ways to be wrong, and they are not symmetric:
 *
 *   - saying ON AIR when nothing is transmitting makes a presenter needlessly careful;
 *   - saying OFF AIR when the room can hear them makes them say something they would not have
 *     said, to an audience, permanently, into a recording.
 *
 * Only the second is a harm, so `assumeLive` is the field this module exists for and it is
 * false ONLY where there is positive evidence that nothing is being transmitted. A failed read
 * is not such evidence, so it resolves to `unknown` with `assumeLive` TRUE. That is the same
 * rule the producer's counts obey - an absent measurement is never rendered as a definite
 * value - pointed in the direction that cannot hurt anyone.
 */

export type TallyState =
  /** A broadcast exists and is not transmitting. */
  | 'off_air'
  /** Staff rehearsal. Viewers get nothing; the provider still records the feed. */
  | 'backstage'
  | 'on_air'
  /** The feed dropped and is trying to come back. Viewers are still being told it is live. */
  | 'reconnecting'
  /** The airing was called off. Terminal, and no second one can be minted for this class. */
  | 'called_off'
  /** Live was never enabled for this class, so no broadcast is coming. */
  | 'not_set_up'
  /** The check could not answer. Treated as live, deliberately. */
  | 'unknown';

export interface PresenterTally {
  state: TallyState;
  /** Two or three words, for a glance rather than a read. */
  label: string;
  /** One line saying what it means for the person teaching. */
  detail: string;
  /**
   * Should the presenter behave as though the room can hear them?
   *
   * THE INVARIANT: false only where something positively says nothing is transmitting. Every
   * uncertain answer is true. A test asserts this over the whole state list rather than
   * case by case, so a state added later cannot default into the harmful direction.
   */
  assumeLive: boolean;
}

const TALLIES: Record<Exclude<TallyState, never>, Omit<PresenterTally, 'state'>> = {
  on_air: {
    label: 'ON AIR',
    detail: 'You are live. Everything you say is going out and being recorded.',
    assumeLive: true,
  },
  reconnecting: {
    label: 'ON AIR, FEED DROPPED',
    detail: 'The feed is trying to come back and viewers are still being told the class is on. '
      + 'Keep teaching; ending it is the producer\'s call.',
    assumeLive: true,
  },
  backstage: {
    // Deliberately the same warning the producer's rehearsal banner carries, because it is the
    // same fact and the presenter is the person most likely to act on believing otherwise.
    label: 'BACKSTAGE',
    detail: 'Viewers get nothing yet. The provider still records the feed, so treat the room '
      + 'as recorded.',
    assumeLive: false,
  },
  off_air: {
    label: 'OFF AIR',
    detail: 'Nothing is being transmitted.',
    assumeLive: false,
  },
  called_off: {
    label: 'CALLED OFF',
    detail: 'This airing was called off. Nothing will be transmitted and there will be no replay.',
    assumeLive: false,
  },
  not_set_up: {
    // Worth separating from `off_air`: a presenter waiting to be put on air should know that
    // nobody is going to, rather than waiting for a go-live that cannot happen.
    label: 'NOT ON LIVE',
    detail: 'Colaberry Live was never set up for this class, so no broadcast is coming.',
    assumeLive: false,
  },
  unknown: {
    label: 'CANNOT CONFIRM',
    detail: 'The check is not answering, so assume you are on air.',
    assumeLive: true,
  },
};

/** States in which the room can hear the presenter. Mirrors discovery's own on-air list. */
const ON_AIR: Record<string, TallyState> = { live: 'on_air', reconnecting: 'reconnecting' };
/** Everything after the airing reads as off air: it is over, nothing is going out. */
const FINISHED = ['ended', 'processing', 'replay_ready'];

/**
 * Decide the tally from an editorial state. Pure, so every branch can be argued with.
 *
 * `null` means no occurrence is linked to the class, which is not an error.
 */
export function presenterTally(editorialState: string | null): PresenterTally {
  if (editorialState === null) return { state: 'not_set_up', ...TALLIES.not_set_up };
  if (ON_AIR[editorialState]) {
    const s = ON_AIR[editorialState];
    return { state: s, ...TALLIES[s] };
  }
  if (editorialState === 'backstage') return { state: 'backstage', ...TALLIES.backstage };
  if (editorialState === 'cancelled') return { state: 'called_off', ...TALLIES.called_off };
  if (editorialState === 'scheduled' || FINISHED.includes(editorialState)) {
    return { state: 'off_air', ...TALLIES.off_air };
  }
  /**
   * A state this module has not been taught. It must NOT fall through to off air: a ninth
   * editorial state added without touching this file would otherwise tell a presenter the room
   * cannot hear them, with no evidence of that at all. Unknown is the honest answer and it is
   * safe in the right direction.
   */
  return { state: 'unknown', ...TALLIES.unknown };
}

/**
 * Read the class's occurrence and decide the tally.
 *
 * `broadcast_source_refs` is the only link from a session to its occurrence; there is no
 * session column on `broadcast_occurrences`. Fails to `unknown` rather than throwing, because
 * this feeds a screen somebody is teaching from and a database blip must not blank it or, worse,
 * resolve it to OFF AIR.
 */
export async function readPresenterTally(sessionId: string): Promise<PresenterTally> {
  try {
    const [rows] = await sequelize.query(
      `SELECT o.editorial_state
         FROM broadcast_source_refs r
         JOIN broadcast_occurrences o ON o.id = r.occurrence_id
        WHERE r.source_type = 'live_session' AND r.source_id = :sid
        LIMIT 1`,
      { replacements: { sid: sessionId } },
    );
    const row = (rows as Array<{ editorial_state: string }>)[0];
    return presenterTally(row ? row.editorial_state : null);
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'broadcast',
      event: 'presenter_tally_unresolved', outcome: 'failure',
      error_class: err?.name ?? 'UnexpectedError',
      context: { sessionId },
    }));
    return { state: 'unknown', ...TALLIES.unknown };
  }
}
