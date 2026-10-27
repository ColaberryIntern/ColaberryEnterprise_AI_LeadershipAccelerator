/**
 * C6.13 - the five financial-sector targets: banking, payments and insurance.
 *
 * Split out of c613Data.js when that file passed CLAUDE.md's 500-line ceiling. The seam
 * is sector rather than an arbitrary midpoint, because the sector is what the evidence
 * has in common: all five are SEC registrants, so every headcount and every commitment
 * here comes from a filing rather than a vendor press release, and all five were
 * screened for AI leadership through one Apollo pass plus an EDGAR officer sweep.
 *
 * Field contract, shared with c613CompaniesOperating:
 *   commitment { quote, who, whoTitle, date, sourceType, source, url, caveat? }
 *   req        { verdict: YES|NO, ... ; a NO MUST carry control + controlUrl }
 *   disq       { aiLeader: {verdict, detail}, ld: {verdict, detail, ...} }
 * c613Criteria enforces all three.
 */
const FINANCIAL = [
  {
    rank: 1,
    name: 'Commerce Bancshares',
    sector: 'Banking',
    domain: 'commercebank.com',
    ceo: { name: 'John Kemper', title: 'President & Chief Executive Officer',
      email: 'john.kemper@commercebank.com', apolloId: '6111055be3c2330001bb0899',
      emailStatus: 'verified' },
    leadId: 25369,
    employees: {
      count: '4,577 full-time + 160 part-time', asOf: '2025-12-31', sourceType: 'SEC filing',
      quote: 'The Company employed 4,577 persons on a full-time basis and 160 persons on a '
        + 'part-time basis at December 31, 2025.',
      url: 'https://www.sec.gov/Archives/edgar/data/22356/000002235626000069/cbsh-20251231.htm',
      caveat: 'Predates the FineMark Holdings acquisition, which closed 2026-01-01, so the '
        + 'current figure is higher.',
    },
    commitment: {
      quote: 'To responsibly harness the potential of AI, we established an AI pillar within '
        + 'our enterprise data strategy and developed a comprehensive AI roadmap. In '
        + 'addition, we’re modernizing our data platform to improve speed to insight, '
        + 'lower costs, and enable scalable growth.',
      who: 'John W. Kemper', whoTitle: 'President and Chief Executive Officer',
      date: '2026-02-24', sourceType: 'SEC filing',
      source: 'Letter to Shareholders, 2025 Annual Report (Form ARS, filed 2026-03-13). '
        + 'The same letter closes: "the pace of innovation - driven by advances in data, '
        + 'automation and AI - will continue to reshape customer expectations and industry '
        + 'dynamics."',
      url: 'https://www.sec.gov/Archives/edgar/data/22356/000002235626000110/'
        + 'a2025_cbxannualxreport10k.pdf',
      caveat: 'TWO KEMPERS. The letter immediately preceding this one is by David W. Kemper, '
        + 'Executive Chairman. The AI passage sits inside John W. Kemper’s letter, which '
        + 'runs continuously under his byline with no intervening author.',
    },
    req: {
      verdict: 'NO',
      coverage: 'All 154 open requisitions read, two independent ways: the site sitemap '
        + '(154 /job/ URLs) and the Phenom search API (totalHits 154). Zero qualifying titles.',
      nearMiss: 'Enterprise Data Architect, Clayton MO, site-displayed date 2026-09-09',
      nearMissUrl: 'https://careers.commercebank.com/us/en/job/38115/Enterprise-Data-Architect',
      control: 'Personal Banker (HTTP 200, title confirmed in HTML); a bogus job id returns '
        + 'HTTP 410, so a live 200 genuinely means a live req',
      controlUrl: 'https://careers.commercebank.com/us/en/job/38583/Personal-Banker',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Apollo mixed_people search across 20 disqualifying AI and data leadership '
          + 'titles returned no VP-and-above match, corroborated by an SEC EDGAR full-text '
          + 'sweep of named officers.',
      },
      ld: {
        verdict: 'PASSES',
        detail: 'No Chief Learning Officer and no corporate university. The 10-K treats '
          + 'career development as a strand of Total Rewards rather than a standalone '
          + 'learning organization; discrete training-specialist roles exist, such as a '
          + 'Commercial Training Specialist in Kansas City, but there is no training org '
          + 'behind them.',
      },
    },
  },
  {
    rank: 2,
    name: 'Cass Information Systems',
    sector: 'Financial Services',
    domain: 'cassinfo.com',
    ceo: { name: 'Martin Resch', title: 'President and CEO',
      email: 'mresch@cassinfo.com', apolloId: '66f4f86c8ac4370001c86940',
      emailStatus: 'verified' },
    leadId: 25370,
    employees: {
      count: '860 full-time + 156 part-time', asOf: '2026-02-27', sourceType: 'SEC filing',
      quote: 'The Company and its subsidiaries had 860 full-time and 156 part-time employees '
        + 'as of February 27, 2026, exclusive of discontinued operations.',
      url: 'https://www.sec.gov/Archives/edgar/data/708781/000070878126000010/cass-20251231.htm',
      caveat: 'At the low end of the 500-10,000 band, and shrinking BY DESIGN: the Q1 2026 '
        + 'release says FTEs fell 7.9% year over year "due to automation" and that the '
        + 'company expects a gradual decline in future quarters from its focus on AI-enabled '
        + 'systems. That cuts both ways - it proves the commitment is real, and it means the '
        + 'headcount may fall out of the band.',
    },
    commitment: {
      quote: 'Operationally, the consolidation of our non-transportation invoice and payment '
        + 'processing activities into a single Facilities division, combined with the '
        + 'expanded utilization of AI-enabled systems, should result in increased efficiency '
        + 'and enhanced levels of client satisfaction.',
      who: 'Martin Resch', whoTitle: 'President and Chief Executive Officer',
      date: '2026-01-22', sourceType: 'SEC filing',
      source: 'FY2025 results press release, filed as 8-K Exhibit 99.1. An earlier Resch '
        + 'quote (2025-10-23) gives the metric instead of the intent: "greater than 80% of '
        + 'invoices processed in AI enabled, automated systems". A 2026-04-23 investor '
        + 'presentation carries a slide headed "Artificial Intelligence (AI) Usage at Cass".',
      url: 'https://www.sec.gov/Archives/edgar/data/708781/000070878126000002/'
        + 'cass-20251231xexx991.htm',
      caveat: 'Resch’s Q1, Q2 and Q3 2026 quotes say "automation" and "technology '
        + 'enhancements" but NOT AI. Do not substitute them.',
    },
    req: {
      verdict: 'YES',
      title: 'Principal AI Software Architect',
      reqId: 'PRINC002984',
      location: 'Columbus, OH',
      displayedDate: '2026-10-16',
      url: 'https://recruiting2.ultipro.com/CAS1016CAIS/JobBoard/'
        + 'd0c782d5-c188-485a-b21d-72090cb86410/OpportunityDetail'
        + '?opportunityId=810d60ad-7459-4620-8832-1ad00c8865ac',
      coverage: '18 open reqs on the UKG/UltiPro board; this is the only qualifying one',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Apollo search across 20 disqualifying AI and data leadership titles '
          + 'returned no VP-and-above match, corroborated by an EDGAR officer sweep.',
      },
      ld: {
        verdict: 'PASSES',
        detail: 'The weakest internal L&D of the ten, and so the best fit on this '
          + 'criterion. The 10-K describes only tuition reimbursement for continued '
          + 'education and educational seminars run by outside parties. No internal '
          + 'learning organization, no academy, no CLO.',
      },
    },
  },
  {
    rank: 3,
    name: 'Horace Mann Educators',
    sector: 'Insurance',
    domain: 'horacemann.com',
    ceo: { name: 'Marita Zuraitis', title: 'President and CEO',
      email: 'marita.zuraitis@horacemann.com', apolloId: '6ae0eedb9a23050018b40776',
      emailStatus: 'verified' },
    leadId: 25371,
    employees: {
      count: 'approximately 1,800', asOf: '2025-12-31', sourceType: 'SEC filing',
      quote: 'As of December 31, 2025, Horace Mann had approximately 1,800 employees located '
        + 'in Springfield, Illinois; Dallas, Texas; Madison, Wisconsin; Cherry Hill, New '
        + 'Jersey; and throughout the United States as part of our remote workforce.',
      url: 'https://www.sec.gov/Archives/edgar/data/850141/000085014126000007/hmn-20251231.htm',
      caveat: 'The same 10-K discloses a voluntary Early Retirement Offering announced in '
        + 'December 2025, so headcount is being reduced.',
    },
    commitment: {
      quote: 'Generative Artificial Intelligence (GenAI) - positioning GenAI as a '
        + 'foundational, enterprise-wide capability intended to enhance decision-making, '
        + 'productivity, and customer engagement, while maintaining appropriate governance, '
        + 'controls, and risk management practices.',
      who: 'Horace Mann Educators Corporation',
      whoTitle: 'FY2025 Form 10-K, Item 1 Business - corporate statement, no individual',
      date: '2026-02-27', sourceType: 'SEC filing',
      source: 'The same filing adds that in 2026 the company expects "to further scale the '
        + 'application of Generative AI across Claims, Customer Care, and Operations", and '
        + 'the 2026 proxy records a board Technology Liaison role covering AI, held by '
        + 'director Victor Fetter.',
      url: 'https://www.sec.gov/Archives/edgar/data/850141/000085014126000007/hmn-20251231.htm',
      caveat: 'THE ONLY ROW WITH NO NAMED SPEAKER, and it is not for want of looking. No '
        + 'public AI statement attributable to Marita Zuraitis, or to any named Horace Mann '
        + 'executive, exists: EDGAR full-text returns only four Horace Mann filings ever '
        + 'containing "artificial intelligence" and none quotes a person; every 8-K earnings '
        + 'release from Q3 2025 to Q2 2026 contains zero occurrences of AI or GenAI; the Q1 '
        + 'and Q2 2026 call transcripts contain none either. A letter to Zuraitis CANNOT '
        + 'open by quoting her back to herself - it has to quote her company instead. '
        + 'Ironically the content is the most explicit AI strategy of the ten.',
    },
    req: {
      verdict: 'YES',
      title: 'Data Engineer II  ·  Director Analytics Engineering - Life & Retirement',
      location: 'Remote',
      displayedDate: 'Greenhouse exposes only updated_at (2026-10-14, 2026-10-22), '
        + 'which is last-touched, not first-posted',
      url: 'https://job-boards.greenhouse.io/horacemannservicecorporation/jobs/6223146004',
      coverage: '19 reqs on the corporate Greenhouse board, plus a separate 405-req '
        + 'field-agent board checked and clear',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Apollo search across 20 disqualifying AI and data leadership titles '
          + 'returned no VP-and-above match, corroborated by an EDGAR officer sweep.',
      },
      ld: {
        verdict: 'PASSES',
        detail: 'Moderate but field-weighted, which is the distinction that saves it. No '
          + 'Chief Learning Officer; human capital sits under the Chief Administrative '
          + 'Officer. The 10-K cites structured development programs and leadership '
          + 'development initiatives, and job postings show a Director, Distribution '
          + 'Learning & Innovation and a "Field Learning Ecosystem" - but those serve the '
          + 'agent and field-sales channel, not corporate employees. No corporate '
          + 'university.',
      },
    },
  },
  {
    rank: 4,
    name: 'Employers Holdings',
    sector: 'Insurance',
    domain: 'employers.com',
    ceo: { name: 'Katherine Antonello', title: 'President and CEO',
      email: 'kantonello@employers.com', apolloId: '57e18db8a6da987dc46e928f',
      emailStatus: 'verified' },
    leadId: 25372,
    employees: {
      count: '623 full-time', asOf: '2025-12-31', sourceType: 'SEC filing',
      quote: 'We had 623 full-time employees at December 31, 2025',
      url: 'https://www.sec.gov/Archives/edgar/data/1379041/000137904126000011/'
        + 'eig-20251231.htm',
      caveat: 'The smallest on the list and closest to the 500 floor.',
    },
    commitment: {
      quote: 'We are especially proud that this innovative product and its associated risk '
        + 'management tools were developed entirely through our internal, proactive use of '
        + 'AI, underscoring the culture of innovation that sets us apart.',
      who: 'Katherine Antonello', whoTitle: 'Chief Executive Officer',
      date: '2026-02-19', sourceType: 'SEC filing',
      source: 'Q4 and full-year 2025 results press release, filed as 8-K Exhibit 99.1.',
      url: 'https://www.sec.gov/Archives/edgar/data/1379041/000137904126000007/'
        + 'ex991_pressxreleasex202512.htm',
      caveat: 'Quote her as "Chief Executive Officer" from this document - that is how the '
        + 'release itself introduces her, though her full title is President and CEO.',
      strongerButRiskier: 'On the Q1 2026 call (2026-04-30) Antonello said "we brought '
        + 'together approximately 400 employees from across the country to introduce our '
        + 'strategy for implementing AI throughout the organization" and "we have now moved '
        + 'from AI experimentation to deployment". That is the most commercially relevant '
        + 'line on the whole list - a company that has already assembled 400 staff for AI '
        + 'enablement has a budget and an appetite. But it rests on THIRD-PARTY '
        + 'transcripts (two providers agreeing), not a company-published one. Confirm '
        + 'against the webcast before putting it in a letter.',
    },
    req: {
      verdict: 'YES',
      title: 'Director of Technology, Enterprise Data Engineering',
      reqId: '509',
      displayedDate: '2026-10-21',
      url: 'https://employers.csod.com/ux/ats/careersite/4/home/requisition/509?c=employers',
      coverage: '26 open reqs on Cornerstone OnDemand; this is the only qualifying one. '
        + 'The URL came back from the ATS posting API verbatim, not pattern-constructed - '
        + 'the page renders client-side, so a bogus id also returns 200.',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Apollo search across 20 disqualifying AI and data leadership titles '
          + 'returned no VP-and-above match, corroborated by an EDGAR officer sweep.',
      },
      ld: {
        verdict: 'PASSES',
        detail: 'Minimal. No Chief Learning Officer and no corporate university. The only '
          + 'named program anywhere is in the 2025 annual report: "We completed our '
          + 'Emerging Leaders Program". Set against the 400 staff they convened for AI '
          + 'enablement, that is appetite without the machinery to satisfy it.',
      },
    },
  },
  {
    rank: 5,
    name: 'CNO Financial Group',
    sector: 'Insurance',
    domain: 'cnoinc.com',
    ceo: { name: 'Gary Bhojwani', title: 'Chief Executive Officer',
      email: 'gary.bhojwani@cnoinc.com', apolloId: '66f156ebfc97540001ae2f0c',
      emailStatus: 'verified' },
    leadId: 25373,
    employees: {
      count: 'approximately 3,300 full-time associates', asOf: '2025-12-31',
      sourceType: 'SEC filing',
      quote: 'As of December 31, 2025, we employed approximately 3,300 full-time associates, '
        + 'nearly all of whom are located in the United States.',
      url: 'https://www.sec.gov/Archives/edgar/data/1224608/000122460826000017/'
        + 'cno-20251231.htm',
      caveat: 'The CEO letter references "3,300 associates, 5,000 exclusive agents". The '
        + '5,000 agents are not employees - and they are also who most of the training '
        + 'organization below exists to serve.',
    },
    commitment: {
      quote: 'Technology, data and artificial intelligence (AI) are woven into our strategy '
        + 'for improved efficiency and enhanced customer experience. We subscribe to the '
        + 'philosophy of AI and human collaboration.',
      who: 'Gary C. Bhojwani', whoTitle: 'Chief Executive Officer',
      date: '2026-03-26', sourceType: 'SEC filing',
      source: 'A Letter to Shareholders from CEO Gary C. Bhojwani, 2025 Annual Report (Form '
        + 'ARS). The preceding sentence carries the number: "In February 2025, we announced '
        + 'a three-year initiative to invest $170 million to modernize and strengthen '
        + 'certain elements of our technology foundation."',
      url: 'https://www.sec.gov/Archives/edgar/data/1224608/000122460826000032/'
        + 'cno-financialxcorp_2025xan.pdf',
      caveat: 'The Q2 2026 call (2026-07-31) contains no AI mentions by anyone. The annual '
        + 'report letter is the only source.',
    },
    req: {
      verdict: 'NO',
      coverage: 'All 11 corporate reqs enumerated from the Workday tenant and cross-checked '
        + 'against the company sitemap. Keyword search returned zero for artificial '
        + 'intelligence, data scientist, data engineer, data science, MLOps, analytics '
        + 'engineer. Caveat: corporate ATS only - Bankers Life field recruiting runs outside it.',
      control: 'Sr Director, Investment Operations and Data (req JR170484, startDate '
        + '2026-10-15, canApply true)',
      controlUrl: 'https://cnoinc.wd5.myworkdayjobs.com/Careers/job/Carmel-IN/'
        + 'Sr-Director--Investment-Operations-and-Data---HYBRID-Carmel--IN_JR170484',
    },
    disq: {
      aiLeader: {
        verdict: 'CLEAR',
        detail: 'Apollo search across 20 disqualifying AI and data leadership titles '
          + 'returned no VP-and-above match, corroborated by an EDGAR officer sweep.',
      },
      ld: {
        verdict: 'DISQUALIFIED',
        detail: 'The clearest disqualification on the list. CNO runs an Enterprise Field '
          + 'Development organization serving Bankers Life, Bankers Life Securities, '
          + 'Bankers Life Advisory Services and PMA, plus home-office and compliance '
          + 'training. It won Training magazine’s 2026 Training MVP award - its '
          + 'FIFTEENTH consecutive year of recognition - and repeated Chief Learning '
          + 'Officer LearningElite awards. It runs a Cornerstone LMS alongside LinkedIn '
          + 'Learning and tuition reimbursement, under a Senior Director, Field Learning '
          + 'Strategy.',
        nuance: 'Most of that machinery serves the 5,000 captive agents rather than the '
          + '3,300 corporate employees, so a corporate-employee gap may still exist. It '
          + 'does not change the verdict on the criterion as written: a company with '
          + 'fifteen consecutive years of training awards will build this itself.',
      },
    },
  },
];

module.exports = { FINANCIAL };
