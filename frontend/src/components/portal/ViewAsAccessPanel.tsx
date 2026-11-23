import React, { useEffect, useRef } from 'react';
import { useMgmtStatus } from '../../pages/portal/useMgmtStatus';
import { viewAsAccess, viewAsSummary, type ViewAsArea, type ViewAsPinned } from '../../pages/portal/viewAsAccess';

/**
 * AF12.18 - the scoped-access panel for a view-as session.
 *
 * ## What it answers and why it is not the admin surface
 *
 * Ali, 2026-11-22: *"I need to view admin marketing as she would see it when I click there."* The
 * literal request is a read-only admin session, which needs a read-only mode the admin surface
 * does not have; `mgmtBridgeGate.ts` records why inventing one was refused. The question UNDER
 * the request is answerable now and without minting anything: who can reach what.
 *
 * So this shows the sidebar her sections resolve to, from `GET /api/portal/mgmt/status` read with
 * HER token, because in a view-as tab that is the token the request carries. No admin session is
 * created, nobody is impersonated, and there is deliberately not one link out of here: the bridge
 * stays refused, and a panel that explained the refusal while offering a way around it would be
 * worth less than no panel.
 *
 * ## Why it hangs off the read-only banner
 *
 * The banner is the one element guaranteed to be on screen for exactly as long as the view-as
 * session lasts, on every portal page. The campus tower is where Ali hit this, but the tower is
 * behind `campus.active` and most staff never open it, so a panel reachable only from there would
 * answer the question in the one place it had already been asked and nowhere else.
 */

