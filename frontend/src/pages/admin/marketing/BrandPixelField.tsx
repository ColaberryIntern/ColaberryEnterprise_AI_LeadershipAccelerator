import { useState } from 'react';
import { setBrandMetaPixelId, type Brand } from '../../../services/adminBrandApi';

/**
 * The Meta Pixel ID for one brand — the whole "just pass the id" process, as a field.
 *
 * WHY THIS EXISTS. Sohail asked for a pixel snippet to be added to one landing page so he could
 * start running ads. Pasting it would have answered that request and left the next brand, and
 * the next page, each needing another paste. Ali asked for the general shape instead: an
 * operator supplies the ID once per brand, and every hosted page that brand owns is tracked.
 *
 * WHAT IT DOES NOT DO. It does not accept a snippet. An operator who pastes Meta's whole
 * `<script>` block in here gets a validation message naming the ID, because the field takes the
 * one value that differs per advertiser and the renderer builds the rest. That is deliberate:
 * markup pasted into a form and echoed onto a public page is how a tracking field becomes an
 * XSS vector, and refusing it at the input is cheaper than escaping it at four later points.
 *
 * VALIDATION IS LOCAL AND IMMEDIATE because the alternative is a round trip to learn you typed
 * a letter. The backend and the database check the same rule; this one exists to be kind, not to
 * be trusted.
 */

/** Meta issues 15-16 digit IDs; the range matches the column CHECK and the Zod schema. */
const PIXEL_ID = /^[0-9]{8,20}$/;

export function BrandPixelField({
  brand,
  onSaved,
}: {
  brand: Brand;
  onSaved: (updated: Brand) => void;
}) {
  const [value, setValue] = useState(brand.meta_pixel_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = value.trim();
  const isClearing = trimmed === '';
  const localError = isClearing || PIXEL_ID.test(trimmed)
    ? null
    : /<|script|fbq/i.test(trimmed)
      ? 'Paste only the ID, not the whole snippet. It is the number in fbq(\'init\', \'…\').'
      : 'A Meta Pixel ID is 8 to 20 digits, with no spaces or letters.';

  async function save() {
    if (localError) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await setBrandMetaPixelId(brand.id, isClearing ? null : trimmed);
      onSaved(updated);
      setSaved(true);
    } catch (e) {
      // Say what failed. "Something went wrong" sends an operator to a developer.
      const detail = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(detail ?? 'Could not save the pixel ID. The change was not applied.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = trimmed !== (brand.meta_pixel_id ?? '');

  return (
    <div className="mt-3">
      <label className="form-label small fw-semibold mb-1" htmlFor="brand-meta-pixel">
        Meta Pixel ID
      </label>
      <div className="d-flex gap-2 align-items-start flex-wrap">
        <input
          id="brand-meta-pixel"
          className={`form-control form-control-sm${localError && dirty ? ' is-invalid' : ''}`}
          style={{ maxWidth: '18rem' }}
          inputMode="numeric"
          placeholder="e.g. 2250748725203240"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          aria-describedby="brand-meta-pixel-help"
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={save}
          disabled={saving || !dirty || Boolean(localError)}
        >
          {saving ? 'Saving…' : isClearing ? 'Turn tracking off' : 'Save'}
        </button>
      </div>

      {localError && dirty && <div className="invalid-feedback d-block small">{localError}</div>}
      {error && <div className="text-danger small mt-1">{error}</div>}
      {saved && !dirty && (
        <div className="text-success small mt-1">
          Saved. Every published landing page for this brand now carries the pixel.
        </div>
      )}

      <div id="brand-meta-pixel-help" className="form-text small">
        {brand.meta_pixel_id
          ? 'Tracking is on. Clear the field and save to turn it off.'
          : 'Not set, so this brand’s pages carry no ad tracking.'}
        {' '}Find it in Meta Events Manager under Data sources. Paste only the number.
      </div>
    </div>
  );
}
