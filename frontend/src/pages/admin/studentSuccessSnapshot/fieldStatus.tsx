import React from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import { Tone } from '../../../components/admin/shell/StatusBadge';
import { FieldStatus, SnapshotField } from '../../../services/studentSuccessSnapshotApi';

// One tone/label/honest-message per status — never presents a non-'known'
// field as if it were real data (matches the backend envelope's own honesty
// contract: 'unknown' means the source couldn't be read, 'not_applicable'
// means no backing source exists yet, neither is a fabricated zero).
export const STATUS_TONE: Record<FieldStatus, Tone> = {
  known: 'success',
  unknown: 'neutral',
  not_applicable: 'neutral',
  stale: 'warning',
  quarantined: 'danger',
  conflicting: 'warning',
};

export const STATUS_LABEL: Record<FieldStatus, string> = {
  known: 'Known',
  unknown: 'Unknown',
  not_applicable: 'Not applicable',
  stale: 'Stale',
  quarantined: 'Quarantined',
  conflicting: 'Conflicting',
};

const STATUS_MESSAGE: Record<FieldStatus, string> = {
  known: '',
  unknown: 'No data available for this category yet.',
  not_applicable: 'No backing source exists for this category yet.',
  stale: 'This data is stale and excluded from decisions.',
  quarantined: 'This metric is currently quarantined and excluded from decisions.',
  conflicting: 'Sources disagree on this value.',
};

function observedLabel(observedAt: string | null): string {
  if (!observedAt) return '';
  const d = new Date(observedAt);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface Props<T> {
  title: string;
  icon: string;
  field: SnapshotField<T>;
  renderKnown: (value: T) => React.ReactNode;
}

// The one repeated shell across all 15 categories: a status badge, an honest
// non-known message (with the real reliabilityReason, never invented), and
// the category's own real-value rendering only when status is genuinely 'known'.
export default function CategorySection<T>({ title, icon, field, renderKnown }: Props<T>) {
  const observed = observedLabel(field.observedAt);
  return (
    <SectionCard
      title={title}
      icon={icon}
      actions={<StatusBadge label={STATUS_LABEL[field.status]} tone={STATUS_TONE[field.status]} />}
    >
      {field.status === 'known' && field.value !== null ? (
        renderKnown(field.value)
      ) : (
        <div className="text-muted small">
          {STATUS_MESSAGE[field.status]}
          {field.reliabilityReason && <div className="mt-1 fst-italic">{field.reliabilityReason}</div>}
        </div>
      )}
      {observed && <div className="text-muted mt-2" style={{ fontSize: '0.72rem' }}>Observed {observed}</div>}
    </SectionCard>
  );
}
