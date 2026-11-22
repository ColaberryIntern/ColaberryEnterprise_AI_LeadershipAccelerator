import React from 'react';
import { Link } from 'react-router-dom';
import type { InboxLine, SwitchState } from './careerDeskApi';
import type { DeskResult } from './useDesk';

/** Small shared pieces of the interview desk (kit F9): pills, the answer line, the learner picker and the prep link. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';
export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; testId?: string }> = ({ tone, children, testId }) => (
  <span className={`cdesk-pill cdesk-p-${tone}`} data-testid={testId}>{children}</span>
);

// Why a queue item is here, as the kit's short pill; the server's own title is the card's heading.
const KIND_PILL: Record<string, [string, Tone]> = {
  low_confidence: ['Low confidence', 'warn'], needs_review: ['Check first', 'warn'], unmatched_learner: ['No learner matched', 'bad'],
  unmatched_update: ['Update unmatched', 'info'], ambiguous_update: ['Update unclear', 'info'], not_booked: ['Not booked in 24 h', 'info'],
  recording_mismatch: ['Recording check', 'bad'], booking_gave_up: ['Link not sent', 'bad'], no_contact: ['No employer email', 'warn'], confirm_gave_up: ['Room not ready', 'bad'],
};
export const kindPill = (kind: string): [string, Tone] => KIND_PILL[kind] ?? ['Needs a person', 'info'];
const HEALTH_TONE: Record<string, Tone> = { healthy: 'ok', quiet: 'warn', untested: 'info', broken: 'bad', setup: 'mute' };
export const healthTone = (h: string): Tone => HEALTH_TONE[h] ?? 'mute';
const STATE_TONE: Record<string, Tone> = { booked: 'ok', done: 'ok', new: 'info', awaiting: 'info', review: 'warn', cancelled: 'mute' };
export const stateTone = (s: string): Tone => STATE_TONE[s] ?? 'mute';
export const SWITCH_WORDS: Record<SwitchState, [string, Tone]> = { on: ['On', 'ok'], off: ['Off', 'mute'], unreadable: ['Could not be read (treated as off)', 'warn'] };

/** The server's answer to the last action, and the audit line when it ran. A live region, so a screen reader hears it. */
export const DeskAnswerLine: React.FC<{ result: DeskResult | null; testId: string }> = ({ result, testId }) => (
  <div role="status" aria-live="polite" data-testid={testId} className="cdesk-answer-slot">
    {result && (
      <p className={`cdesk-answer ${result.ok ? 'is-ok' : 'is-bad'}`}>
        <span data-testid={`${testId}-text`}>{result.text}</span>
        {result.audit && <span className="cdesk-audit" data-testid={`${testId}-audit`}>{result.audit}</span>}
      </p>
    )}
  </div>
);

/** Every Career Prep learner (from the inbox list), for "Match and send" and "Put forward". */
export const LearnerPicker: React.FC<{ id: string; label: string; learners: InboxLine[] | null; value: string; onChange: (v: string) => void; error?: string | null }> = ({ id, label, learners, value, onChange, error }) => (
  <div className="cdesk-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!learners || learners.length === 0} data-testid={id}>
      <option value="">{error ? 'Could not load learners' : !learners ? 'Loading learners...' : learners.length === 0 ? 'No learner is in Career Prep' : 'Pick a learner'}</option>
      {(learners ?? []).map((l) => <option key={l.enrollmentId} value={l.enrollmentId}>{l.learner || 'Unnamed learner'}{l.address ? ` (${l.address})` : ''}</option>)}
    </select>
  </div>
);

/** The learner's Career Prep evidence, read-only (Placement > Student prep, opened on that learner). */
export const PrepLink: React.FC<{ enrollmentId: string | null; name: string | null }> = ({ enrollmentId, name }) => (enrollmentId
  ? <Link className="cdesk-link" to={`/admin/placement/students?student=${encodeURIComponent(enrollmentId)}`} aria-label={`Open ${name || 'this learner'}'s prep`}>Prep</Link>
  : null);

export const DeskError: React.FC<{ text: string; onRetry?: () => void; testId: string }> = ({ text, onRetry, testId }) => (
  <div className="cdesk-error" role="alert" data-testid={testId}>
    <span>{text}</span>{onRetry && <button type="button" className="cdesk-btn cdesk-ghost cdesk-sm" onClick={onRetry}>Try again</button>}
  </div>
);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const looksLikeEmail = (v: string) => EMAIL.test(v.trim());
