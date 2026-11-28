import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { SectionCard } from '../../../components/admin/shell';
import { screenById, screenHref, type ScreenId } from './screens';
import { useAgentSurface } from './agent/agentSurface';

/** The record the placeholder cross-link opens. Plainly an example, with no digits. */
export const EXAMPLE_REF = 'example';

const RELEASE_WORD: Record<1 | 2 | 3 | 4, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };

/**
 * An honest placeholder (AO1.4): it says what the screen will hold and when, and links where the demo links.
 * It shows no figure of any kind, so nothing on it can be mistaken for data.
 */
export default function PlaceholderScreen({ id }: { id: ScreenId }): React.ReactElement {
  const s = screenById(id);
  const { ref } = useParams();
  // Placeholders publish their manifest too: the agent sees the screen and its (mostly unavailable) actions.
  useAgentSurface(id, () => ({ sources: [], ...(id === 'student360' && ref ? { subject: { type: 'student' as const, ref } } : {}) }));
  return (
    <SectionCard title={s.title} icon="time-line">
      <div data-testid={`ops-placeholder-${id}`}>
        <p className="mb-2">{s.holds}</p>
        {id === 'student360' && ref && (
          <p className="ops-placeholder-meta mb-2">Opened for record <code>{ref}</code>. Nothing is read from any system yet.</p>
        )}
        <p className="ops-placeholder-meta mb-0">
          This screen arrives in the {RELEASE_WORD[s.release]} release of four. Until then it shows no records and no figures.
        </p>
        {s.links.length > 0 && (
          <div className="ops-placeholder-links">
            {s.links.map((l) => (
              // Student 360 needs a record; until search exists (Release 2) the link opens an example record,
              // and says so, so the screen is reachable without pretending a real student is behind it.
              <Link
                key={l}
                to={l === 'student360' ? screenHref(l, EXAMPLE_REF) : screenHref(l)}
                className="btn btn-outline-secondary btn-sm"
                data-testid={`ops-crosslink-${l}`}
              >
                {l === 'student360' ? `${screenById(l).title} (example record)` : screenById(l).title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
