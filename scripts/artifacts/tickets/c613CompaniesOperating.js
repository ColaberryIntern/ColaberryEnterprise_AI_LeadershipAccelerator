/**
 * C6.13 - the five operating-economy targets: manufacturing, healthcare operations and
 * utilities.
 *
 * The companion to c613CompaniesFinancial, split out of c613Data.js at CLAUDE.md's
 * 500-line ceiling. These five are the harder half to evidence and the file shows it.
 * Two are private or PE-held, so headcount comes from aggregators that disagree by up
 * to 3x rather than from a 10-K. Two of the commitments are VENDOR press releases,
 * flagged as such, because the vendor is the only party that published anything.
 *
 * That asymmetry is itself a finding. The SEC registrants in the financial file state
 * their AI intent to the market in their own words; these companies' intent is mostly
 * visible only through whoever sold them something.
 *
 * Field contract is identical to c613CompaniesFinancial and enforced by c613Criteria.
 */
const { OBSERVED } = require('./c613Constants');

const OPERATING = [
  {
    rank: 6,
    name: 'Tennant Company',
    sector: 'Manufacturing',
    domain: 'tennantco.com',
    ceo: { name: 'Dave Huml', title: 'President & CEO',
      email: 'dave.huml@tennantco.com', apolloId: '60dae35123f12e0001dadb5b',
      emailStatus: 'verified' },
    leadId: 25374,
    employees: {
      count: '4,484', asOf: '2025-12-31', sourceType: 'SEC filing',
      quote: 'As of December 31, 2025, we had 4,484 employees worldwide, of which '
        + 'approximately 40.4% are located in the U.S.',
      url: 'https://www.sec.gov/Archives/edgar/data/97134/000009713426000008/tnc-20251231.htm',
    },
    commitment: {
      quote: 'This evolution strengthens our ability to deliver differentiated, AI-enabled '
        + 'solutions that solve real customer problems and create long-term value.',
      who: 'Dave Huml', whoTitle: 'President and CEO',
      date: '2026-04-14', sourceType: 'company press release',
      source: 'Tennant / Brain Corp announcement',
      url: 'https://www.braincorp.com/resources/tennant-company-and-brain-corp-agree-to-'
        + 'accelerate-robotic-cleaning-innovation-advancing-tennants-transformation-into-a-'
        + 'robotics-and-technology-leader',
    },
    req: {
      verdict: 'YES',
      title: 'Enterprise AI and Analytics Leader',
      location: 'Eden Prairie, MN',
      displayedDate: 'site showed 2026-10-27 (today) on the search list and no date on the '
        + 'detail page - the date is refreshed, treat it as unusable',
      url: 'https://jobs.tennantco.com/job/Eden-Prairie-Enterprise-AI-and-Analytics-Leader-'
        + 'MN-55347/1434488700/',
      coverage: '49 open reqs swept; the only strong title match',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Full 10-K executive officer list carries no AI title. Adjacency worth '
          + 'noting: Patrick W. Schottler, SVP Robotics.',
      },
      ld: {
        verdict: 'DISQUALIFIED',
        detail: 'Talent Acquisition Center of Excellence (a TA Manager at $97.5k-$150.6k '
          + 'leading three specialist seats) AND a staffed Talent Development organization: '
          + 'Senior Manager Talent Development, Principal Talent Development Specialist, '
          + 'Learning & Development Specialist, Technical Training Specialist (explicitly '
          + 'employee-facing), Learning Business Partner embedded in NA Service, Senior '
          + 'Talent Management Coordinator. The FY2025 10-K adds competency frameworks and '
          + 'annual succession planning.',
        overturns: 'An earlier check passed Tennant after finding no corporate university '
          + 'and no dedicated CHRO. Both observations were correct and both were the wrong '
          + 'test - the disqualifier is a formal internal training organization, and the '
          + 'absence of a branded academy is not the absence of one.',
      },
      capability: {
        verdict: 'PASSES',
        detail: 'Staffed but narrow. The Talent Development team owns competency '
          + 'frameworks, succession planning, and technical and product training for a '
          + 'cleaning-equipment field force. There is no learning platform, no '
          + 'curriculum ownership beyond product and safety, and no capability building '
          + 'for knowledge workers - which is why the Enterprise AI and Analytics '
          + 'Leader seat is being hired rather than grown.',
        overturnedBy: 'The refined disqualifier settled on 2026-10-28. Under the '
          + 'ticket’s literal wording Tennant was disqualified; the L&D finding '
          + 'above is unchanged and still true.',
        watch: 'The closest call on the list. Tennant has the staff and the budget line '
          + 'to build an AI program and no AI content in it today. The refined test '
          + 'reads that as a buying habit; the literal test read it as a build '
          + 'capability. If Tennant declines with "we will do this internally", that is '
          + 'the evidence the literal reading was right.',
      },
    },
    note: 'Tennant builds AI and robotics products, so it competes for the same engineers as '
      + 'big tech while paying Eden Prairie industrial rates. It is hiring for exactly the '
      + 'seat the thesis says it cannot fill.',
  },
  {
    rank: 7,
    name: 'Smile Brands',
    sector: 'Healthcare Operations',
    domain: 'smilebrands.com',
    ceo: { name: 'Steve Bilt', title: 'Co-Founder & Chief Executive Officer',
      email: 'steve.bilt@smilebrands.com', apolloId: '686e3571971cab0001b79231',
      emailStatus: 'verified' },
    leadId: 25375,
    employees: {
      count: '3,056 to 10,000', asOf: OBSERVED, sourceType: 'aggregator - no company figure',
      quote: null,
      url: 'https://www.zoominfo.com/c/smile-brands/346944529',
      caveat: 'No company-published headcount exists. LinkedIn says 3,056; ZoomInfo and '
        + 'Indeed both say 5,001-10,000. In range on every estimate, but unconfirmed.',
    },
    commitment: {
      quote: 'What really set Pearl apart for us was their partner-first approach, their '
        + 'forward-thinking vision for technology, and how easy the platform was to use',
      who: 'Steve Bilt', whoTitle: 'Chief Executive Officer',
      date: '2026-06-15', sourceType: 'vendor press release',
      source: 'Pearl, "Smile Brands Begins Rollout of Pearl for Dental AI" - initial '
        + 'radiographic AI pilot complete, rollout begun, full deployment across 600 '
        + 'locations targeted "in the coming months"',
      url: 'https://hellopearl.com/news/smile-brands-begins-rollout-of-pearl-for-dental-ai-'
        + 'to-advance-its-mission-of-consistent-high-quality-dental-care',
      caveat: 'Published by the vendor, not by Smile Brands. Vendors overstate a customer’s '
        + 'commitment as a matter of course, so the rollout scope is the vendor’s '
        + 'characterization. The quote itself was re-pulled in full from the source on '
        + OBSERVED + ' after an earlier retrieval truncated it mid-sentence.',
    },
    req: {
      verdict: 'NO',
      coverage: 'All 498 open postings enumerated from the company’s own public jobs feed '
        + '(5 pages, 498 unique req ids, matching the API’s own totalCount). 56 distinct '
        + 'titles, every one clinical or front-office. Not one title contains "data", '
        + '"analytics", "analyst" or "intelligence".',
      control: 'Patient Care Coordinator, req 39974, Riverside CA (HTTP 200, server-rendered '
        + 'title); an expired req returns HTTP 410, proving live and dead are distinguished',
      controlUrl: 'https://careers.smilebrands.com/jobs/39974',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: '11 executives listed and there is no CIO, no CTO and no AI title at all. '
          + 'A targeted search for chief AI officer / head of AI returned nothing.',
      },
      ld: {
        verdict: 'UNRESOLVED',
        detail: 'Talent acquisition is unambiguous - nine named recruiting leaders on the '
          + 'company’s own site. L&D will not resolve. "Smile University" exists by name '
          + 'and advertises leadership coaching, business training and personal skills '
          + 'development alongside clinical courses, which sounds like employee '
          + 'development; but the SMILE U trademark scopes it to "continuing dental '
          + 'education courses", every named program is dentist-facing, there is no Chief '
          + 'Learning Officer, no learning language in the CHRO’s bio, and the only L&D '
          + 'Manager found is a role that ended in 2020.',
        whatWouldSettleIt: 'One LinkedIn people-search on Smile Brands filtered to '
          + 'learning / training / instructional-design titles. LinkedIn was unreachable '
          + 'from the research environment.',
      },
      capability: {
        verdict: 'PASSES',
        detail: 'The refinement resolves what the literal test could not. The SMILE U '
          + 'trademark scopes Smile University to continuing dental education and every '
          + 'named program is dentist-facing; on the most expansive reading available it '
          + 'is clinical CE plus leadership coaching. Neither is enterprise technical '
          + 'capability building, so the verdict is the same whichever way the open '
          + 'question lands.',
        residualRisk: 'The underlying L&D-function question is still unresolved - it is '
          + 'simply no longer decision-relevant. One LinkedIn people-search would close '
          + 'it, and should be run before Smile Brands is approached rather than before '
          + 'it is listed.',
      },
    },
  },
  {
    rank: 8,
    name: 'GRAND Mental Health',
    sector: 'Healthcare Operations',
    domain: 'grandmh.com',
    ceo: { name: 'Josh Cantwell', title: 'President and Chief Executive Officer',
      email: 'jcantwell@grandmh.com', apolloId: '64c4231b2ad1ab0001013390',
      emailStatus: 'verified' },
    leadId: 25376,
    employees: {
      count: 'more than 1,700', asOf: 'undated', sourceType: 'company bio',
      quote: 'more than 1,700 staff across 27 clinics and centers in 13 Oklahoma counties',
      url: 'https://grandmh.com/',
      caveat: 'The company bio carries no date. A healthcare directory lists 1,847.',
    },
    commitment: {
      quote: 'Eleos has the unique ability to turn those challenges into something actionable.',
      who: 'Josh Cantwell', whoTitle: 'President and Chief Executive Officer',
      date: '2026-04-22', sourceType: 'vendor press release',
      source: 'Eleos Health, "Eleos Expands AI Agents Across the Full Care Journey"',
      url: 'https://eleos.health/press-releases/eleos-expands-ai-agents-across-the-full-care-journey/',
      caveat: 'Vendor-published. The adjacent Cantwell line - "The pressures on community '
        + 'care organizations aren’t easing" - is the more quotable one and says more '
        + 'about why he bought than what he bought.',
    },
    req: {
      verdict: 'NO',
      coverage: 'All 183 open requisitions retrieved (183 of 183, 48 distinct titles) from '
        + 'the UKG Ready board API. The board is a JavaScript SPA returning only the words '
        + '"Career Search" to a plain fetch, so it had to be rendered first to find the API. '
        + 'Zero qualifying titles; all clinical, nursing, crisis, facilities, finance, admin.',
      control: 'Behavioral Health Coach, Bartlesville OK (HTTP 200, title and location render)',
      controlUrl: 'https://secure7.saashr.com/ta/6206400.careers?ApplyToJob=638051294',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: '11 executives checked including Rony Gadiwalla, Chief Information Officer. '
          + 'No AI, data, analytics or digital title anywhere.',
      },
      ld: {
        verdict: 'PASSES',
        detail: 'Borderline but it clears. A Learning and Development department exists by '
          + 'name, staffed by one $23/hr Learning Specialist doing onboarding and event '
          + 'coordination, with no current executive owner - the leadership page lists no '
          + 'CHRO and no Director of Learning. The careers and culture pages say nothing '
          + 'about training, development or tuition assistance.',
        settled: 'The "Skills Development Professional" roles that looked like an L&D '
          + 'function are not one. In Oklahoma behavioral health, skills development is a '
          + 'Medicaid-billable CLIENT service - OHCA defines it as curriculum-based '
          + 'education and skills training delivered to build the client’s ability to '
          + 'live independently. Patient-facing, so it does not count.',
        residualRisk: 'An older page listed Chancey Bosch as Director of Learning under '
          + 'Cantwell when he was COO, so it predates 2022. If that seat still exists '
          + 'below the executive tier, this flips. GRAND publishes no org chart below the '
          + 'senior leadership team.',
      },
      capability: {
        verdict: 'PASSES',
        detail: 'One $23/hr Learning Specialist running onboarding and event '
          + 'coordination, with no executive owner above the seat. Nothing there could '
          + 'stand up a technical capability program, and the refined test clears it '
          + 'more cleanly than the literal one did.',
      },
    },
  },
  {
    rank: 9,
    name: 'Lindsay Corporation',
    sector: 'Manufacturing',
    domain: 'lindsay.com',
    ceo: { name: 'Randy Wood', title: 'President, CEO & Board of Directors',
      email: 'randy.wood@lindsay.com', apolloId: '63e034924b7ca20001a9e62a',
      emailStatus: 'verified' },
    leadId: 25377,
    employees: {
      count: '1,083', asOf: '2026-08-31', sourceType: 'SEC filing',
      quote: 'The Company and its wholly-owned subsidiaries have 1,083 employees as of '
        + 'August 31, 2026.',
      url: 'https://www.sec.gov/Archives/edgar/data/0000836157/000119312526428926/'
        + 'lnn-20260831.htm',
    },
    commitment: {
      quote: 'AI, again, very early innings, I think, in terms of how it applies to our '
        + 'equipment',
      who: 'Randy Wood', whoTitle: 'President and CEO',
      date: '2026-07-02', sourceType: 'earnings call transcript',
      source: 'Q3 FY2026 earnings call. Also, same call: "With FieldNET Advisor '
        + 'specifically, we’ve really been deploying a lot of AI models to help with '
        + 'irrigation scheduling" and "leveraging tools like AI to change how we work".',
      url: 'https://www.investing.com/news/transcripts/earnings-call-transcript-lindsay-'
        + 'tops-profit-view-in-q3-2026-as-stock-rises-93CH-4773568',
      caveat: '2026-07-02 is the transcript publication date; the page does not state the '
        + 'call date itself.',
    },
    req: {
      verdict: 'NO',
      coverage: 'All 46 of 46 reqs extracted from the SuccessFactors board. No AI, ML or '
        + 'data titles, and no generic Data Analyst either. A university newsroom page '
        + 'claiming a Lindsay data science intern was run down and rejected: no such req '
        + 'exists on the live board, and the page could not be dated (rejected TLS '
        + 'certificate, not bypassed).',
      control: 'Senior Engineer, Firmware, Omaha NE, site-displayed date 2026-10-20 (HTTP 200)',
      controlUrl: 'https://careers.lindsay.com/job/Omaha-Senior-Engineer%2C-Firmware-NE-68022/'
        + '1432044100/',
    },
    disq: {
      aiLeader: {
        verdict: 'WATCH',
        detail: 'No dedicated AI leader, but Melissa G. Moreno, SVP and Chief Information '
          + 'Officer, has a scope described by a third-party profile as including '
          + '"cybersecurity, infrastructure, analytics, artificial intelligence, and '
          + 'enterprise applications". That is a CIO with AI in her remit, not a dedicated '
          + 'AI leader, and it is the weakest disqualifier call on the list.',
      },
      ld: {
        verdict: 'PASSES',
        detail: 'Talent acquisition exists and is named on Lindsay’s own careers site '
          + '("the Talent Acquisition and HR Operations teams"). L&D does not. The FY2025 '
          + '10-K mentions development once, generically - "competitive wages, benefits '
          + 'and training and development programs" - and the only structured training '
          + 'named anywhere is safety, as one of eight elements of the Lindsay Safety '
          + 'System. No corporate university, no leadership-development program, and no '
          + 'L&D, training or instructional-design role open anywhere on the careers site.',
      },
      capability: {
        verdict: 'PASSES',
        detail: 'Safety training inside the Lindsay Safety System and nothing else. No '
          + 'platform, no curriculum, no staff, and no open seat that would start one.',
      },
    },
    note: '"Very early innings" is the best opening line on the list. The chief executive is '
      + 'already on record saying the capability is immature - there is nothing to argue him '
      + 'out of.',
  },
  {
    rank: 10,
    name: 'Avista Corporation',
    sector: 'Utilities',
    domain: 'avistacorp.com',
    ceo: { name: 'Heather Rosentrater', title: 'President and CEO',
      email: 'heather.rosentrater@avistacorp.com', apolloId: '66f6e2756ff7440001af4a3c',
      emailStatus: 'verified' },
    leadId: 25378,
    employees: {
      count: '1,929', asOf: '2025-12-31', sourceType: 'SEC filing',
      quote: 'On December 31, 2025, Avista Utilities employed 1,929 individuals',
      url: 'https://www.sec.gov/Archives/edgar/data/104918/000119312526067872/ava-20251231.htm',
      caveat: 'This is the utility subsidiary count, not necessarily consolidated Avista Corp.',
    },
    commitment: {
      quote: 'AI literacy is essential',
      who: 'Avista Corporation', whoTitle: 'FY2025 Form 10-K risk disclosure',
      date: '2026-02-25', sourceType: 'SEC filing',
      source: 'FY2025 Form 10-K. The same disclosure states that not advancing the '
        + 'understanding and use of AI may compromise the operational and financial '
        + 'progress of the Company. The 2025 Annual Report strategic letter adds: "From '
        + 'applying artificial intelligence advancements, drones, and automation to identify '
        + 'efficiencies and enhancements, we are supporting customer resilience, '
        + 'affordability, and sustainability."',
      url: 'https://www.sec.gov/Archives/edgar/data/104918/000119312526067872/ava-20251231.htm',
      caveat: 'This is a risk-factor disclosure, not a commitment - there is no target, no '
        + 'budget and no scope. It is listed here because for THIS offer that is the stronger '
        + 'artifact: the company has told its regulator, in writing, that it needs the exact '
        + 'capability we sell. It should never be described to Ali or to Avista as a '
        + 'commitment.',
    },
    req: {
      verdict: 'NO',
      coverage: 'All 8 of 8 open reqs retrieved from the UKG board API (the HTML page serves '
        + 'an unsupported-browser notice to a plain fetch). Zero AI, ML or data titles. '
        + 'Caveat: 8 reqs is a thin board for a ~1,900-employee utility; the company’s own '
        + 'careers FAQ notes engineering student recruiting concentrates in December and '
        + 'January, so this may be a seasonal trough.',
      control: 'Sr Load Forecaster-Economist, req SRLOA005878, Spokane WA, site-displayed '
        + 'date 2026-10-09 (HTTP 200, title confirmed in rendered HTML)',
      controlUrl: 'https://recruiting2.ultipro.com/AVI1000AMAST/JobBoard/'
        + '362abf68-95c3-4b17-a39d-76a6efe5ff18/OpportunityDetail'
        + '?opportunityId=aaf7237a-ca93-49dc-a8de-ad92176e56d8',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Technology leadership is Alexis Alexander, VP, Chief Information Officer / '
          + 'Chief Security Officer (effective 2025-10-01) and Wayne Manuel, SVP Operations '
          + 'and Technology. No AI title. An EDGAR full-text sweep of every Avista filing '
          + 'returned zero hits on eleven disqualifying titles.',
      },
      ld: {
        verdict: 'DISQUALIFIED',
        detail: 'A recruiter seat plus a real learning organization. The FY2025 10-K names '
          + '"craft apprenticeship programs, engineering development programs, leadership '
          + 'development", delivered through "instructor-led courses, self-service topics, '
          + 'computer-based learning modules". Behind that: the Jack Stewart Training '
          + 'Center in Spokane, a Craft Training Program Manager at $77.6k-$141k under '
          + 'requisition LEARN005856, a Corporate Learning and Development Coordinator '
          + 'requiring 5+ years of instructional design, an Aspiring Leaders Program, and '
          + '11 apprenticeship programs of 2-4 years each.',
        settled: 'This is employee development, not a trade school that happens to feed '
          + 'the company: apprentices are selected from existing Avista employees, taught '
          + 'by Avista lineworkers at an Avista training center, under a dedicated program '
          + 'manager, and the 10-K files it alongside leadership and engineering '
          + 'development under one training umbrella.',
      },
      capability: {
        verdict: 'PASSES',
        detail: 'Trades, not knowledge work. The Jack Stewart Training Center is a '
          + 'craft training center; the eleven apprenticeships are 2-4 year programs '
          + 'teaching lineworkers to work safely on energized plant, and the '
          + 'engineering and Aspiring Leaders tracks are discipline and supervisory '
          + 'development. None of it is a curriculum an AI-capability program could be '
          + 'built on top of.',
        overturnedBy: 'The refined disqualifier settled on 2026-10-28. Under the '
          + 'ticket’s literal wording Avista was disqualified; the L&D finding '
          + 'above is unchanged and still true.',
        watch: 'Avista has more learning infrastructure than any other passing company '
          + '- a physical training center, a dedicated program manager and an '
          + 'instructional designer on staff. If any company on this list turns out to '
          + 'build its own, it is this one.',
      },
    },
    note: 'Chosen over ONE Gas on evidence. ONE Gas was not disqualified - its AI lead is a '
      + 'Director, which the VP-and-above threshold permits - but it already runs four named '
      + 'AI systems in production and reports 12,000 annualized hours saved to investors, so '
      + 'the offer lands weakly. CEO title confirmed from the company’s own investor site: '
      + 'President and CEO since 2025-01-01.',
  },
];

module.exports = { OPERATING };
