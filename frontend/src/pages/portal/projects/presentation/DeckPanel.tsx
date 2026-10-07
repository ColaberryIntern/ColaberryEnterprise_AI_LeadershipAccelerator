import React, { useCallback, useEffect, useState } from 'react';
import DeckViewer from './DeckViewer';
import portalApi from '../../../../utils/portalApi';

/**
 * The student's generated deck, on the Build stage.
 *
 * WHY THIS EXISTS AS WELL AS `DeckViewer`. The viewer renders a deck; this fetches
 * one and decides what to say when there is not one. The repo has a guard —
 * `portalPages.routed.test.ts` — that every file under `pages/portal` is reachable
 * from the route table, and it caught the viewer shipping with nothing able to open
 * it. That guard is right: a panel nothing can reach is either work nobody can see or
 * code to delete.
 *
 * IT SHOWS THE UNSUPPORTED FIGURES. The grounding check runs when the deck is
 * generated and the verdict is stored with it; this is where a student finds out. A
 * flag nobody is shown is a flag that may as well not have been raised — and the
 * whole point is that they confirm or cut the number BEFORE they stand up.
 *
 * FOUR STATES, kept apart. A failed fetch must never render as "you have no deck":
 * one tells the student to go and generate one, the other tells them to try again.
 */

interface UnsupportedFigure { text: string; context: string }
interface Deck {
  state: 'generating' | 'ready' | 'failed';
  contentHtml: string | null;
  errorClass: string | null;
  tries: number;
  unsupported?: UnsupportedFigure[];
}

type Load =
  | { phase: 'loading' }
  | { phase: 'ready'; deck: Deck | null; retryable: boolean }
  | { phase: 'error' };

export interface DeckPanelProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
  targetSeconds?: number | null;
}

const DeckPanel: React.FC<DeckPanelProps> = ({ projectId, storyId, demo, targetSeconds = null }) => {
  const [state, setState] = useState<Load>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const r = await portalApi.get(
        `/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(storyId)}/deck`,
      );
      setState({ phase: 'ready', deck: (r.data?.deck ?? null) as Deck | null, retryable: Boolean(r.data?.retryable) });
    } catch {
      // Deliberately NOT an empty deck. See the note at the top of this file.
      setState({ phase: 'error' });
    }
  }, [projectId, storyId]);

  useEffect(() => { if (!demo) void load(); }, [load, demo]);

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-deck-demo">
        <strong>This is a preview account.</strong>
        A deck is generated against a real student&rsquo;s own project.
      </div>
    );
  }

  if (state.phase === 'loading') {
    return <p role="status" className="ps-note ps-note--soft" data-testid="ps-deck-loading">Looking for your deck&hellip;</p>;
  }

  if (state.phase === 'error') {
    return (
      <div className="ps-card" data-testid="ps-deck-load-error">
        <p role="alert" className="ps-note" style={{ margin: 0, color: 'var(--cherry-deep, #C20E1E)' }}>
          We could not load your deck just now. This does not mean you have none.
        </p>
        <button type="button" className="ps-btn" style={{ marginTop: 8 }} onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  const { deck } = state;

  if (!deck) {
    return (
      <p role="status" className="ps-note ps-note--soft" data-testid="ps-deck-none">
        No deck generated yet. Build your prompt above, then generate one.
      </p>
    );
  }

  if (deck.state === 'generating') {
    return <p role="status" className="ps-note ps-note--soft" data-testid="ps-deck-generating">Your deck is being generated&hellip;</p>;
  }

  if (deck.state === 'failed' || !deck.contentHtml) {
    return (
      <div className="ps-card" data-testid="ps-deck-failed">
        {/* The attempt count is shown because "it failed" and "it failed three times"
            are different facts, and the second one means stop retrying and ask. */}
        <p role="alert" className="ps-note" style={{ margin: 0 }}>
          Generating your deck did not work{deck.tries > 1 ? ` after ${deck.tries} attempts` : ''}.
          {deck.errorClass ? ` (${deck.errorClass})` : ''}
        </p>
        <p className="ps-note ps-note--soft" style={{ margin: '6px 0 0' }}>You can try again — nothing you wrote was lost.</p>
      </div>
    );
  }

  const unsupported = deck.unsupported || [];

  return (
    <div data-testid="ps-deck-panel">
      {unsupported.length > 0 && (
        <div className="ps-card" data-testid="ps-deck-unsupported" style={{ borderLeft: '4px solid var(--cherry-deep, #C20E1E)' }}>
          <h3>Check these numbers before you present</h3>
          <p className="ps-note" style={{ marginTop: 0 }}>
            {unsupported.length === 1 ? 'This figure does' : 'These figures do'} not appear in anything you wrote.
            Confirm {unsupported.length === 1 ? 'it' : 'them'} from your own data, or take
            {unsupported.length === 1 ? ' it' : ' them'} out.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {unsupported.map((u) => (
              <li key={u.text} className="ps-note">
                <strong>{u.text}</strong>
                {u.context ? <span className="ps-note--soft"> — “{u.context}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <DeckViewer deckHtml={deck.contentHtml} title="Your deck" targetSeconds={targetSeconds} />
    </div>
  );
};

export default DeckPanel;
