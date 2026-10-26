import React, { useState } from 'react';
import SectionCard from '../admin/shell/SectionCard';
import AsyncPanel from './AsyncPanel';
import { useExplorerData } from './useExplorerData';
import CampusActivityPanel from './CampusActivityPanel';
import OutreachList, { VIEWS, ViewToggle } from './OutreachList';
import { getCampusActivity, getOutreach, type OutreachView } from '../../services/explorerCampusApi';

/**
 * Campus & outreach (Explorer Growth, 2026-10-26): what explorers are doing on the campus, and who staff should talk to. Two reads,
 * each with its own loading, empty and failure states (AsyncPanel), so one slow query never blanks the other.
 */
export default function CampusTab() {
  const [view, setView] = useState<OutreachView>('reach_out');
  const activity = useExplorerData(getCampusActivity, 'campus');
  const outreach = useExplorerData(() => getOutreach(view, 25), `outreach:${view}`);
  const hint = VIEWS.find((v) => v.key === view)!.hint;
  return (
    <div className="d-flex flex-column gap-3">
      <AsyncPanel state={activity} onRetry={activity.reload}>
        {(a) => <CampusActivityPanel a={a} />}
      </AsyncPanel>
      <SectionCard title="Who to reach out to" icon="user-voice-line" subtitle={hint} actions={<ViewToggle view={view} onChange={setView} />}>
        <AsyncPanel state={outreach} onRetry={outreach.reload}>
          {(o) => <OutreachList rows={o.rows} view={o.view} />}
        </AsyncPanel>
      </SectionCard>
    </div>
  );
}
