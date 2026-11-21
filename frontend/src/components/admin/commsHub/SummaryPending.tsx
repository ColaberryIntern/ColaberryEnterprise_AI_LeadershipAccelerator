import React from 'react';

interface Props {
  loadError: boolean;
}

/**
 * What a tab shows before the hub summary has loaded. It never claims emptiness: "nothing
 * scheduled" is only true once the server has said so. On a failure the layout's alert carries
 * the retry; this line only says the tab is waiting on it.
 */
export default function SummaryPending({ loadError }: Props): React.ReactElement {
  return (
    <p className="text-muted mb-0" role="status">
      {loadError ? 'This tab is unavailable until the summary loads. Use Try again above.' : 'Loading...'}
    </p>
  );
}
