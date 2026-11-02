import { useState } from 'react';
import { setBrandSnackbarDefault, type Brand } from '../../../services/adminBrandApi';

/**
 * The snack bar switch for one brand — the recent-signup notifications its hosted landing pages
 * show.
 *
 * WHY THIS EXISTS. The snack bar was built, tested and deployed, and showed on nothing. The
 * renderer injects it, the feed serves it, and both are gated on `brands.snackbar_default_enabled`,
 * which shipped `false` with no screen anywhere that could set it. Ali asked (2026-11-02) for the
 * snack bar to be on every landing page built from then on; the column default now does that for
 * new brands, and this switch is how an existing brand is turned on — and, more to the point, how
 * one can be turned off again without a developer and a SQL prompt.
 *
 * IT SAVES ON TOGGLE, with no Save button. A single boolean does not need a confirm step, and an
 * unsaved switch that looks switched is worse than a brief spinner. A failed save puts the switch
 * back where it was and says so, because a control that silently keeps a value the server refused
 * is how an operator comes to believe the snack bar is on when it is not.
 */

export function BrandSnackbarField({
  brand,
  onSaved,
}: {
  brand: Brand;
  onSaved: (updated: Brand) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = brand.snackbar_default_enabled;

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const updated = await setBrandSnackbarDefault(brand.id, next);
      onSaved(updated);
    } catch (e) {
      const detail = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(detail ?? 'Could not save. The snack bar setting is unchanged.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="form-check form-switch">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          id="brand-snackbar-default"
          checked={enabled}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
          aria-describedby="brand-snackbar-help"
        />
        <label className="form-check-label small" htmlFor="brand-snackbar-default">
          <span className="fw-semibold">Activity snack bar</span>
          {saving && <span className="text-muted ms-2">Saving…</span>}
        </label>
      </div>

      {error && <div className="text-danger small mt-1">{error}</div>}

      <div id="brand-snackbar-help" className="form-text small">
        {enabled
          ? 'On. Every published landing page for this brand shows recent sign-ups, unless that page turns it off.'
          : 'Off, so this brand’s landing pages show no activity notifications.'}
        {' '}It only ever shows real sign-ups from the last 72 hours — a brand with none shows
        nothing, which is not a fault.
      </div>
    </div>
  );
}
