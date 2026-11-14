/**
 * The guided walkthrough of Our Services, in page order. Each step points at one `data-tour="<target>"` element on
 * AdminGovServicesPage. A step whose target is not on screen (for example the page is still loading) is skipped, so
 * the tour never points at nothing. Copy is plain English for an executive reader; no emoji or em dashes (house lint).
 */
export interface TourStep { target: string; title: string; body: string; icon: string }

export const OUR_SERVICES_TOUR: readonly TourStep[] = [
  {
    target: 'header', icon: 'ri-compass-3-line', title: 'What this page is for',
    body: 'This is the list of services we sell, and the proof behind each one. Proof means a case study: real work we delivered. The Gov Contracts AI reads the Active services here when it decides whether we can deliver a bid, so this page is what the AI believes about us.',
  },
  {
    target: 'kpis', icon: 'ri-dashboard-3-line', title: 'The six numbers at the top',
    body: 'Active services are the ones the Gov AI uses; Growth services are new and not used by the AI yet. "Services with no proof" counts both kinds that have no linked case study, split into active and growth. "Blocked case studies" are case studies not linked to any service yet, so they prove nothing until someone links them.',
  },
  {
    target: 'decide', icon: 'ri-flashlight-line', title: 'Decide now',
    body: 'The most urgent things to do, most urgent first. Click a card to jump to the section where you act on it.',
  },
  {
    target: 'lifecycle', icon: 'ri-route-line', title: 'How a case study becomes proof',
    body: 'A case study arrives (built here, or imported from the Drive library), gets linked to one or more services, and then counts as evidence. A Growth service becomes Active when it has at least one linked case study and someone clicks Promote.',
  },
  {
    target: 'charts', icon: 'ri-bar-chart-horizontal-line', title: 'Where the proof is strong or thin',
    body: 'Evidence by service lists the weakest services first. Where to invest next plots proof against open Gov opportunities: a service with lots of demand and little proof is where a new case study pays off most.',
  },
  {
    target: 'catalog', icon: 'ri-folder-open-line', title: 'The service catalog',
    body: 'One row per service, with its evidence score, inside and outside case-study counts, and how fresh the proof is. Open a row to see its case studies, and click any case-study title to read it in a side panel. Edit, Promote and Retire live here too.',
  },
  {
    target: 'heatmap', icon: 'ri-grid-line', title: 'Industry coverage',
    body: 'Which industries each service has proof in. An empty circle means we have no case study for that service in that industry yet.',
  },
  {
    target: 'intake', icon: 'ri-inbox-archive-line', title: 'Case study intake: where you link',
    body: 'Every unlinked case study waits here. Ticked boxes are the system\'s strong suggestions; nothing counts until you click Link. Inside case studies say "Link & publish" because linking also lets them be published. Outside whitepapers say "Link (internal only)" and are never published. Click a title to read the case study, including the original whitepaper, before you decide.',
  },
  {
    target: 'gaps', icon: 'ri-government-line', title: 'Gaps from live proposals',
    body: 'Capabilities the Gov AI marked Partly or New on live bids. Before treating one as a real gap, check Intake: we may already have unlinked proof for it.',
  },
];
