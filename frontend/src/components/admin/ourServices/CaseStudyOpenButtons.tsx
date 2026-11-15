import React, { useState } from 'react';
import { getCaseStudySourceFile, type SourceKind } from '../../../services/ourServicesApi';
import { caseStudyHref } from './CaseStudyCard';

/**
 * CaseStudyOpenButtons - the two ways to look at a case study before deciding to link it:
 *   - "Manage": the case-study desk (record, preview, sources), in a new tab. Every case study has one.
 *   - "Open original": the uploaded document of an OUTSIDE case study, in a new tab. Inside case studies were built
 *     here, so they have no original file and get no button.
 *
 * The original is served behind admin auth (GET .../source-file), so it cannot be a plain link: the bytes are
 * fetched with the session's token and opened as a blob URL. The tab is opened synchronously on the click and filled
 * once the bytes arrive, so a popup blocker treats it as the user's own click.
 *
 * Failure modes: no stored original (404) -> the tab closes and the button says so; any other failure -> the tab
 * closes and a short error shows. No retry: the button can be clicked again.
 */
type OpenState = 'idle' | 'loading' | 'none' | 'error';

/** Fetch an outside case study's original and show it in a tab opened during the click. */
export async function openOriginalInNewTab(caseStudyId: string, win: Window | null): Promise<'opened' | 'none' | 'error'> {
  try {
    const blob = await getCaseStudySourceFile(caseStudyId);
    if (!blob) { win?.close(); return 'none'; }
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
    // The tab has loaded the bytes by then; the URL is only a handle.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'opened';
  } catch {
    win?.close();
    return 'error';
  }
}

const OPEN_MSG: Record<Exclude<OpenState, 'idle' | 'loading'>, string> = {
  none: 'No original file is stored for this case study.',
  error: 'Could not open the original. Try again.',
};

export default function CaseStudyOpenButtons({ id, title, sourceKind, className = '' }: {
  id: string; title: string; sourceKind: SourceKind; className?: string;
}): React.ReactElement {
  const [state, setState] = useState<OpenState>('idle');
  const openOriginal = async (): Promise<void> => {
    setState('loading');
    const win = window.open('', '_blank');
    const r = await openOriginalInNewTab(id, win);
    setState(r === 'opened' ? 'idle' : r);
  };
  return (
    <span className={`d-inline-flex flex-wrap align-items-center gap-1 ${className}`}>
      <a className="btn btn-outline-primary btn-sm py-0" href={caseStudyHref(id)} target="_blank" rel="noopener noreferrer"
        data-testid={`manage-case-study-${id}`}>
        <i className="ri-settings-3-line me-1" aria-hidden="true" />Manage
        <span className="visually-hidden"> {title} (opens the case-study desk in a new tab)</span>
      </a>
      {sourceKind === 'outside' && (
        <button type="button" className="btn btn-outline-secondary btn-sm py-0" onClick={() => void openOriginal()}
          disabled={state === 'loading'} data-testid={`open-original-${id}`}>
          <i className="ri-file-pdf-2-line me-1" aria-hidden="true" />{state === 'loading' ? 'Opening…' : 'Open original'}
          <span className="visually-hidden"> of {title} (opens in a new tab)</span>
        </button>
      )}
      {(state === 'none' || state === 'error') && <span className="small text-danger-emphasis" role="status">{OPEN_MSG[state]}</span>}
    </span>
  );
}
