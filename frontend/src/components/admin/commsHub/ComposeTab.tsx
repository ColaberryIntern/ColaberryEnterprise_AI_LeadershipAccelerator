import React from 'react';
import { SectionCard, EmptyState } from '../shell';

/** Compose (design 03). CH6.5 replaces the empty state with the three-step composer. */
export default function ComposeTab(): React.ReactElement {
  return (
    <SectionCard title="Compose" icon="quill-pen-line">
      <EmptyState
        icon="draft-line"
        title="Start a message"
        description="Start from an event or a subject. AI drafts it for the community feed and in-app notifications, and you approve the exact text, recipients and time."
        tone="quiet"
      />
    </SectionCard>
  );
}
