import React, { useState } from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import StatusBadge from '../../admin/shell/StatusBadge';
import { useGrowthJourneyData, statusOf } from '../useGrowthJourneyData';
import {
  getBrandRole,
  putBrandRole,
  type BrandRole,
  type BrandRoleResponse,
} from '../../../services/growthJourneyBrandRoleApi';

/**
 * What the growth agent is CALLED on this brand, and the one place it is set.
 *
 * Ali's framing, 2026-11-22: "for the Colaberry Training brand, Maya is an
 * Enrollment specialist, but for Colaberry Enterprise, she is a Business
 * Development Specialist. She will still have job of reaching out to new
 * accounts, but her role and job will change depending on the brand."
 *
 * ─── THE PANEL SAYS WHAT THIS DOES NOT DO, ON THE PAGE ──────────────────────
 *
 * It is display copy. Nothing reads the stored value to decide what an agent may
 * do or say, and no prompt builder imports the service behind it - a scan over
 * every Maya and agent file asserts that server-side. An operator editing a job
 * title has every reason to assume they are changing how an agent behaves, so
 * the panel tells them they are not. A capability nobody asked for is bad; a
 * capability somebody BELIEVES they have and does not is worse.
 *
 * ─── IT DOES NOT USE `ScopeState` ───────────────────────────────────────────
 *
 * The thirteen reads share one envelope with a nullable `data` and an optional
 * brand. This read has neither: the brand is mandatory, and its four outcomes
 * (`set`, `default`, `no_programme`, `ambiguous_programme`) are states of the
 * CONFIGURATION rather than of the scope. Forcing it through `ScopeState` would
 * have meant inventing a scope envelope the server does not send.
 *
 * A 403 is still the membership state, and it is said in the same words the
 * reads use, so an operator sees one explanation rather than two.
 */

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 280;

interface Props {
  brandId: string | null;
  brandName: string | null;
}

function RoleForm({
  brandId,
  role,
  onSaved,
}: {
  brandId: string;
  role: BrandRole;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(role.title);
  const [description, setDescription] = useState(role.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = title !== role.title || description !== role.description;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await putBrandRole(brandId, { title: title.trim(), description: description.trim() });
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      const status = statusOf(err as Error);
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as Error)?.message ??
        'Save failed';
      // 409 is not a failed save: the brand has no journey programme, so there
      // is nowhere to store a role. Said as the state it is.
      setError(status === 409 ? message : `Could not save: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-3">
        <label className="form-label small fw-medium" htmlFor="gj-role-title">
          Role title
        </label>
        <input
          id="gj-role-title"
          className="form-control form-control-sm"
          style={{ maxWidth: 420 }}
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="form-text">
          What this brand calls the agent. {TITLE_MAX} characters at most.
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label small fw-medium" htmlFor="gj-role-description">
          What the role does
        </label>
        <textarea
          id="gj-role-description"
          className="form-control form-control-sm"
          rows={3}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="form-text">
          One or two sentences. {DESCRIPTION_MAX} characters at most.
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small" role="alert">
          {error}
        </div>
      )}
      {saved && !dirty && (
        <div className="alert alert-success py-2 px-3 small" role="status">
          Saved. This changes what the page calls the agent, and nothing else.
        </div>
      )}

      <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !dirty}>
        {saving ? 'Saving…' : 'Save role'}
      </button>
      {!dirty && !saved && (
        <span className="text-muted small ms-2">No changes to save.</span>
      )}
    </form>
  );
}

export default function BrandRolePanel({ brandId, brandName }: Props) {
  /**
   * Typed `| null` rather than cast, because with no brand there is genuinely no
   * response.
   *
   * The hook is still called unconditionally - React requires that - but its
   * fetcher issues NO request when no brand is selected. The client's signature
   * demands a brand, so the alternative would have been casting a null into a
   * response shape, and a cast here is how a panel ends up reading fields off
   * nothing.
   */
  const role = useGrowthJourneyData<BrandRoleResponse | null>(
    () => (brandId ? getBrandRole(brandId) : Promise.resolve(null)),
    `brand-role:${brandId ?? 'none'}`
  );

  const label = brandName?.trim() || 'this brand';

  if (!brandId) {
    return (
      <SectionCard title="Brand setup" icon="user-settings-line">
        <div className="text-muted">
          <i className="ri-information-line me-1" aria-hidden="true" />
          Select a brand to see and set the agent&rsquo;s role for it. A role belongs to one
          brand, so there is nothing to show for the combined view.
        </div>
      </SectionCard>
    );
  }

  const forbidden = statusOf(role.error) === 403;

  return (
    <SectionCard
      title="Brand setup"
      icon="user-settings-line"
      subtitle={`What ${label} calls the growth agent, and what that role does.`}
    >
      <div className="alert alert-secondary py-2 px-3 small" role="note">
        <i className="ri-information-line me-1" aria-hidden="true" />
        <strong>This is display copy.</strong> It changes what this page and its tabs call the
        agent. It does not change what the agent says to anyone, which channels it may use, or
        what it is allowed to do.
      </div>

      {role.loading && (
        <div className="text-muted py-3" role="status" aria-live="polite">
          <div className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Loading…
        </div>
      )}

      {!role.loading && forbidden && (
        // The same words the thirteen reads use, so one explanation covers the page.
        <div className="alert alert-secondary d-flex align-items-start gap-2" role="status">
          <i className="ri-settings-3-line fs-5" aria-hidden="true" />
          <div>
            <div className="fw-semibold">
              Brand setup is unavailable: tenant memberships are not set up yet.
            </div>
            <div className="small mt-1">
              The role cannot be read or changed per brand until they are.
            </div>
          </div>
        </div>
      )}

      {!role.loading && role.error && !forbidden && (
        <div className="alert alert-danger small" role="alert">
          <div className="fw-semibold">This request failed: the role is unknown, not unset.</div>
          <div className="mt-1">{role.error.message}</div>
        </div>
      )}

      {!role.loading && !role.error && role.data && (
        <>
          {role.data.status === 'no_programme' && (
            <div className="alert alert-warning small" role="status">
              <div className="fw-semibold">{label} has no journey programme yet.</div>
              <div className="mt-1">
                A role is stored on the brand&rsquo;s programme, so there is nowhere to put one
                until that programme exists. Nothing is broken; this brand simply is not running
                a journey.
              </div>
            </div>
          )}

          {role.data.status === 'ambiguous_programme' && (
            <div className="alert alert-warning small" role="status">
              <div className="fw-semibold">{label} has more than one journey programme.</div>
              <div className="mt-1">
                None of them is set as the brand&rsquo;s default, so there is no single programme
                to store the role on. Setting a default resolves it.
              </div>
            </div>
          )}

          {role.data.role && (
            <>
              <div className="d-flex align-items-center gap-2 mb-3">
                {role.data.status === 'default' ? (
                  <StatusBadge label="default for this journey type" tone="neutral" />
                ) : (
                  <StatusBadge label="set for this brand" tone="success" />
                )}
                {role.data.role.updated_at && (
                  <span className="text-muted small">
                    last changed {role.data.role.updated_at.slice(0, 10)}
                  </span>
                )}
                {role.data.status === 'default' && (
                  // `updated_at: null` is how the server says nobody has chosen
                  // this. Saying so stops a default reading as a decision.
                  <span className="text-muted small">nobody has set this yet</span>
                )}
              </div>

              <RoleForm brandId={brandId} role={role.data.role} onSaved={role.reload} />
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}
