import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchPortfolio, saveReflection, type Portfolio, type PortfolioSlot,
} from './presentationApi';
import VisibilitySwitch from './VisibilitySwitch';
import ShareSheet from './ShareSheet';

/**
 * PRESENT & SHARE — what used to be two placeholder steps.
 *
 * Steps 5 and 6 each rendered a "not built yet" notice and read and wrote
 * nothing. They are one step now, and it holds the thing a learner actually
 * accumulates: one video per kind of presentation, with a visible hole where
 * each missing one goes.
 *
 * THE EMPTY SLOTS ARE THE FEATURE. A grid showing only what exists makes an
 * empty portfolio look finished; seven slots with six holes says plainly that
 * there are six more kinds of presentation to practise, and clicking one is how
 * you start it. That is why every slot is a real button rather than a card with
 * a link in it — it is the primary action on this screen.
 *
 * THE ORDER NEVER CHANGES. Slots follow the Learn list, so the portfolio and the
 * type picker read the same way round, and a learner who has learned where
 * "Working-system demo" sits finds it in the same place tomorrow.
 */

export interface PresentAndSharePanelProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
  /** Jump to Learn with a type pre-selected — how an empty slot gets started. */
  onStartType: (typeId: string) => void;
  /**
   * Owned by the Studio, because the sidebar renders it too. Fetched in both
   * places they could disagree, and a learner seeing "2 of 7" beside a grid
   * showing three would have no way to tell which was lying.
   */
  portfolio: Portfolio | null;
  onPortfolioChanged: () => void | Promise<void>;
}

type Load =
  | { phase: 'loading' }
  | { phase: 'ready'; portfolio: Portfolio }
  | { phase: 'error' };

