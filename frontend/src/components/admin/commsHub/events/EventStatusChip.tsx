import React from 'react';
import type { HubEventStatus } from '../../../../services/commsHubApi';
import { STATUS_META } from './eventDisplay';

interface Props {
  status: HubEventStatus;
}

/** The event's status in words with an icon (CH3.1). Colour only reinforces; it never carries the meaning alone. */
export default function EventStatusChip({ status }: Props): React.ReactElement {
  const meta = STATUS_META[status];
  return (
    <span className={`ch-status ch-status-${meta.tone}`} data-status={status}>
      <i className={`ri-${meta.icon}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
