import React, { useEffect, useState } from 'react';
import { StatusBadge } from '../../../../components/admin/shell';
import type { ContentVariant, ItemLink, ProviderKey, ProviderSummary, VariantProblem } from '../../../../services/contentComposerApi';

/**
 * Steps 5-7: per-platform variants, tracked links, validation - one card per provider.
 *
 * An edited variant is labelled as such and keeps a Revert button; regeneration never touches
 * it (the backend rule) and this card is where the operator sees that promise kept - or sees
 * "stale" when the canonical moved under their edit and decides for themselves.
 */

export interface ComposerVariantsProps {
  variants: ContentVariant[];
  providers: ProviderSummary[];
  links: ItemLink[];
  problems: Record<string, VariantProblem[]>;
  busy: boolean;
  onSave: (provider: ProviderKey, text: string) => void;
  onRevert: (provider: ProviderKey) => void;
}

function VariantCard({ variant, caps, link, problems, busy, onSave, onRevert }: {
  variant: ContentVariant; caps?: ProviderSummary; link?: ItemLink; problems: VariantProblem[]; busy: boolean;
  onSave: (text: string) => void; onRevert: () => void;
}) {
  const [text, setText] = useState(variant.body ?? '');
  useEffect(() => { setText(variant.body ?? ''); }, [variant.body]);
  const dirty = text !== (variant.body ?? '');
  const over = caps ? text.length - caps.maxChars : 0;
  const stale = Boolean(variant.metadata?.stale);

  return (
    <div className="border rounded p-3 mb-3" data-testid={`variant-${variant.provider}`}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <strong>{caps?.displayName ?? variant.provider}</strong>
        {caps && <StatusBadge label={caps.mode === 'direct' ? 'Direct publish' : 'Handoff required'} tone={caps.mode === 'direct' ? 'success' : 'warning'} />}
        <StatusBadge label={variant.is_manually_edited ? 'Edited by hand' : 'Generated'} tone={variant.is_manually_edited ? 'info' : 'neutral'} />
        {stale && <StatusBadge label="Stale - canonical changed" tone="warning" />}
        <span className={`small ms-auto ${over > 0 ? 'text-danger' : 'text-muted'}`}>
          {caps ? `${text.length.toLocaleString()} / ${caps.maxChars.toLocaleString()}` : `${text.length} chars`}
        </span>
      </div>
      <textarea
        className="form-control form-control-sm"
        rows={4}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        aria-label={`${caps?.displayName ?? variant.provider} copy`}
      />
      <div className="d-flex flex-wrap gap-2 mt-2 align-items-center">
        <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy || !dirty} onClick={() => onSave(text)}>Save edit</button>
        {variant.is_manually_edited && (
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={onRevert}>Revert to generated</button>
        )}
        {link && <span className="small text-muted">Link: <code>{link.shortUrl}</code></span>}
      </div>
      {problems.length > 0 && (
        <ul className="small mt-2 mb-0">
          {problems.map((p, i) => (
            <li key={`${p.field}-${i}`} className={p.severity === 'block' ? 'text-danger' : 'text-warning'}>{p.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ComposerVariants({ variants, providers, links, problems, busy, onSave, onRevert }: ComposerVariantsProps) {
  if (variants.length === 0) return <p className="text-muted mb-0">No variants yet. Pick channels and generate.</p>;
  return (
    <div>
      {variants.map((v) => (
        <VariantCard
          key={v.provider}
          variant={v}
          caps={providers.find((p) => p.provider === v.provider)}
          link={links.find((l) => l.provider === v.provider)}
          problems={problems[v.provider] ?? []}
          busy={busy}
          onSave={(text) => onSave(v.provider, text)}
          onRevert={() => onRevert(v.provider)}
        />
      ))}
    </div>
  );
}
