/**
 * FirstVisitFramingCard — calm ambient first-visit orientation card.
 *
 * Operational Onboarding + Guided Comprehension Sprint, 2026-05-16.
 *
 * A first-time operator landing on Cory Home or System BPs sees a
 * sophisticated surface (priority badge, leverage block, pathway stages,
 * downstream parentheticals, inherited-context section headers) without
 * any embedded explanation of what those concepts mean. The operator
 * explicitly ruled out tutorials, tooltips, modals, and tours. This
 * component is the threaded needle — ambient, embedded, dismissible
 * guidance that disappears once it's not needed.
 *
 * Behavior:
 *   - Renders when `isFirstVisit` is true AND
 *     `memory.seenIntros[surface] !== true`.
 *   - In practice, callers pass `isFirstVisit={true}` and let the
 *     seenIntros dismiss flag be the sole gate. Timing-based detection
 *     ("is this REALLY the operator's first visit?") via memory fields
 *     was tried and proved fragile across React strict-mode remounts +
 *     the state-poll snapshot useEffect lifecycle — the framing card
 *     raced off-screen before the operator could see it.
 *   - The simpler model: show until dismissed, then never. Existing
 *     operators see the framing card once on their next visit (a
 *     one-time courtesy), then dismiss, then never see it again.
 *   - When dismissed, marks workspaceMemory.seenIntros[surface] = true.
 *     Persistent across visits and tabs (cross-tab via the existing
 *     storage listener on useWorkspaceMemory).
 *   - Renders nothing on re-render once dismissed — no fade, no
 *     animation, no "you can re-open this" affordance.
 *
 * Visual: smaller-footprint card, primary-light accent left-border,
 * eyebrow + 3-4 calm editorial sentences + a single tiny "Got it"
 * dismiss button. No links inside the body. No "Skip" / "Next" / "Tour
 * the workspace" buttons.
 */
import React from 'react';
import { useWorkspaceMemory, shouldShowFirstVisitFraming, type IntroSurface } from '../../hooks/useWorkspaceMemory';

interface Props {
  /** Which surface this card lives on — drives the seenIntros dismiss key. */
  surface: IntroSurface;
  /** Whether the surface is genuinely first-visit. Derived by the caller
   *  from existing memory fields (e.g., memory.lastSnapshotAt == null
   *  for Home, memory.lastBpDomain == null for System BPs). */
  isFirstVisit: boolean;
  /** Short editorial eyebrow above the body. */
  eyebrow: string;
  /** 3-4 calm sentences. Rendered as one paragraph, no bullet list. */
  body: string;
}

const FirstVisitFramingCard: React.FC<Props> = ({ surface, isFirstVisit, eyebrow, body }) => {
  const { memory, markIntroSeen } = useWorkspaceMemory();

  if (!shouldShowFirstVisitFraming(memory, surface, isFirstVisit)) return null;

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    markIntroSeen(surface);
  };

  return (
    <div
      aria-label={`First-visit orientation for ${surface}`}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderLeft: '3px solid var(--color-primary-light)',
        borderRadius: 6,
        padding: '0.85rem 1.1rem',
        marginBottom: '1.25rem',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-light)',
          fontWeight: 600,
          marginBottom: 5,
        }}>
          {eyebrow}
        </div>
        <div style={{
          fontSize: 13,
          color: 'var(--color-text)',
          lineHeight: 1.55,
          maxWidth: 720,
        }}>
          {body}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss this orientation"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 11.5,
          color: 'var(--color-text-light)',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          marginTop: 2,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-light)'; }}
      >
        Got it
      </button>
    </div>
  );
};

export default FirstVisitFramingCard;