const mmss = (s: number | null): string | null => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const shortDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const PresentAndSharePanel: React.FC<PresentAndSharePanelProps> = ({
  projectId, storyId, demo, onStartType, portfolio, onPortfolioChanged,
}) => {
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => { void onPortfolioChanged(); }, [onPortfolioChanged]);

  // Seed the box from the server, but never over words the learner is typing.
  useEffect(() => {
    if (!notesDirty) setNotes(portfolio?.reflectionNotes ?? '');
  }, [portfolio, notesDirty]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveReflection(projectId, storyId, notes.trim());
      setNotesDirty(false);
    } catch (e: any) {
      setSaveError(e?.response?.data?.error || 'We could not save that just now.');
    } finally {
      setSaving(false);
    }
  }, [projectId, storyId, notes]);

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-portfolio-demo">
        <strong>This is a preview account.</strong> A portfolio belongs to a real learner.
      </div>
    );
  }

  if (!portfolio) {
    return (
      <p role="status" className="ps-note ps-note--soft" data-testid="ps-portfolio-loading">
        Loading your portfolio…
      </p>
    );
  }

  const { slots, recordedTypeCount, totalTypes, nextTypeId } = portfolio;
  const pct = totalTypes > 0 ? Math.round((recordedTypeCount / totalTypes) * 100) : 0;

  return (
    <>
      {/* ── progress ─────────────────────────────────────────────────────── */}
      <div className="ps-card ps-portfolio-hero" data-testid="ps-portfolio-hero" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 78, height: 78, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
            background: `conic-gradient(var(--navy, #1b2f52) ${pct}%, #e7eaf0 0)`,
          }}
        >
          <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1.05 }}>
            <span>
              <strong style={{ fontSize: 20 }}>{recordedTypeCount}</strong>
              <em style={{ fontStyle: 'normal', fontSize: 11, display: 'block', color: 'var(--slate-600, #6b7280)' }}>
                of {totalTypes}
              </em>
            </span>
          </div>
        </div>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 16 }} data-testid="ps-portfolio-count">
            {recordedTypeCount === totalTypes
              ? `All ${totalTypes} presentation types recorded`
              : `${recordedTypeCount} of ${totalTypes} presentation types recorded`}
          </h3>
          <p className="ps-note ps-note--soft" style={{ margin: 0 }}>
            Every type you record becomes part of your project. Pick an empty slot to start that one —
            it opens Learn with the type already chosen.
          </p>
          <div style={{ display: 'flex', gap: 5, marginTop: 10 }} aria-hidden="true">
            {slots.map((s) => (
              <span
                key={s.typeId}
                style={{
                  width: 28, height: 6, borderRadius: 3,
                  background: s.recorded ? 'var(--navy, #1b2f52)' : '#e2e5eb',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="ps-label" style={{ display: 'flex', justifyContent: 'space-between', margin: '22px 0 10px' }}>
        <span>Your videos · by type</span>
        {nextTypeId && (
          <button
            type="button"
            className="ps-link"
            data-testid="ps-portfolio-next"
            onClick={() => onStartType(nextTypeId)}
            style={{ background: 'none', border: 0, color: 'var(--blue-700, #2f6db0)', fontWeight: 600, cursor: 'pointer' }}
          >
            Start the next one →
          </button>
        )}
      </div>

      {/* ── the seven slots ──────────────────────────────────────────────── */}
      <div
        className="ps-portfolio-grid"
        data-testid="ps-portfolio-grid"
        /* 300, not 230. At 230 the grid went four-up on a desktop and the cards
           stopped reading as videos — a 16:9 poster 190px wide beside three
           lines of description is a text tile with a picture on it. Three up,
           and it reads the way the reference does. */
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}
      >
        {slots.map((slot, i) => (
          slot.recorded
            ? <FilledSlot key={slot.typeId} slot={slot} projectId={projectId} storyId={storyId} onChanged={() => void load()} />
            : <VoidSlot key={slot.typeId} slot={slot} index={i} total={slots.length} onStart={() => onStartType(slot.typeId)} />
        ))}
      </div>

      {/* ── reflect ──────────────────────────────────────────────────────── */}
      <div className="ps-label" style={{ margin: '22px 0 10px' }}>Reflect &amp; share</div>
      <div className="ps-card" data-testid="ps-reflection">
        <h4 style={{ margin: '0 0 4px' }}>What did your rehearsal partner tell you?</h4>
        <p className="ps-note ps-note--soft" style={{ margin: 0 }}>
          Write down their notes and one thing you will change before the day.
        </p>
        <textarea
          data-testid="ps-reflection-input"
          value={notes}
          maxLength={4000}
          rows={4}
          onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
          style={{ width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 8 }}
          placeholder="e.g. Sam said the cost number came too late — move it to the first 20 seconds."
        />
        {saveError && (
          <p role="alert" className="ps-note" data-testid="ps-reflection-error" style={{ color: 'var(--cherry-deep, #C20E1E)' }}>
            {saveError}
          </p>
        )}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 }}>
          <button
            type="button"
            className="ps-btn"
            data-testid="ps-reflection-save"
            disabled={saving || !notesDirty}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : notesDirty ? 'Save reflection' : 'Saved'}
          </button>
          <ShareSheet slots={slots} />
        </div>
      </div>
    </>
  );
};

