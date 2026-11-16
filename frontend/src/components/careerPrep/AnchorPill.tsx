import React from 'react';
import type { PrepInterview } from './careerPrepApi';
import { interviewWhen } from './logic/careerPrepCopy';

/**
 * Career Prep v27 (CP3.1): what this prep is for. "Preparing for <company> · <day, time Central> ·
 * <Real interview | Added by you | Practice · made by Cora>", with Change. Before an interview is
 * chosen it says so plainly (Cora asks in the chat).
 */
const TAG: Record<PrepInterview['source'], string> = { real: 'Real interview', added: 'Added by you', practice: 'Practice · made by Cora' };

export function anchorText(a: PrepInterview): string {
  return [a.company, a.startsAt ? interviewWhen(a.startsAt) : null, TAG[a.source]].filter(Boolean).join(' · ');
}

export function AnchorPill({ anchor, onChange }: { anchor: PrepInterview | null | undefined; onChange: () => void }): React.ReactElement {
  if (!anchor) return <span className="cp-anchor is-empty" data-testid="cp-anchor">No interview chosen yet</span>;
  return (
    <span className="cp-anchor" data-testid="cp-anchor">
      <span>Preparing for <b>{anchor.company}</b>{anchor.startsAt ? <> · {interviewWhen(anchor.startsAt)}</> : null}</span>
      <span className={`cp-pill ${anchor.source === 'real' ? 'ok' : anchor.source === 'added' ? 'info' : 'warn'}`}>{TAG[anchor.source]}</span>
      <button type="button" className="cp-anchor-change" onClick={onChange}>Change</button>
    </span>
  );
}
