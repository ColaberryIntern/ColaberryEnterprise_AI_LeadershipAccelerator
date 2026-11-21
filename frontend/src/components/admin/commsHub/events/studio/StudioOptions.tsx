import React from 'react';
import type { ThumbOption, ThumbSize } from '../../../../../services/commsHubApi';
import { costWord, SIZE_OPTIONS, sourceWord } from './studioDisplay';

/**
 * Step 3, Pick one, and the sizes (CH4.4, design 02). Options are a native radio group (arrow keys
 * move between them); each shows its style, where it came from, and for AI the exact prompt used.
 * The size radios switch the preview of the picked option.
 */
interface Props {
  options: ThumbOption[]; selectedId: string | null; size: ThumbSize; disabled: boolean;
  onSelect: (id: string) => void; onSize: (s: ThumbSize) => void;
}

export function OptionGrid({ options, selectedId, disabled, onSelect }: Omit<Props, 'size' | 'onSize'>): React.ReactElement {
  if (!options.length) return <p className="text-muted mb-0">No options yet. Choose a style and press Generate thumbnails.</p>;
  return (
    <fieldset className="ch-studio-options" disabled={disabled}>
      <legend className="visually-hidden">Thumbnail options</legend>
      {options.map((o, i) => {
        const id = `ch-opt-${o.id}`;
        const cost = costWord(o.cost_usd);
        return (
          <div key={o.id} className={`ch-studio-option${o.id === selectedId ? ' is-selected' : ''}`}>
            <input type="radio" className="visually-hidden ch-studio-radio" name="ch-thumb-option" id={id} value={o.id} checked={o.id === selectedId} onChange={() => onSelect(o.id)} />
            <label htmlFor={id}>
              {o.previews['16x9'] ? <img src={o.previews['16x9']} alt="" /> : <span className="ch-studio-noimg">Preview unavailable</span>}
              <span className="ch-studio-caption">
                <span className="fw-bold"><span className="visually-hidden">Option {i + 1}: </span>{o.style_label}</span>
                {o.id === selectedId && <span className="ch-studio-selected"> · Selected</span>}
                {o.chosen && <span className="ch-studio-inuse"> · In use</span>}
                <span className="d-block text-muted small">{sourceWord(o.source)}{cost ? ` · ${cost}` : ''}</span>
              </span>
            </label>
            {o.prompt && (
              <details className="ch-studio-prompt">
                <summary>Prompt used</summary>
                <p className="small mb-0">{o.prompt}</p>
              </details>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

export function SizePreview({ options, selectedId, size, disabled, onSize }: Omit<Props, 'onSelect'>): React.ReactElement | null {
  const picked = options.find((o) => o.id === selectedId);
  if (!picked) return null;
  const src = picked.previews[size];
  const label = SIZE_OPTIONS.find((x) => x.value === size)!.label;
  return (
    <section aria-labelledby="ch-studio-sizes" className="ch-studio-step">
      <h3 id="ch-studio-sizes" className="ch-studio-h">Sizes</h3>
      <p className="ch-studio-hint mb-2">All three sizes are saved with every option. Pick one to preview or download.</p>
      <fieldset disabled={disabled}>
        <legend className="visually-hidden">Size to preview and download</legend>
        {SIZE_OPTIONS.map((x) => (
          <div className="form-check" key={x.value}>
            <input className="form-check-input" type="radio" name="ch-thumb-size" id={`ch-size-${x.value}`} checked={size === x.value} onChange={() => onSize(x.value)} />
            <label className="form-check-label" htmlFor={`ch-size-${x.value}`}>{x.label} <span className="text-muted">· {x.use}</span></label>
          </div>
        ))}
      </fieldset>
      <div className={`ch-studio-preview ch-size-${size}`}>
        {src ? <img src={src} alt={`${picked.style_label}, ${label}: ${picked.headline ?? 'event thumbnail'}`} /> : <p className="text-muted mb-0">This size is not available for this option.</p>}
      </div>
      {picked.cropped.includes(size) && <p className="small text-muted mb-0">This size is cropped from the picture, so check nothing important is cut off.</p>}
    </section>
  );
}
