import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoStart } from '../hq/goStart';
import type { CampusAudience } from '../campusMap';
import type { PrepSummary } from '../../careerPrep/careerPrepApi';
import { useCareerPrepFlag } from '../../careerPrep/careerPrepFlag';
import { careerPrepFloorNum } from '../../careerPrep/careerPrepFloorNum';
import { useCareerPrepSummary } from '../../careerPrep/useCareerPrepSummary';
import { prepCardCopy } from '../../careerPrep/logic/prepCardCopy';

/**
 * Career Prep v27 (CP5.1): the Career Prep card on the campus home panel, directly under the Today card (shot
 * L1-1). Students only: explorers, partners and staff never see it, and neither does a student Career Prep is
 * not open for (Release 1 ships dark). Real data only: the floor number comes from the built floor, the
 * headline and rows from prepCardCopy, and a readiness the server does not have is left out. An interview row
 * opens the room with that interview as the anchor (?anchor=<id>). "Go to Career Prep" is goStart('prep'): the
 * tower opens already on the Career Prep floor (CP5.2).
 */
export interface CareerPrepCardProps { audience: CampusAudience; now: Date; onGo?: () => void }

export function CareerPrepCardView({ s, now, floor, onGo, onInterview }: { s: PrepSummary | null; now: Date; floor: string | null; onGo: () => void; onInterview: (id: string) => void }): React.ReactElement {
  const c = s ? prepCardCopy(s, now) : null;
  return (
    <section className="cm-prep-card" data-testid="cm-prep-card" aria-labelledby="cm-prep-h">
      {floor && <div className="cm-prep-floor" aria-label={`Floor ${floor}`}><b>{floor}</b><small>FLOOR</small></div>}
      <div className="cm-prep-body">
        <small className="cm-prep-kicker">Career Prep · in the tower</small>
        <h2 id="cm-prep-h">{c ? c.headline : 'Get ready for your next interview'}</h2>
        {c && c.rows.length > 0 && (
          <ul className="cm-prep-rows">{c.rows.map((r) => (
            <li key={r.id}><button type="button" className="cm-prep-row" onClick={() => onInterview(r.id)} data-testid={`cm-prep-row-${r.id}`}>
              <span><b>{r.title}</b> · {r.when} · <small>{r.tag}</small></span>
              {r.readiness !== undefined && (
                <span className="cm-prep-bar" role="img" aria-label={`Readiness ${r.readiness}, ready at ${r.target}`}>
                  <span className="cm-prep-fill" style={{ width: `${Math.min(100, r.readiness)}%` }} /><span className="cm-prep-tick" style={{ left: `${r.target}%` }} />
                </span>
              )}
            </button></li>
          ))}</ul>
        )}
        {c && c.more > 0 && <p className="cm-prep-more">+{c.more} more</p>}
        {c && <p className="cm-prep-line">{c.coraLine}</p>}
        <button type="button" className="cm-prep-go" onClick={onGo} data-testid="cm-prep-go">Go to Career Prep</button>
      </div>
    </section>
  );
}

export function CareerPrepCard({ audience, now, onGo }: CareerPrepCardProps): React.ReactElement | null {
  const navigate = useNavigate();
  const goStart = useGoStart();
  const member = audience === 'member';
  const on = useCareerPrepFlag(member);
  const s = useCareerPrepSummary(member && on === true);
  if (!member || on !== true || s === undefined) return null;
  return <CareerPrepCardView s={s} now={now} floor={careerPrepFloorNum()} onGo={onGo ?? (() => goStart('prep'))}
    onInterview={(id) => navigate(`/portal/career/room?anchor=${encodeURIComponent(id)}`)} />;
}
