import React from 'react';

/**
 * One outbound link on a project row, rendered as a chip so it reads as something to click.
 *
 * Returns null when there is no URL: a row without a Command Center shows nothing rather
 * than a disabled-looking icon, because a greyed chip invites a click that cannot work.
 */
function LinkChip({
  href, icon, label, accent = false,
}: { href: string | null; icon: string; label: string; accent?: boolean }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`${label} — ${href}`}
      aria-label={`Open the ${label}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        marginLeft: 6,
        borderRadius: 5,
        verticalAlign: 'text-bottom',
        border: '0.5px solid var(--border-subtle)',
        background: accent ? 'var(--status-info-bg, #eff6ff)' : 'var(--surface-sunken)',
        color: accent ? 'var(--status-info, #2f6fc8)' : 'var(--text-muted)',
        fontSize: 12,
        lineHeight: 1,
        textDecoration: 'none',
      }}
    >
      <i className={icon} aria-hidden="true" />
    </a>
  );
}

export default LinkChip;
