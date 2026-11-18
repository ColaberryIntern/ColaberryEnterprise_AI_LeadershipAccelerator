/**
 * storyCelebration - PURE. The sentence a person reads when a story's artifacts land.
 *
 * ---------------------------------------------------------------------------
 * IT NAMES THE THING, BECAUSE "NICE WORK" IS FORGETTABLE
 * ---------------------------------------------------------------------------
 * "Story complete" is a status change. "Your churn model evaluation report is in your repository"
 * is a sentence about something that exists, which a person can go and look at, send to someone,
 * or put in front of an employer. That difference is the entire reason this phase bothers with a
 * celebration rather than a boolean.
 *
 * So the headline is built from the artifact's NAME, not its key. `ART-014` is how the platform
 * cites it; "churn model evaluation report" is what the person made. The key is carried alongside
 * for the link, never put in the sentence.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER CLAIMS MORE THAN WAS CHECKED
 * ---------------------------------------------------------------------------
 * An artifact recorded as `present_content_unchecked` had its file found and its contents unread,
 * so the headline says it is in place and does not say it is right. An artifact handed over on
 * the platform was not seen by this check at all and is named separately. A celebration that
 * flattened those into "verified" would be the same overclaim the artifact contract exists to
 * stop, arriving in friendlier language.
 *
 * No I/O and no clock: the same inputs give the same sentence, which is what lets the stored
 * headline be compared against a freshly built one in a test.
 */

import type { ArtifactMatch } from './storyArtifactMatch';

export interface CelebrationArtifact {
  key: string;
  name: string;
  /** True when the file was found but its declared contents were not read. */
  content_unchecked: boolean;
  /** Where it was handed over. */
  where: 'repo' | 'platform';
  repo_path: string | null;
}

export interface Celebration {
  /** One sentence, naming what now exists. */
  headline: string;
  /** A second sentence, only when something is still owed or unconfirmed. Else null. */
  caveat: string | null;
  artifacts: CelebrationArtifact[];
}

/** Join names the way a person would say them. */
function list(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Build the celebration from the matches that satisfied the contract.
 *
 * `names` maps artifact key to the contract's human name, because `ArtifactMatch` carries the key
 * and not the name: the matcher works in keys on purpose, and the name lives in the contract.
 * A key with no name falls back to the key, so a missing name degrades to something citable
 * rather than to an empty sentence.
 */
export function buildCelebration(
  satisfied: ReadonlyArray<ArtifactMatch>,
  names: Readonly<Record<string, string>>,
): Celebration {
  const artifacts: CelebrationArtifact[] = satisfied.map((m) => ({
    key: m.key,
    name: (names[m.key] || '').trim() || m.key,
    content_unchecked: m.verdict === 'present_content_unchecked',
    where: m.repo_path ? 'repo' : 'platform',
    repo_path: m.repo_path,
  }));

  if (!artifacts.length) {
    return {
      headline: 'This story is complete.',
      caveat: null,
      artifacts: [],
    };
  }

  const inRepo = artifacts.filter((a) => a.where === 'repo');
  const onPlatform = artifacts.filter((a) => a.where === 'platform');

  const parts: string[] = [];
  if (inRepo.length) {
    parts.push(`${list(inRepo.map((a) => a.name))} ${inRepo.length === 1 ? 'is' : 'are'} in your repository`);
  }
  if (onPlatform.length) {
    parts.push(`${list(onPlatform.map((a) => a.name))} ${onPlatform.length === 1 ? 'is' : 'are'} on your profile`);
  }
  const headline = `Your ${parts.join(', and ')}.`;

  // The caveat exists so the sentence above can stay a clean statement about what exists, while
  // anything unconfirmed is still said out loud rather than folded in or dropped.
  const unread = artifacts.filter((a) => a.content_unchecked).map((a) => a.name);
  const caveat = unread.length
    ? `${list(unread)} ${unread.length === 1 ? 'was' : 'were'} found in place, and the contents `
      + 'were not read, so a person still confirms them.'
    : null;

  return { headline, caveat, artifacts };
}
