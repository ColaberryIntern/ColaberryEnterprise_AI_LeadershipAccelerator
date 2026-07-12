import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TimelineFeedCard } from './TimelineCard';
import CardDetailBody from './CardDetailBody';

/**
 * CardDetailDrawer — the right-slide panel that opens when a student clicks a
 * card. It is now a thin wrapper (scrim + panel) around the shared
 * <CardDetailBody>, which is the single source of truth for "what the student
 * sees" (used identically by the Experience Studio preview and the Timeline
 * editor preview, so they can never diverge).
 */

interface Props {
  card: TimelineFeedCard | null;
  onClose: () => void;
  onComplete: (card: TimelineFeedCard) => Promise<void> | void;
}

const CardDetailDrawer: React.FC<Props> = ({ card, onClose, onComplete }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, onClose]);

  if (!card) return null;

  return (
    <div className="tld-scrim" onClick={onClose}>
      <aside className="tld-panel" role="dialog" aria-modal="true" aria-label={card.title} onClick={(e) => e.stopPropagation()}>
        <CardDetailBody
          card={card}
          onClose={onClose}
          onComplete={() => onComplete(card)}
          onEnterWorkspace={() => navigate(`/portal/runtime/${card.id}`)}
        />
      </aside>
    </div>
  );
};

export default CardDetailDrawer;
