import React, { useEffect, useState } from 'react';
import { EmptyState, SectionCard } from '../shell';
import {
  createTrial, getCatalog, previewVoice, scoreTrial, startTestCall, statusOf, stopTestCall, studioErrorMessage, trialClip, TEST_RUN_ESTIMATE_USD,
  type AbTrial, type CatalogVoice,
} from '../../../services/voiceStudioApi';

/**
 * Voice Lab (VS3.4): the verified voice catalog, real previews, a blind A/B comparison, and a test
 * call with an estimated spend and a stop button. Voices are named here only from the catalog; in a
 * trial the two voices are just X and Y until a preference is saved, and the server enforces that.
 * A dry run never dials. A live test uses the Test Lab and its caps (3 attempts, 180 seconds, $5).
 */
const SAMPLE = "Hi, this is Colaberry's AI assistant. I'm an AI, not a person. How can I help?";

export default function VoiceLabTab(): React.ReactElement {
  const [voices, setVoices] = useState<CatalogVoice[]>([]);
  const [off, setOff] = useState(false);
  const [text, setText] = useState(SAMPLE);
  const [audio, setAudio] = useState<string | null>(null);
  const [voiceA, setVoiceA] = useState('marin');
  const [voiceB, setVoiceB] = useState('cedar');
  const [trial, setTrial] = useState<AbTrial | null>(null);
  const [clips, setClips] = useState<{ X?: string; Y?: string }>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [dry, setDry] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [call, setCall] = useState<string | null>(null);

  useEffect(() => { getCatalog().then(setVoices).catch((e) => { if (statusOf(e) === 404) setOff(true); else setMsg({ tone: 'danger', text: studioErrorMessage(e, 'The catalog could not be loaded.') }); }); }, []);

  const run = async (fn: () => Promise<void>, fallback: string) => { setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: 'danger', text: studioErrorMessage(e, fallback) }); } };
  const play = (voice: string) => run(async () => { setAudio(await previewVoice(voice, text)); }, 'The preview could not be made.');
  const startTrial = () => run(async () => { setClips({}); setTrial(await createTrial(voiceA, voiceB, text)); }, 'The comparison could not be started.');
  const loadClip = (label: 'X' | 'Y') => run(async () => { const url = await trialClip(trial!.trialId, label); setClips((c) => ({ ...c, [label]: url })); }, 'The clip could not be made.');
  const score = (p: 'X' | 'Y' | 'tie') => run(async () => { setTrial(await scoreTrial(trial!.trialId, p)); }, 'The score was not saved.');
  // A live test dials a real phone, so it takes a second, explicit click. The dry run does not.
  const startCall = () => run(async () => {
    if (dry) { setMsg({ tone: 'info', text: 'Dry run: no phone was dialed and nothing was spent. A live test would use the Test Lab.' }); return; }
    setConfirming(false);
    const r = await startTestCall(`lab-${Date.now().toString(36)}`, 'openai_realtime').catch((e) => {
      if (statusOf(e) === 404) return { callId: undefined, error: 'test calls are switched off on this server' };
      throw e;
    });
    if (r.callId) { setCall(r.callId); setMsg({ tone: 'info', text: 'Calling the authorized test phone now.' }); } else setMsg({ tone: 'danger', text: `The test call was not started: ${r.error ?? 'refused'}.` });
  }, 'The test call was refused. Test mode may be off, or the attempt limit reached.');
  const stop = () => run(async () => { await stopTestCall(call!); setCall(null); setMsg({ tone: 'success', text: 'The test call was ended.' }); }, 'The call could not be stopped. It ends on its own within 3 minutes.');

  if (off) return <EmptyState icon="toggle-line" title="Voice Studio is switched off on this server" description="An administrator turns it on with VOICE_STUDIO_UI_ENABLED. Calls are not affected either way." />;

  const previewable = voices.filter((v) => v.preview === 'tts_approximation');
  const callOnly = voices.filter((v) => v.preview === 'test_call_only');

  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <SectionCard title="Voices" icon="sound-module-line" subtitle="Only voices a vendor page documents. OpenAI previews approximate the call voice; they are not identical by their docs.">
          <label className="form-label small fw-semibold" htmlFor="vs-lab-text">Sample sentence</label>
          <textarea id="vs-lab-text" className="form-control form-control-sm mb-3" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="d-flex flex-wrap gap-2 mb-3">
            {previewable.map((v) => (
              <button key={v.id} type="button" className={`btn btn-sm ${v.recommended ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => { void play(v.id); }}>
                {v.label}{v.recommended ? ' (recommended)' : ''}
              </button>
            ))}
          </div>
          {audio && <audio controls src={audio} className="w-100 mb-2" data-testid="preview-audio" />}
          <p className="small text-muted mb-0">Heard only on a test call (Twilio speaks them inside the call): {callOnly.map((v) => v.label).join(', ') || 'none'}.</p>
        </SectionCard>
      </div>
      <div className="col-lg-6">
        <SectionCard title="Blind comparison" icon="scales-line" subtitle="X and Y stay anonymous until you save a preference.">
          <div className="row g-2 mb-2">
            {(['A', 'B'] as const).map((s) => (
              <div className="col-6" key={s}>
                <label className="form-label small" htmlFor={`vs-ab-${s}`}>Voice {s}</label>
                <select id={`vs-ab-${s}`} className="form-select form-select-sm" value={s === 'A' ? voiceA : voiceB} onChange={(e) => (s === 'A' ? setVoiceA : setVoiceB)(e.target.value)}>
                  {previewable.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-primary mb-3" disabled={voiceA === voiceB} onClick={() => { void startTrial(); }}>Start a blind comparison</button>
          {trial && (
            <div data-testid="trial">
              <div className="d-flex gap-2 mb-2">
                {(['X', 'Y'] as const).map((l) => <button key={l} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { void loadClip(l); }}>Play {l}</button>)}
              </div>
              {clips.X && <div className="small mb-1">X <audio controls src={clips.X} data-testid="clip-X" /></div>}
              {clips.Y && <div className="small mb-2">Y <audio controls src={clips.Y} data-testid="clip-Y" /></div>}
              {!trial.scored ? (
                <div className="d-flex gap-2" role="group" aria-label="Which voice did you prefer">
                  {(['X', 'Y', 'tie'] as const).map((p) => <button key={p} type="button" className="btn btn-sm btn-outline-primary" onClick={() => { void score(p); }}>Prefer {p === 'tie' ? 'neither' : p}</button>)}
                </div>
              ) : (
                <div className="alert alert-success small mb-0" data-testid="reveal">Saved: {trial.preferred}. X was {trial.reveal?.X}, Y was {trial.reveal?.Y}.</div>
              )}
            </div>
          )}
        </SectionCard>
        <div className="mt-3">
          <SectionCard title="Test call" icon="phone-line" subtitle="Only the authorized test phone can ring. 3 attempts, 180 seconds and $5 per run are hard limits.">
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" id="vs-dry" checked={dry} onChange={(e) => { setDry(e.target.checked); setConfirming(false); }} />
              <label className="form-check-label small" htmlFor="vs-dry">Dry run (dials nothing)</label>
            </div>
            <p className="small text-muted mb-2" data-testid="estimate">Estimated spend: {dry ? '$0.00 (dry run)' : `at most $${TEST_RUN_ESTIMATE_USD.toFixed(2)} for a full run of 3 calls`}.</p>
            <div className="d-flex gap-2">
              <button type="button" className={`btn btn-sm ${dry ? 'btn-outline-primary' : 'btn-danger'}`} disabled={!!call || confirming} onClick={() => { if (dry) void startCall(); else { setMsg(null); setConfirming(true); } }}>{dry ? 'Dry run' : 'Start live test call'}</button>
              <button type="button" className="btn btn-sm btn-outline-danger" disabled={!call} onClick={() => { void stop(); }}>Stop call</button>
            </div>
            {confirming && (
              <div className="alert alert-warning small mt-2 mb-0" role="group" aria-label="Confirm the live test call" data-testid="confirm-live">
                <p className="mb-2">This rings the authorized test phone now, for at most 180 seconds. Estimated spend for a full run of 3 calls: at most ${TEST_RUN_ESTIMATE_USD.toFixed(2)}.</p>
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-sm btn-danger" autoFocus onClick={() => { void startCall(); }}>Ring the test phone</button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
      <div className="col-12" role="status" aria-live="polite">{msg && <div className={`alert alert-${msg.tone} small`} data-testid="lab-msg">{msg.text}</div>}</div>
    </div>
  );
}
