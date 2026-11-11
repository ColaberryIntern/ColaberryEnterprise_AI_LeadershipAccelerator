import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getStudioConfig, patchStudioConfig, REFUSAL_COPY,
  type StudioConfig, type StudioRefusal, type BroadcastAccessMode,
} from '../../../services/studioSetupApi';
import './studioSetup.css';

/**
 * Studio setup (D4, P4-01) — everything about a Colaberry Live class that has to be decided
 * before it can air.
 *
 * Until this screen existed, the whole of broadcast configuration was one checkbox on the
 * Accelerator admin page. Three decisions the show depends on were implicit, impossible, or
 * taken by the class's title.
 *
 * ## This page renders OUTSIDE AdminLayout, and opens in its own browser tab
 *
 * It therefore starts with no in-app state whatsoever: no cached session, no props from a prior
 * screen, nothing. Every field comes from one GET keyed on the session id in the URL. That is why
 * there is no "did we already load this" path here, and why a cold render is a test in its own
 * right rather than an afterthought.
 *
 * It also means there is no in-app back. The tab closes.
 *
 * ## The decision with no undo
 *
 * Access mode is write-once. The schema says so, `uq_broadcast_source_ref` permits one occurrence
 * per session for all time, and `cancelled` is terminal. An operator who picks the wrong one
 * cannot fix it from any screen in this product; recovery needs database access. The
 * acknowledgement checkbox is the only protection they have, which is why it gates Create rather
 * than merely warning.
 */

/** The four summary items. Create is disabled until every one reads Done. */
interface SummaryItem { label: string; done: boolean; }

const ACCESS_MODES: Array<{ value: BroadcastAccessMode; note: string }> = [
  { value: 'free', note: 'Anyone admitted to the portal can watch the whole class.' },
  { value: 'paid', note: 'Only accounts entitled to this class can watch.' },
  { value: 'preview', note: 'Anyone can watch 15 minutes, then they are asked to enroll.' },
  { value: 'private', note: 'Invited accounts only. The class is not listed to anyone else.' },
];

