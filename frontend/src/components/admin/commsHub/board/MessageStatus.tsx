import React from 'react';
import type { HubMessageStatus } from '../../../../services/commsHubApi';
import { MESSAGE_STATUS } from './boardDisplay';

/** A message's status in words with an icon (CH7.4). Colour only reinforces; it never carries the meaning alone. */
export default function MessageStatus({ status }: { status: HubMessageStatus }): React.ReactElement {
  const meta = MESSAGE_STATUS[status];
  return (
    <span className={`ch-status ch-status-${meta.tone}`} data-status={status}>
      <i className={`ri-${meta.icon}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
