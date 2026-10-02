import React, { useEffect, useState } from 'react';
import { fetchTemplates, type TemplateSummary } from './presentationApi';

/**
 * Lets a learner pick which KIND of presentation they are preparing.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. Without it a student is locked to whatever
 * template their task defaults to — so someone on PREP-3 preparing for the Capstone
 * Expo could only ever generate a five-minute visual presentation, never the
 * eight-minute final showcase the Expo actually asks for. The backend has accepted a
 * template change since the Prepare form shipped; there was simply no way to make one.
 *
 * CHANGING THE TEMPLATE CHANGES REAL WORK, so it is not a silent dropdown. The
 * checklist, the timed outline, the lesson on Learn and the generated deck prompt all
 * follow from it. The control says so before the choice, rather than leaving a student
 * to discover it when their deck comes out the wrong length.
 *
 * The four prominent templates lead; the rest sit behind "more", because a chooser
 * that presents seven equal options to someone who needs one of four is a worse
 * chooser than one that has an opinion.
 */

export interface TemplateChooserProps {
  /** Currently selected template id. */
  value: string;
  /** Persisted by the caller, which owns the save and the authoritative response. */
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

const mins = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s}s`);

export default function TemplateChooser({ value, onChange, disabled }: TemplateChooserProps) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    fetchTemplates()
      .then((t) => { if (live) setTemplates(t); })
      .catch((err: any) => {
        if (!live) return;
        setError(err?.response?.data?.error || 'Could not load the presentation types.');
      });
    return () => { live = false; };
  }, []);

  if (error) return <p className="ps-note" role="alert" data-testid="ps-chooser-error">{error}</p>;
  if (!templates) return <p className="ps-note ps-note--soft" data-testid="ps-chooser-loading">Loading presentation types&hellip;</p>;

  // The current selection is always shown, even if it is not one of the prominent
  // four — hiding a student's own choice behind "more" would be disorienting.
  const visible = showAll
    ? templates
    : templates.filter((t) => t.prominent || t.id === value);
  const hiddenCount = templates.length - visible.length;

  return (
    <div data-testid="ps-chooser">
      <p className="ps-label" style={{ marginBottom: 8 }}>
        What kind of presentation is this? Changing it changes your checklist, your timings
        and the deck prompt.
      </p>

      <ul className="ps-choices" role="radiogroup" aria-label="Presentation type">
        {visible.map((t) => {
          const selected = t.id === value;
          return (
            <li key={t.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                className={`ps-choice${selected ? ' is-on' : ''}`}
                onClick={() => !selected && onChange(t.id)}
                data-testid={`ps-choice-${t.id}`}
              >
                <span className="ps-choice-top">
                  <span className="ps-choice-label">{t.label}</span>
                  <span className="ps-choice-time">
                    {mins(t.speaking_seconds)}
                    {t.qa_seconds > 0 && <> + {mins(t.qa_seconds)} Q&amp;A</>}
                  </span>
                </span>
                <span className="ps-choice-outcome">{t.outcome}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="ps-btn ps-btn--soft"
          style={{ marginTop: 10 }}
          onClick={() => setShowAll(true)}
          data-testid="ps-chooser-more"
        >
          Show {hiddenCount} more {hiddenCount === 1 ? 'type' : 'types'}
        </button>
      )}
    </div>
  );
}
