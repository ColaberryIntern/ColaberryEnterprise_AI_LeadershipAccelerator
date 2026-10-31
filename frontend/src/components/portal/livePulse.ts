/**
 * The Builder pulse — DOC 04's four states, and the ONE place they are named.
 *
 * WHY THIS MODULE EXISTS. Two live surfaces ask the student the same question: the phone
 * companion deck and the class check-in page the room QR actually lands on. They had drifted.
 * The check-in page said "I'm here" where DOC 04 and the companion say "Following", said
 * "I'm stuck" where the companion says "Stuck", and its Build Mode controller dropped `here`
 * altogether — so during the one segment where an instructor most needs to know who is merely
 * following along, there was no button for it, and a student who had already tapped it watched
 * their own status vanish from the grid when the instructor moved to a prompt.
 *
 * None of that is cosmetic. The Builder-pulse aggregate is a number an instructor acts on and
 * a number Test 2 measures, and it cannot mean one thing while two surfaces offer different
 * answers to the same question.
 *
 * THE WIRE VALUES ARE THE CONTRACT, NOT THE LABELS. `here` reads oddly next to "Following",
 * and it stays: it is the value in the database CHECK constraint and in every row already
 * recorded. The label differs because "here" answers a register and "Following" answers what
 * the instructor actually wants to know.
 *
 * MARKUP IS DELIBERATELY NOT SHARED. Each surface styles its own grid — one is a one-thumb
 * phone deck, the other a public landing card — and forcing one component on both would mean
 * a prop for every visual difference. What must not differ is the SET, so that is what lives
 * here.
 */
import type { PulseState } from '../../services/onboardingApi';

export interface PulseOption {
  /** The wire value. Matches the `student_pulse` CHECK constraint. */
  state: PulseState;
  label: string;
  emoji: string;
}

/** In the order a class moves through them. */
export const LIVE_PULSES: ReadonlyArray<PulseOption> = [
  { state: 'here', label: 'Following', emoji: '👀' },
  { state: 'building', label: 'Building', emoji: '🛠️' },
  { state: 'stuck', label: 'Stuck', emoji: '✋' },
  { state: 'finished', label: 'Finished', emoji: '✅' },
];
