import React from 'react';

/**
 * DeliveryShell — the chrome both halves of the Refactored Delivery OS share.
 *
 * Master plan §Gate 10: *client UI is not builder UI*. They share a skeleton — top bar,
 * left rail, content pane — and nothing else. The rail's destinations are supplied by the
 * caller, so the client room cannot accidentally render a builder destination by passing
 * the wrong flag: there is no flag. Each half owns its own section list.
 *
 * This component is presentational and holds no delivery data. That matters more than it
 * looks: a shell that fetched a project would be one component away from the client half
 * fetching a builder-shaped payload, and the whole safety property of Gate 10 is that the
 * client is served a *different object* by the server rather than a filtered one.
 */

export interface DeliverySection {
  key: string;
  label: string;
  /** One line, in the audience's language. Rendered under the page title. */
  purpose: string;
}

export interface DeliveryShellProps {
  /** Cosmetic only — a label, never a permission. */
  audienceLabel: string;
  audienceTone: 'client' | 'builder';
  projectName: string;
  engagementName: string;
  personName: string;
  personRole: string;
  sections: readonly DeliverySection[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Extra chip beside the audience label, e.g. the builder's current mode. */
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const DeliveryShell: React.FC<DeliveryShellProps> = ({
  audienceLabel,
  audienceTone,
  projectName,
  engagementName,
  personName,
  personRole,
  sections,
  activeKey,
  onSelect,
  badge,
  children,
}) => {
  const active = sections.find((s) => s.key === activeKey) ?? sections[0];

  return (
    <div className="container-fluid px-0">
      <div className="card border-0 shadow-sm overflow-hidden">
        {/* Top bar */}
        <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white flex-wrap">
          <div
            className="rounded d-grid text-white fw-bold"
            style={{
              width: 26,
              height: 26,
              placeItems: 'center',
              fontSize: '.8rem',
              background: 'var(--color-primary)',
            }}
            aria-hidden="true"
          >
            C
          </div>
          <div className="fw-semibold">
            {engagementName} <span className="text-muted fw-normal">/ {projectName}</span>
          </div>
          <span
            className={`badge ${audienceTone === 'client' ? 'text-bg-info' : 'text-bg-primary'}`}
          >
            {audienceLabel}
          </span>
          {badge}
          <div className="ms-auto d-flex align-items-center gap-2 small text-muted">
            <span>
              {personName} · {personRole}
            </span>
            <span
              className="rounded-circle border d-grid bg-light text-dark fw-bold"
              style={{ width: 26, height: 26, placeItems: 'center', fontSize: '.7rem' }}
              aria-hidden="true"
            >
              {initials(personName)}
            </span>
          </div>
        </div>

        <div className="row g-0">
          {/* Left rail */}
          <nav
            className="col-12 col-lg-2 border-end bg-white p-2"
            aria-label={`${audienceLabel} sections`}
          >
            <div className="d-flex d-lg-block gap-1 overflow-auto">
              {sections.map((section) => {
                const isActive = section.key === active?.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => onSelect(section.key)}
                    aria-current={isActive ? 'true' : 'false'}
                    className={`btn btn-sm text-start w-100 border-0 mb-1 text-nowrap ${
                      isActive ? 'fw-bold' : 'text-body'
                    }`}
                    style={
                      isActive
                        ? { background: 'var(--cherry-bg)', color: 'var(--cherry-deep)' }
                        : undefined
                    }
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <main className="col-12 col-lg-10 p-3 p-lg-4 bg-light">
            <div className="mb-3">
              <h2 className="h5 mb-1">{active?.label}</h2>
              <p className="text-muted small mb-0">{active?.purpose}</p>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default DeliveryShell;