const S: Record<string, React.CSSProperties> = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 20001,
    background: 'rgba(17,24,39,0.55)', display: 'flex',
    alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px 24px', overflow: 'auto',
  },
  sheet: {
    background: '#fff', borderRadius: 10, width: '100%', maxWidth: 640,
    boxShadow: '0 18px 48px rgba(0,0,0,0.35)', overflow: 'hidden', textAlign: 'left',
  },
  head: { background: '#7c2d12', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 700, lineHeight: 1.35, flex: 1, minWidth: 0 },
  sub: { margin: '4px 0 0', fontSize: '0.76rem', fontWeight: 500, opacity: 0.9, lineHeight: 1.45 },
  close: {
    background: 'rgba(255,255,255,0.18)', color: '#fff', border: 0, borderRadius: 6,
    padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
  },
  body: { padding: '16px 18px 18px', fontSize: '0.82rem', color: '#2d3748', lineHeight: 1.55 },
  kick: { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#718096', margin: '16px 0 6px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '2px 7px', fontSize: '0.72rem', fontFamily: 'ui-monospace, monospace', color: '#334155' },
  row: { display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid #eef2f6', alignItems: 'baseline' },
  dot: { width: 8, height: 8, borderRadius: 8, flexShrink: 0, marginTop: 6 },
  rowMain: { flex: 1, minWidth: 0 },
  rowLabel: { fontWeight: 600 },
  rowSmall: { display: 'block', color: '#718096', fontSize: '0.74rem' },
  note: { marginTop: 16, paddingTop: 12, borderTop: '1px solid #eef2f6', color: '#718096', fontSize: '0.74rem' },
  summary: { fontWeight: 600, color: '#1a202c' },
};

const TONE: Record<string, string> = { open: '#38a169', via_list: '#d69e2e', withheld: '#cbd5e0' };

function AreaRow({ a }: { a: ViewAsArea }): React.ReactElement {
  const detail = a.reach === 'open'
    ? a.pages.join(', ')
    : a.reach === 'via_list'
      ? `Only through ${a.lists.join(', ')}, and only if any of those rows are theirs. The ${a.label} pages themselves stay closed.`
      : `Needs the ${a.section} section.`;
  return (
    <div style={S.row} data-testid={`va-area-${a.section}-${a.reach}`}>
      <span style={{ ...S.dot, background: TONE[a.reach] }} aria-hidden="true" />
      <span style={S.rowMain}>
        <span style={S.rowLabel}>{a.label}</span>
        <span style={S.rowSmall}>{detail}</span>
        {a.reach === 'open' && a.withheldPages.length > 0 && (
          <span style={S.rowSmall}>Closed inside it: {a.withheldPages.join(', ')}.</span>
        )}
      </span>
    </div>
  );
}

export interface ViewAsAccessPanelProps {
  email: string;
  roleLabel: string | null;
  sections: readonly string[];
  isMgmt: boolean;
  /** True until the status request settles. A panel about access must not answer before it knows. */
  loading: boolean;
  onClose: () => void;
}

/** The panel itself, with no fetching in it, so what it says is assertable from its props alone. */
export function ViewAsAccessPanel({ email, roleLabel, sections, isMgmt, loading, onClose }: ViewAsAccessPanelProps): React.ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const who = email || 'this member';
  const access = viewAsAccess(sections);
  const byReach = (r: string): ViewAsArea[] => access.areas.filter((a) => a.reach === r);
  const pinned = (p: ViewAsPinned): string => (p.conditional ? `${p.label} (also needs a linked portal account)` : p.label);

  return (
    <div style={S.scrim} onClick={onClose} data-testid="va-scrim">
      <div
        style={S.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="va-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="va-panel"
      >
        <div style={S.head}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={S.title} id="va-title">What {who} can reach in admin</h2>
            <p style={S.sub}>Read from their own session, not yours. This describes their access, it does not open it.</p>
          </div>
          <button type="button" style={S.close} onClick={onClose} ref={closeRef} data-testid="va-close">Close</button>
        </div>
        <div style={S.body}>
          {loading ? (
            <p data-testid="va-loading">Reading their access.</p>
          ) : !isMgmt ? (
            <p data-testid="va-not-mgmt">
              {who} has no management role, so the admin sidebar has nothing to show them. Only a staff
              member with a management role reaches any of it.
            </p>
          ) : (
            <>
              <p style={S.summary} data-testid="va-summary">
                {roleLabel ? `Role: ${roleLabel}. ` : ''}{viewAsSummary(access)}
              </p>

              <div style={S.kick}>Sections on their badge</div>
              <div style={S.chips}>
                {sections.length === 0
                  ? <span style={S.chip}>none</span>
                  : sections.map((s) => <span style={S.chip} key={s}>{s}</span>)}
              </div>

              <div style={S.kick}>Open to them</div>
              {byReach('open').length === 0
                ? <p style={S.rowSmall}>No area of the sidebar opens on their sections.</p>
                : byReach('open').map((a) => <AreaRow a={a} key={a.section + a.label} />)}

              {byReach('via_list').length > 0 && (
                <>
                  <div style={S.kick}>Reachable only through a list</div>
                  {byReach('via_list').map((a) => <AreaRow a={a} key={a.section + a.label} />)}
                </>
              )}

              <div style={S.kick}>Quick links on their sidebar</div>
              <p data-testid="va-pinned">
                {access.pinnedOpen.length === 0
                  ? 'None.'
                  : access.pinnedOpen.map(pinned).join(', ') + '.'}
                {access.pinnedWithheld.length > 0 && (
                  <span style={S.rowSmall}>Closed: {access.pinnedWithheld.join(', ')}.</span>
                )}
              </p>

              <div style={S.kick}>Closed to them</div>
              {byReach('withheld').length === 0
                ? <p style={S.rowSmall}>Nothing. Their badge opens every area.</p>
                : byReach('withheld').map((a) => <AreaRow a={a} key={a.section + a.label} />)}
            </>
          )}
          <p style={S.note}>
            The Management Portal itself stays closed while you view as someone else, because it opens in
            a new tab and a new tab would act as you rather than as them. Leaving view-as is what opens it.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The panel plus its one read. Mounted only while open, so a view-as session that never opens the
 * panel makes no extra request: the status call happens on the click, not on every portal page.
 */
export default function ViewAsAccessSheet({ email, onClose }: { email: string; onClose: () => void }): React.ReactElement {
  const status = useMgmtStatus();
  return (
    <ViewAsAccessPanel
      email={email}
      roleLabel={status.label}
      sections={status.sections}
      isMgmt={status.is_mgmt}
      loading={status.loading}
      onClose={onClose}
    />
  );
}
