import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../utils/api';
import CardDetailBody from '../../../components/timeline/CardDetailBody';
import { adaptToFeedCard } from '../../../utils/cardAdapter';
import '../../../components/timeline/timeline.css';

/**
 * StudentCardPreviewPage — a standalone, full-page render of "what the student
 * sees" for a single Timeline card. Opened in a NEW TAB from the Timeline
 * editor's Edit-card drawer ("Student view ↗") so authors can eyeball the exact
 * student card without leaving their editor.
 *
 * It fetches the SAVED card from the orchestration timeline board and renders it
 * through the REAL <CardDetailBody> in preview mode (no live student calls,
 * no completion / Enter-workspace nav), the same single-source renderer the
 * in-drawer popup uses — so this can never diverge from the student view.
 *
 * Route: /admin/orchestration/card-preview?card=<cardId>&program=<courseId>
 * The card must be saved (drafts included); unsaved new cards have no id yet.
 */

interface BoardCard {
  id: string; type: string; title: string; subtitle: string | null; description: string | null;
  week: number | null; difficulty: string; estimated_time: number | null;
  points: { learning?: number; builder?: number; community?: number };
  visibility: string; metadata?: any;
}
interface BoardType { slug: string; label: string; render_band: string; capabilities?: string[]; thumbnail_url?: string | null }

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

const StudentCardPreviewPage: React.FC = () => {
  const [params] = useSearchParams();
  const cardId = params.get('card') || '';
  const programId = params.get('program') || '';
  const [card, setCard] = useState<BoardCard | null>(null);
  const [types, setTypes] = useState<BoardType[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!cardId) { setState('notfound'); return; }
    let alive = true;
    (async () => {
      try {
        const r = await api.get('/api/admin/orchestration/timeline', { params: { program_id: programId || undefined } });
        if (!alive) return;
        const board = r.data || {};
        const found = (board.cards || []).find((c: BoardCard) => c.id === cardId) || null;
        setTypes(board.types || []);
        setCard(found);
        setState(found ? 'ready' : 'notfound');
      } catch { if (alive) setState('error'); }
    })();
    return () => { alive = false; };
  }, [cardId, programId]);

  // Build the SAME synthetic feed card the Timeline editor builds for its cards,
  // so the preview matches the student render exactly.
  const previewCard = useMemo(() => {
    if (!card) return null;
    const typeDef = types.find((t) => t.slug === card.type);
    return adaptToFeedCard({
      slug: card.type, render_band: typeDef?.render_band,
      label: card.title, student_label: typeDef?.label || card.type.replace(/_/g, ' '),
      subtitle: card.subtitle, description: card.description,
      difficulty: card.difficulty, estimated_time: card.estimated_time, week: card.week,
      points: card.points,
      video: card.metadata?.video, course: card.metadata?.course, blog: card.metadata?.blog,
      experience: card.metadata?.content, image: card.metadata?.image || null,
      capabilities: typeDef?.capabilities, type_thumbnail: typeDef?.thumbnail_url ?? null,
    });
  }, [card, types]);

  useEffect(() => {
    document.title = card ? `Student view · ${card.title}` : 'Student view';
  }, [card]);

  const draftBadge = card && card.visibility !== 'published';

  return (
    <div className="tl-de" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-subtle)' }}>
      <div style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-page)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Student view · preview
        </span>
        {draftBadge && (
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999, background: '#F0F0F0', color: '#8A8A8A' }}>
            DRAFT — not yet live
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>Read-only · shows the last saved version</span>
        <button
          type="button"
          onClick={() => window.close()}
          title="Close this tab"
          style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', border: '1px solid var(--border-default)', background: 'var(--surface-page)', color: 'var(--text-body)', borderRadius: 8, cursor: 'pointer' }}
        >
          Close ✕
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden', padding: '18px 12px' }}>
        {state === 'loading' && <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 40 }}>Loading the student view…</div>}
        {state === 'error' && <div style={{ color: 'var(--cherry-deep)', fontSize: 14, marginTop: 40 }}>Could not load this card. Try reopening it from the Timeline editor.</div>}
        {state === 'notfound' && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 40, textAlign: 'center', maxWidth: 420 }}>
            This card could not be found. It may have been deleted, or it has not been saved yet — save it in the Timeline editor first.
          </div>
        )}
        {state === 'ready' && previewCard && (
          <div className="tld-panel" style={{ width: 'min(560px, 100%)', borderRadius: 12, overflow: 'hidden' }}>
            <CardDetailBody card={previewCard} preview autoplayVideo onClose={() => window.close()} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCardPreviewPage;
