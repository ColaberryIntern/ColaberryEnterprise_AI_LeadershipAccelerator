import React from 'react';
import { lessonDoc, readerDoc, READER_SANDBOX } from '../../../components/timeline/CardDetailBody';
import type { useDeepDiveHost } from '../../../components/timeline/useDeepDiveHost';
import type { RtOpen } from './runtimeApi';

/**
 * Content-in-iframe cards (the Self Study immersive reader, the Deep Dive field guide, or a generic lesson) FILL the center as the
 * single scroll, with the complete gate in a slim foot, so there are never dueling scrollbars. The reader runs scripts (sticky nav
 * + read-gate); a plain lesson stays inert (sandbox=""), except intel-band cards (AI News Flash etc.) which embed a real source
 * <a href> and need allow-popups or the click is silently swallowed by the sandbox. Lifted out of RuntimeWorkspace unchanged when
 * the page passed the 500-line ceiling (Campus C19).
 */
export type FillKind = 'reader' | 'deepdive' | 'lesson';

export default function RuntimeFillReader({ card, kind, band, doneIds, frameRef, dd, gate }: {
  card: RtOpen['card'];
  kind: FillKind;
  band: string;
  doneIds: string[];
  frameRef: React.RefObject<HTMLIFrameElement>;
  dd: ReturnType<typeof useDeepDiveHost>;
  gate: React.ReactNode;
}): React.ReactElement {
  const body = card.content?.body_html || '';
  return (
    <div className="rt-readerwrap">
      <iframe
        ref={kind === 'deepdive' ? frameRef : undefined}
        className="rt-readerframe"
        title={kind === 'reader' ? 'Self Study reading' : kind === 'deepdive' ? 'Field Guide' : 'Lesson'}
        sandbox={kind === 'reader' ? READER_SANDBOX : kind === 'deepdive' ? 'allow-scripts allow-modals' : band === 'intel' ? 'allow-popups' : ''}
        srcDoc={kind === 'reader'
          ? readerDoc(body, card.content?.title || card.title, { cardId: card.id, doneIds })
          : kind === 'deepdive' ? body : lessonDoc(body)}
      />
      <div className="rt-readerfoot">
        {kind === 'deepdive' && dd.message && <span className="rt-muted" style={{ marginRight: 'auto' }}>{dd.message}</span>}
        {kind === 'deepdive' && <input ref={dd.fileInputRef} type="file" accept=".html,.htm,text/html" hidden onChange={dd.onFileChange} />}
        {gate}
      </div>
    </div>
  );
}
