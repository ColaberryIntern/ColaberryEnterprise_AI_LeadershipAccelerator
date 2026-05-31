// Launch PMO team roster - source of truth for who's on the
// AI Systems Architect Accelerator launch (Basecamp project 47502609).
//
// Each entry: { handle, displayName, basecampPersonId, email, role, hats }
//   handle: short slug CB uses internally (e.g., "kes")
//   basecampPersonId: integer ID from Basecamp account 3945211. Null if not
//     yet provisioned on the account; CB will skip assignment and surface as
//     an action for Ali.
//
// Missing as of 2026-05-31:
//   - Roselen (Sales/Admissions) - Ali to provision on Basecamp
//     [BLOCKER for Sales/Admissions area tasks]
// Resolved 2026-05-31:
//   - Dhee = Dheeraj Garg (dhee@colaberry.com, BC id 34920126)

const TEAM = [
  {
    handle: 'ali',
    displayName: 'Ali Muwwakkil',
    basecampPersonId: 17454835,
    email: 'ali@colaberry.com',
    role: 'Executive Sponsor',
    hats: ['Final approval', 'Design approval', 'Strategic decisions', 'Escalations'],
  },
  {
    handle: 'kes',
    displayName: 'Kes Delele',
    basecampPersonId: 52330127,
    email: 'kes@colaberry.com',
    role: 'AI Systems Architect',
    hats: ['enterprise.colaberry.ai', 'Student platform', 'Operations platform', 'AI agent infrastructure', 'Voice AI', 'Inbox AI', 'CRM integrations', 'GHL workflows', 'Student tracking', 'Reporting systems'],
  },
  {
    handle: 'sohail',
    displayName: 'Sohail Syed',
    basecampPersonId: 47335940,
    email: 'sohail@colaberry.com',
    role: 'Marketing Lead',
    hats: ['Marketing strategy', 'Ads', 'Landing pages', 'Campaigns', 'A/B testing', 'Content distribution', 'Lead generation'],
  },
  {
    handle: 'swati',
    displayName: 'Swati Raman',
    basecampPersonId: 48041031,
    email: 'swatiraman1511@gmail.com',
    role: 'Curriculum + Compliance',
    hats: ['Curriculum review', 'Documentation', 'TWC registration', 'Compliance', 'Approval workflows'],
  },
  {
    handle: 'aleem',
    displayName: 'Aleem',
    basecampPersonId: 47335967,
    email: 'aleem@colaberry.com',
    role: 'Creative Director',
    hats: ['Design approval', 'Viral videos', 'Brand visuals', 'UI reviews', 'Marketing creative'],
  },
  {
    handle: 'tejesh',
    displayName: 'Sai Tejesh',
    basecampPersonId: 50567410,
    email: 'saitejesh@colaberry.com',
    role: 'Website Lead (training.colaberry.com)',
    hats: ['training.colaberry.com', 'Website migration', 'Website redesign', 'Marketing pages', 'SEO'],
  },
  {
    handle: 'jackie',
    displayName: 'Jackie Chalk',
    basecampPersonId: 37184021,
    email: 'jackie@colaberry.com',
    role: 'Community Manager',
    hats: ['Events', 'WhatsApp', 'Eventbrite', 'Open Houses', 'Community engagement', 'Alumni communication'],
  },
  {
    handle: 'roselen',
    displayName: 'Roselen',
    basecampPersonId: null,
    email: null,
    role: 'Admissions & Sales',
    hats: ['Enrollment', 'Sales calls', 'Lead follow-up', 'Human sales intervention', 'Sales material'],
    note: 'Not yet on Basecamp account 3945211 (or under a different name). Ali to confirm; CB will surface unassigned tasks until provisioned.',
  },
  {
    handle: 'taiwo',
    displayName: 'Taiwo Oludimimu',
    basecampPersonId: 33623344,
    email: 'taiwo@colaberry.com',
    role: 'Admissions Operations',
    hats: ['Enrollment monitoring', 'Retention', 'Reporting', 'Subscription growth', 'Student lifecycle'],
  },
  {
    handle: 'dhee',
    displayName: 'Dheeraj Garg',
    basecampPersonId: 34920126,
    email: 'dhee@colaberry.com',
    role: 'Operations Assistant (Ali, India)',
    hats: ['Documentation', 'Research', 'Administrative work', 'Manual execution tasks'],
  },
  {
    handle: 'cb',
    displayName: 'CB System',
    basecampPersonId: 37708014,
    email: 'vishnu@colaberry.com',
    role: 'AI Execution Queue (CB User)',
    hats: ['Every AI-tier task goes here', 'Generates artifacts', 'Posts updates', 'Manages dependencies', 'Surfaces human approval queues'],
  },
];

function getByHandle(h) { return TEAM.find((t) => t.handle === h) || null; }
function getByPersonId(id) { return TEAM.find((t) => t.basecampPersonId === id) || null; }
function getByName(name) { return TEAM.find((t) => t.displayName.toLowerCase() === (name || '').toLowerCase()) || null; }
function provisioned() { return TEAM.filter((t) => t.basecampPersonId); }
function missing() { return TEAM.filter((t) => !t.basecampPersonId); }

const LAUNCH = {
  projectId: 47502609,
  projectName: 'AI Systems Architect Accelerator',
  targetLaunchDate: '2026-07-11',
  basecampAccountId: '3945211',
  trackingTodoUrl: 'https://3.basecamp.com/3945211/buckets/7463955/todos/9945833396',
  systemPromptCommentId: 9946342528,
};

module.exports = { TEAM, LAUNCH, getByHandle, getByPersonId, getByName, provisioned, missing };
