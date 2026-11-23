/**
 * The pieces every Platform Operations tab is built from.
 *
 * The design template is one object repeated: a card with a heading, a basis phrase saying
 * what its numbers are OF, an optional sentence, a body, and an action row on the floor.
 * Learning it once here means the six tabs still to come are assembly rather than design.
 *
 * Two rules from the template are enforced by these types rather than left to a reviewer:
 * a card must state its basis (`basis` is required), and a status is always a word, never
 * only a colour (`Pill` takes `label` and renders it).
 */
import React from 'react';

export type Tone = 'ok' | 'bad' | 'warn' | 'off';

/** The seven tabs, in the template's order. `built` is the honest part. */
export interface OperationsTab {
  key: string;
  label: string;
  path: string;
  built: boolean;
  /** What this screen answers, shown on the disabled chip so the shape is legible. */
  question: string;
}

export const OPERATIONS_TABS: OperationsTab[] = [
  { key: 'fleet', label: 'Fleet', path: '/admin/system/operations', built: true, question: 'What is running, and is it alive?' },
  { key: 'controls', label: 'Controls', path: '/admin/system/operations/controls', built: false, question: 'Turn it on, turn it off, stop it now.' },
  { key: 'failures', label: 'Failures', path: '/admin/system/operations/failures', built: false, question: 'What broke, and what happens to it now?' },
  { key: 'authority', label: 'Authority', path: '/admin/system/operations/authority', built: false, question: 'Who may do what, and who approved it?' },
  { key: 'safety', label: 'Safety', path: '/admin/system/operations/safety', built: false, question: 'Is anything behaving in a way it should not?' },
  { key: 'release', label: 'Release and data', path: '/admin/system/operations/release', built: false, question: 'Did the change land, and can we get back?' },
  { key: 'direction', label: 'Direction', path: '/admin/system/operations/direction', built: false, question: 'What should change next, and who is told?' },
];

export function Pill({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`ops-pill ops-pill--${tone}`}>{label}</span>;
}

/** Title plus a mono sub-line: the template's standard left column. */
export function RowMain({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="ops-row-main">
      <div className="ops-row-title">{title}</div>
      {sub !== undefined && <div className="ops-row-sub">{sub}</div>}
    </div>
  );
}

export function Card(props: {
  title: string;
  /** What the numbers are of — "last 24 hours", "firing under no registry row". Required. */
  basis: string;
  note?: string;
  width?: 'half' | 'wide' | 'third' | 'table';
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { title, basis, note, width = 'half', children, actions } = props;
  const widthClass = width === 'wide' ? ' ops-card--wide'
    : width === 'third' ? ' ops-card--third'
      : width === 'table' ? ' ops-card--table' : '';
  return (
    <section className={`ops-card${widthClass}`}>
      <div className="ops-card-head">
        <h2>{title}</h2>
        <span className="ops-basis">{basis}</span>
      </div>
      {note && <p className="ops-note">{note}</p>}
      <div>{children}</div>
      {actions && <div className="ops-actions">{actions}</div>}
    </section>
  );
}

/**
 * An action the design calls for that no endpoint answers yet.
 *
 * It renders, because removing it would lose the design's shape, and it is disabled with a
 * `title` saying which phase wires it. A button that looks live and does nothing is worse
 * than one that says it is not ready.
 */
export function PlannedButton({ label, phase, primary }: { label: string; phase: string; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`ops-btn${primary ? ' ops-btn--primary' : ''}`}
      disabled
      title={`Not wired yet: ${phase}.`}
    >
      {label}
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="ops-empty">{children}</div>;
}