/** A type the learner has recorded. */
const FilledSlot: React.FC<{
  slot: PortfolioSlot;
  projectId: string;
  storyId: string;
  onChanged: () => void;
}> = ({ slot, projectId, storyId, onChanged }) => {
  const length = mmss(slot.durationSeconds);
  const when = shortDate(slot.recordedAt);

  return (
    <article className="ps-card" data-testid={`ps-slot-${slot.typeId}`} style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ position: 'relative', background: '#000' }}>
        <video
          data-testid="ps-slot-player"
          controls
          poster={slot.thumbnailUrl || undefined}
          preload={slot.thumbnailUrl ? 'none' : 'metadata'}
          style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', objectFit: 'contain' }}
          src={slot.playbackUrl || undefined}
        >
          {slot.playbackUrl && <a href={slot.playbackUrl}>Open this demo</a>}
        </video>
        {slot.thumbnailUrl && (
          <span className="ps-slot-play" aria-hidden="true" data-testid="ps-slot-play">
            <span>▶</span>
          </span>
        )}
        {slot.takeCount > 1 && (
          <span data-testid="ps-slot-takes" style={{ position: 'absolute', left: 8, bottom: 8, color: '#fff', fontSize: 12, background: 'rgba(0,0,0,.5)', padding: '2px 6px', borderRadius: 4 }}>
            {slot.takeCount} takes
          </span>
        )}
        {length && (
          <span data-testid="ps-slot-duration" style={{ position: 'absolute', right: 8, bottom: 8, color: '#fff', fontSize: 12, background: 'rgba(0,0,0,.5)', padding: '2px 6px', borderRadius: 4 }}>
            {length}
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <strong>{slot.typeLabel}</strong>
          <span className="ps-note ps-note--soft" style={{ whiteSpace: 'nowrap' }}>{slot.timing}</span>
        </div>
        {when && <p className="ps-note ps-note--soft" style={{ margin: '4px 0 0' }}>{when}</p>}

        <VisibilitySwitch
          projectId={projectId}
          storyId={storyId}
          attemptId=""
          recordingId={slot.recordingId!}
          showcaseId={slot.showcaseId}
          shareState={slot.shareState}
          viewLabel={slot.viewLabel}
          onChanged={onChanged}
        />

        {/* DOWNLOAD IS HOW A DEMO REACHES SOCIAL. The video is behind a signed,
            audience-checked URL that LinkedIn cannot play, so rather than making
            it publicly reachable we hand the learner their own file and they
            post it under their own account. */}
        {slot.downloadUrl && (
          <a
            className="ps-btn ps-btn--quiet"
            data-testid="ps-slot-download"
            href={slot.downloadUrl}
            style={{ display: 'inline-block', marginTop: 8 }}
          >
            ⬇ Download to post
          </a>
        )}
      </div>
    </article>
  );
};

/**
 * A type the learner has not recorded. The whole tile is the button.
 *
 * It carries the type's description rather than just its name, because this is
 * where a learner decides what to do next and "Client handoff" alone does not
 * tell them what that involves.
 */
const VoidSlot: React.FC<{
  slot: PortfolioSlot;
  index: number;
  total: number;
  onStart: () => void;
}> = ({ slot, index, total, onStart }) => (
  <button
    type="button"
    className="ps-slot-void"
    data-testid={`ps-slot-${slot.typeId}`}
    aria-label={`Start ${slot.typeLabel} — not recorded yet`}
    onClick={onStart}
    style={{
      display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0,
      borderRadius: 10, cursor: 'pointer', minHeight: 262, color: 'inherit', font: 'inherit',
    }}
  >
    <span style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', position: 'relative', width: '100%' }}>
      <span className="ps-note ps-note--soft" style={{ position: 'absolute', left: 10, top: 8, fontSize: 11 }}>
        {index + 1} / {total}
      </span>
      <span
        aria-hidden="true"
        className="ps-slot-plus"
        style={{
          width: 48, height: 48, borderRadius: '50%',
          display: 'grid', placeItems: 'center', fontSize: 26,
        }}
      >
        +
      </span>
    </span>
    <span style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong>{slot.typeLabel}</strong>
        <span className="ps-note ps-note--soft" style={{ whiteSpace: 'nowrap' }}>{slot.timing}</span>
      </span>
      {slot.description && (
        <span className="ps-note ps-note--soft">{slot.description}</span>
      )}
      <span style={{ marginTop: 'auto', fontWeight: 700, color: 'var(--navy, #1b2f52)' }}>
        Not recorded yet · Start this one →
      </span>
    </span>
  </button>
);

export default PresentAndSharePanel;
