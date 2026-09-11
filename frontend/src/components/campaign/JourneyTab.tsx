import React from 'react';
import OutreachJourneyFlow from '../admin/campaigns/journey/OutreachJourneyFlow';

/**
 * JourneyTab — the Campaign 360 Visitor Journey.
 *
 * Deliberately almost nothing. The Sankey, its cohort slicing, its path table, its palette and
 * its reduced-motion handling all live in OutreachJourneyFlow, which the Campaigns page has
 * used since it replaced the force graph. This tab passes it a campaign scope and stops.
 *
 * Building a second journey visualisation here would have produced two components that
 * disagree about what a journey is - the same lead counted differently on two screens - and
 * the plan names that outcome explicitly as the thing not to do. A test asserts this file
 * IMPORTS the existing component rather than reimplementing it, so the constraint outlives
 * whoever next opens this file.
 */

interface Props {
  campaignId: string;
}

export default function JourneyTab({ campaignId }: Props): React.ReactElement {
  return <OutreachJourneyFlow campaignId={campaignId} height={560} />;
}
