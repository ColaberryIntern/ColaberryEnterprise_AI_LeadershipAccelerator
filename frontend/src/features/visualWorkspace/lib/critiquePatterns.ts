/**
 * critiquePatterns — V1 AI critique helper.
 *
 * V1 ships a curated suggestion bank keyed by critique kind. The backend
 * generate-suggestions flow is the source of truth for accepted suggestions,
 * but this gives the user one-click "AI suggest" placeholder text inside the
 * annotation modal so they can start a critique with a concrete prompt
 * instead of a blank textarea.
 *
 * Future: swap the bank for a real LLM call routed through portalApi when
 * the visual-review endpoint exposes a dedicated suggestion endpoint.
 */

import type { CritiqueKind } from '../types';

interface CritiqueHint {
  title: string;
  description: string;
  expected_outcome: string;
}

const HINT_BANK: Record<CritiqueKind, CritiqueHint[]> = {
  spacing: [
    {
      title: 'Tighten vertical rhythm',
      description: 'Sections feel disconnected — gap between hero and trust strip is too wide on desktop.',
      expected_outcome: 'Reduce vertical gap by ~30%; group hero + trust strip into a single visual block.',
    },
    {
      title: 'Add breathing room around CTA',
      description: 'CTA button feels crowded by the surrounding copy.',
      expected_outcome: 'Add 24px padding around the primary CTA; align with grid baseline.',
    },
  ],
  alignment: [
    {
      title: 'Fix mid-page alignment drift',
      description: 'Headlines align left, but stat tiles below center — creates a visual ledge.',
      expected_outcome: 'Anchor stat tiles to the same left edge as the headline.',
    },
  ],
  color: [
    {
      title: 'Reduce contrast noise',
      description: 'Three accent colors compete for attention in the same viewport.',
      expected_outcome: 'Demote secondary accent to neutral grey; reserve accent for the single primary CTA.',
    },
  ],
  typography: [
    {
      title: 'Establish a clearer headline hierarchy',
      description: 'H2 and H3 read at nearly the same weight; user cannot quickly scan structure.',
      expected_outcome: 'Increase H2 to 1.6rem semi-bold; demote H3 to 1.05rem regular.',
    },
  ],
  interaction: [
    {
      title: 'Add hover affordance',
      description: 'Cards do not signal that they are clickable.',
      expected_outcome: 'Add subtle elevation + cursor:pointer on hover.',
    },
  ],
  accessibility: [
    {
      title: 'Improve focus visibility',
      description: 'Default focus ring is suppressed — keyboard users cannot see where they are.',
      expected_outcome: 'Add 3px solid focus outline using --color-primary-light; honor :focus-visible.',
    },
    {
      title: 'Add aria-label to icon-only buttons',
      description: 'Icon-only actions lack accessible names.',
      expected_outcome: 'Add aria-label="..." to every icon-only button so screen readers announce intent.',
    },
  ],
  hierarchy: [
    {
      title: 'Demote secondary content',
      description: 'Three competing sections all use the same visual weight.',
      expected_outcome: 'Promote one section to hero treatment; demote the other two to supporting cards.',
    },
  ],
  responsiveness: [
    {
      title: 'Prevent CTA wrap on mobile',
      description: 'Primary CTA wraps to 3 lines under 380px viewport.',
      expected_outcome: 'Tighten copy to ≤ 6 words; allow 2-line wrap maximum.',
    },
  ],
  workflow: [
    {
      title: 'Surface the next step explicitly',
      description: 'After form submission, user lands on a generic confirmation with no next action.',
      expected_outcome: 'Replace generic confirmation with a "what happens next" panel + 2 CTAs.',
    },
  ],
  copy: [
    {
      title: 'Cut internal jargon from headline',
      description: 'Headline uses internal phrasing executives will not parse on first read.',
      expected_outcome: 'Replace with plain-language outcome statement (≤ 8 words).',
    },
  ],
};

export function suggestForKind(kind: CritiqueKind): CritiqueHint {
  const bank = HINT_BANK[kind] || [];
  if (bank.length === 0) {
    return {
      title: '',
      description: '',
      expected_outcome: '',
    };
  }
  // Rotate through the bank using a simple time-based pick so consecutive
  // clicks of "AI suggest" cycle through alternates.
  const pick = Math.floor(Date.now() / 5000) % bank.length;
  return bank[pick];
}

export function listHintsForKind(kind: CritiqueKind): CritiqueHint[] {
  return HINT_BANK[kind] || [];
}
