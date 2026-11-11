import React from 'react';
import type { NowChip } from './nowModel';

/**
 * The "Happening now" strip (Campus v20 N2, Basecamp C133; the prototype's .nNow): one horizontal row of chips, each from real data
 * (nowModel.happeningChips leaves out a chip with nothing to say), each one does something when pressed. Hidden when empty.
 */
export default function HappeningStrip({ chips, onChip }: { chips: NowChip[]; onChip: (c: NowChip) => void }): React.ReactElement | null {
  if (!chips.length) return null;
  return (
    <div className="cn-now" role="list" aria-label="Happening now" data-testid="cn-happening">
      {chips.map((c) => (
        <button key={c.kind} type="button" role="listitem" className={`cn-now-chip is-${c.kind}`} onClick={() => onChip(c)} data-testid={`cn-chip-${c.kind}`}>
          {c.kind === 'campus' ? <span className="cn-livedot" aria-hidden="true" /> : <span aria-hidden="true">{c.icon}</span>}
          <b>{c.bold}</b>{c.rest && <span> · {c.rest}</span>}
        </button>
      ))}
    </div>
  );
}