export default function StudioSetupPage(): React.ReactElement {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<StudioRefusal | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  // Local edits. Kept separate from `config` so a refused save can re-render the server's truth
  // without silently discarding what the operator typed.
  const [presenter, setPresenter] = useState('');
  const [producer, setProducer] = useState('');
  const [guestAccess, setGuestAccess] = useState<boolean | null>(null);
  const [accessMode, setAccessMode] = useState<BroadcastAccessMode | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [recordingConfirmed, setRecordingConfirmed] = useState(false);

  const adopt = useCallback((c: StudioConfig) => {
    setConfig(c);
    setPresenter(c.presenter_enrollment_id ?? '');
    setProducer(c.producer_enrollment_id ?? '');
    setGuestAccess(c.guest_access);
    setAccessMode(c.occurrence?.access_mode ?? null);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await getStudioConfig(sessionId);
        if (!cancelled) adopt(c);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.response?.status === 404) setNotFound(true);
        else setUnreachable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, adopt]);

  const producerIsPresenter = Boolean(presenter && producer && presenter === producer);

  const summary: SummaryItem[] = [
    { label: 'Producer is not the presenter', done: Boolean(presenter && producer) && !producerIsPresenter },
    { label: 'Audience chosen', done: guestAccess !== null },
    { label: 'Access mode chosen', done: accessMode !== null },
    { label: 'Permanence acknowledged', done: acknowledged },
  ];
  const canCreate = summary.every((s) => s.done) && !saving;

  async function save(create: boolean) {
    if (!sessionId) return;
    setSaving(true);
    setRefusal(null);
    setUnreachable(false);
    try {
      const out = await patchStudioConfig(sessionId, {
        presenter_enrollment_id: presenter || null,
        producer_enrollment_id: producer || null,
        guest_access: guestAccess,
        ...(config?.canSetAccessMode && accessMode ? { access_mode: accessMode } : {}),
        ...(config?.occurrence ? { expected_version: config.occurrence.version } : {}),
        ...(create ? { create: true } : {}),
      });
      if (out.config) setConfig(out.config);
      if (!out.ok && out.refusal) setRefusal(out.refusal);
    } catch {
      // The form keeps its values. It never reports a success it did not get.
      setUnreachable(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="cls-root"><div className="cls-shell">Loading the class.</div></div>;

  if (notFound) {
    return (
      <div className="cls-root">
        <div className="cls-shell">
          <h1 className="cls-title">That class could not be found</h1>
          <p className="cls-sub">
            The link may be out of date, or the class may have been deleted. Check the address, or
            open Studio setup again from the admin menu.
          </p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="cls-root">
        <div className="cls-shell">
          <h1 className="cls-title">Studio setup is unavailable</h1>
          <p className="cls-sub">The class could not be loaded. Reload the page to try again.</p>
        </div>
      </div>
    );
  }

  const { session, occurrence, canSetAccessMode } = config;

  return (
    <div className="cls-root">
      <div className="cls-shell">
        <header className="cls-head">
          <h1 className="cls-title">Studio setup</h1>
          <p className="cls-sub">
            {session.title}
            {session.session_date ? ` on ${session.session_date}` : ''}
            {session.start_time ? ` at ${session.start_time}` : ''}
          </p>
        </header>

        <div className="cls-grid">
          <div>
            <section className="cls-card">
              <h2 className="cls-card-title">The show</h2>
              <div className="cls-field">
                <label className="cls-label" htmlFor="cls-title-input">Title</label>
                <input id="cls-title-input" className="cls-input" value={session.title} disabled readOnly />
              </div>
              <p className="cls-sub">
                Series selection is not available yet, so this class is not part of a recurring
                show. Artwork is not available yet either.
              </p>
            </section>

            <section className="cls-card">
              <h2 className="cls-card-title">People</h2>
              <div className="cls-field">
                <label className="cls-label" htmlFor="cls-presenter">Presenter</label>
                <input
                  id="cls-presenter" className="cls-input" value={presenter}
                  onChange={(e) => setPresenter(e.target.value)}
                  placeholder="Enrollment id of whoever is teaching"
                />
              </div>
              <div className="cls-field">
                <label className="cls-label" htmlFor="cls-producer">Producer</label>
                <input
                  id="cls-producer" className="cls-input" value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                  placeholder="Enrollment id of whoever runs the show"
                />
              </div>
              {producerIsPresenter && (
                <p className="cls-note cls-note-error" role="alert">
                  The producer has to be someone other than the presenter. Whoever is teaching
                  cannot also watch the stream health and run the show.
                </p>
              )}
            </section>

            <section className="cls-card">
              <h2 className="cls-card-title">Audience</h2>
              <div className="cls-options">
                <button
                  type="button" className="cls-option" aria-pressed={guestAccess === false}
                  onClick={() => setGuestAccess(false)}
                >
                  <span className="cls-option-name">Cohort only</span>
                  <span className="cls-option-note">
                    Signed-in cohort members. Anyone else who scans the code is asked to sign in.
                  </span>
                </button>
                <button
                  type="button" className="cls-option" data-testid="cls-aud-guests" aria-pressed={guestAccess === true}
                  onClick={() => setGuestAccess(true)}
                >
                  <span className="cls-option-name">Cohort and guests</span>
                  <span className="cls-option-note">
                    Anyone who scans can join as a guest. A guest can read the question and vote,
                    and nothing else.
                  </span>
                </button>
              </div>
              <p className="cls-sub">
                This replaces the old rule, where a class accepted guests only if its title
                contained the words open house. The title no longer decides who may watch.
              </p>
            </section>

            <section className="cls-card">
              <h2 className="cls-card-title">Access mode</h2>
              <div className="cls-options">
                {ACCESS_MODES.map((m) => (
                  <button
                    key={m.value} type="button" className="cls-option"
                    aria-pressed={accessMode === m.value} data-testid={`cls-mode-${m.value}`}
                    disabled={!canSetAccessMode}
                    onClick={() => setAccessMode(m.value)}
                  >
                    <span className="cls-option-name">{m.value}</span>
                    <span className="cls-option-note">{m.note}</span>
                  </button>
                ))}
              </div>
              {canSetAccessMode ? (
                <>
                  <p className="cls-note cls-note-warn">
                    Who can watch is set once, when the broadcast is created, and cannot be changed
                    from any screen afterwards. Changing it later means deleting the broadcast and
                    creating it again, which needs someone with database access.
                  </p>
                  {accessMode && (
                    <p className="cls-sub">
                      Remote viewers:
                      {' '}
                      {ACCESS_MODES.find((m) => m.value === accessMode)?.note}
                    </p>
                  )}
                  <label className="cls-check" htmlFor="cls-ack">
                    <input
                      id="cls-ack" type="checkbox" checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    <span>I have checked the access mode. I understand it is permanent.</span>
                  </label>
                </>
              ) : (
                <p className="cls-note">
                  This broadcast already exists, so who can watch is fixed at
                  {' '}
                  <strong>{occurrence?.access_mode}</strong>
                  {' '}
                  and cannot be changed here.
                </p>
              )}
            </section>

            <section className="cls-card">
              <h2 className="cls-card-title">Recording</h2>
              <label className="cls-check" htmlFor="cls-rec">
                <input
                  id="cls-rec" type="checkbox" checked={recordingConfirmed}
                  onChange={(e) => setRecordingConfirmed(e.target.checked)}
                />
                <span>
                  Zoom cloud recording with transcription is switched on for this class.
                </span>
              </label>
              <p className="cls-sub">
                This is a Zoom setting, outside this product. A local-only recording produces no
                transcript, and the transcript has to be switched on before the class rather than
                after.
              </p>
              <p className="cls-note cls-note-warn">
                A class with no broadcast leaves every phone in the room on
                {' '}
                &quot;this class has not started yet&quot; for the whole session. The follow-along
                screen reads the broadcast state, so recording the class without airing it means
                the room gets no poll and no follow-along.
              </p>
            </section>
          </div>

          <aside className="cls-card cls-summary">
            <h2 className="cls-card-title">Before you create</h2>
            {summary.map((item) => (
              <div className="cls-sum-item" data-testid="cls-sum" key={item.label}>
                <span className={`cls-sum-state ${item.done ? 'cls-sum-done' : 'cls-sum-todo'}`}>
                  {item.done ? 'Done' : 'To do'}
                </span>
                <span>{item.label}</span>
              </div>
            ))}

            {refusal && (
              <p className="cls-note cls-note-error" role="alert">{REFUSAL_COPY[refusal]}</p>
            )}
            {unreachable && (
              <p className="cls-note cls-note-error" role="alert">
                That did not save. Your answers are still here. Check your connection and try
                again.
              </p>
            )}

            <button
              type="button" className="cls-btn cls-btn-primary" data-testid="cls-create"
              disabled={!canCreate} onClick={() => save(true)}
            >
              {occurrence ? 'Save changes' : 'Create broadcast'}
            </button>
            <button
              type="button" className="cls-btn cls-btn-ghost" data-testid="cls-save" style={{ marginTop: 10, width: '100%' }}
              disabled={saving} onClick={() => save(false)}
            >
              Save without creating
            </button>

            {occurrence && occurrence.provider_session_id === null && (
              <p className="cls-note cls-note-warn">
                This broadcast has no live input, so it is correctly timed and will not play.
                It needs a provider binding before the class airs.
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
