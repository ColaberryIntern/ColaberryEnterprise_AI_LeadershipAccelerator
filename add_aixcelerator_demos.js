const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./frontend/src/config/demoScenarios.json', 'utf8'));

// Remove any existing aixcelerator demos
const filtered = all.filter(s => !s.id.startsWith('aixcel-'));

const demos = [
  {
    id: "aixcel-eos-blueprint", industry: "EOS Blueprint Delivery",
    company: { name: "Your Coaching Practice", size: "15 CEO clients" },
    idea: "My client runs a $8M manufacturing company. They asked me where AI fits their VTO and Rocks. I need a systematic answer I can bring to their next quarterly session. I want to earn from delivering it.",
    questions: [
      { q: "What does your coaching practice look like?", a: "EOS Implementer with 15 active CEO clients. Companies range from $2M to $50M. I run quarterly sessions and annual planning.", method: "type" },
      { q: "Are clients asking about AI?", chips: ["Every meeting", "Sometimes", "Not yet", "I bring it up"], a: "Every meeting", method: "chip" },
      { q: "What is your biggest challenge with AI?", a: "I have no systematic way to assess their AI readiness. I end up saying 'talk to an AI consultant' which makes me look like I don't have the answer. I want a deliverable I can bring to the quarterly.", method: "type" },
      { q: "How do you want to deliver it?", chips: ["Part of quarterly session", "Standalone engagement", "Group workshop", "All of the above"], a: "Part of quarterly session", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "earn", label: "Earn $1,750 Per Blueprint", icon: "bi-cash-coin", sel: true }, { id: "answer", label: "Systematic AI Answer", icon: "bi-lightbulb", sel: true }, { id: "retain", label: "Deepen Client Relationships", icon: "bi-people", sel: true }],
      systems: [{ id: "ontology", label: "AI Ontology Engine", icon: "bi-diagram-3", color: "primary", sel: true }, { id: "usecase", label: "Use Case Engine", icon: "bi-bullseye", color: "warning", sel: true }, { id: "blueprint", label: "Workforce Blueprint", icon: "bi-file-earmark-bar-graph", color: "success", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates the entire Blueprint process from client intake to delivery-ready package" },
      { name: "Client Intake Agent", dept: "Advisory", primary: true, role: "Captures client business context through a 30-minute conversational onboarding aligned to EOS structure" },
      { name: "AI Ontology Mapper", dept: "Advisory", primary: true, role: "Maps client business into a structured knowledge graph using their Core Focus, Rocks, KPIs, and processes" },
      { name: "Use Case Ranker", dept: "Advisory", role: "Detects patterns across decisions, data flows, and KPIs to surface and rank AI opportunities by impact" },
      { name: "ROI Calculator", dept: "Finance", role: "Quantifies expected savings, revenue impact, and payback period for each AI use case using industry benchmarks" },
      { name: "Workforce Blueprint Designer", dept: "Advisory", role: "Designs the AI org chart with Strategic, Tactical, and Execution roles alongside human oversight structure" },
      { name: "Session Prep Agent", dept: "Delivery", role: "Packages the Blueprint for quarterly session delivery: slide deck, discussion guide, and prioritized recommendations" },
      { name: "Export Agent", dept: "Delivery", role: "Generates final deliverable in PDF, slide, and JSON formats with co-branding for the coach" }
    ],
    kpis: { savings: 1750, savings_suf: "", revenue: 3500, revenue_suf: "/mo", roi: 0, agents: 8 },
    sim: [
      { agent: "Client Intake Agent", action: "New referral from EOS Implementer: $8M manufacturing company. 30-minute onboarding scheduled.", narr: "The coach introduces their client. AIXcelerator handles the rest." },
      { agent: "AI Ontology Mapper", action: "Business mapped to EOS structure: Core Focus identified, 4 Rocks active, 12 KPIs tracked, 3 departments with manual processes.", narr: "AI maps their business using the same language the coach already uses with the client." },
      { agent: "Use Case Ranker", action: "12 AI opportunities identified. Top 3 by ROI: production scheduling ($340K), quality inspection ($210K), inventory forecasting ($180K).", narr: "Ranked use cases the coach can present as 'AI Rocks' for the next quarterly session." },
      { agent: "Coach (Human)", action: "Reviewed Blueprint. Added context: CEO is conservative on tech spend, prioritize quick wins. Moved quality inspection to #1 (CEO mentioned it last session).", narr: "The coach adds the relationship context that AI cannot know. This is what makes the Blueprint land.", is_hitl: true },
      { agent: "Session Prep Agent", action: "Blueprint packaged for quarterly session: 12-page deck, discussion guide, 3 recommended AI Rocks for Q3.", narr: "Ready for the coach to present at the quarterly. Professional, branded, and specific to the client." },
      { agent: "AI Control Tower", action: "Blueprint delivered. Coach earns $1,750 (70% of $2,500). Client approved 2 AI Rocks for Q3. Acceleration conversation started.", narr: "The coach earned $1,750 for introducing one client. At 2 per month, that is $3,500 additional monthly income." }
    ],
    narr: { idea: "Imagine earning $1,750 every time a client asks about AI...", questions: "The platform learns about your coaching practice...", design: "AIXcelerator recommends the Advisory engines for Blueprint delivery...", results: "Your Blueprint practice: 8 AI agents, $1,750 per delivery, 2-week turnaround.", sim: "Watch an EOS Implementer deliver a Blueprint and earn $1,750." }
  },
  {
    id: "aixcel-vistage-group", industry: "Vistage Group Session",
    company: { name: "Your Vistage Chair Practice", size: "16 CEO members" },
    idea: "I chair a Vistage group with 16 CEO members. Every meeting someone asks about AI. I want to bring in an expert who can show them what AI looks like for their specific business, and I want to earn from every Blueprint that results.",
    questions: [
      { q: "How large is your Vistage group?", a: "16 CEO members across different industries: restaurant chain, HVAC, staffing, law firm, ecommerce, construction, and more.", method: "type" },
      { q: "How often do they ask about AI?", chips: ["Every meeting", "Most meetings", "Occasionally", "Rarely"], a: "Every meeting", method: "chip" },
      { q: "What happens when they ask?", a: "I give a general answer about AI trends. Some members have tried ChatGPT. Nobody has a structured AI strategy. I lose credibility every time I cannot give a specific answer.", method: "type" },
      { q: "What would be ideal?", chips: ["Expert speaker for the group", "Individual Blueprints for each", "Both", "Workshop format"], a: "Both", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "group", label: "$10,500 From One Session", icon: "bi-cash-stack", sel: true }, { id: "value", label: "Become the AI Chair", icon: "bi-trophy", sel: true }, { id: "retain", label: "Increase Member Retention", icon: "bi-arrow-repeat", sel: true }],
      systems: [{ id: "present", label: "AI Strategy Presentation", icon: "bi-easel", color: "primary", sel: true }, { id: "parallel", label: "Parallel Blueprint Engine", icon: "bi-layers", color: "warning", sel: true }, { id: "delivery", label: "Group Delivery System", icon: "bi-people", color: "success", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Coordinates the group session from presentation through individual Blueprint delivery for each interested member" },
      { name: "Presentation Agent", dept: "Marketing", primary: true, role: "Generates 'AI Strategy for CEOs' presentation customized for the group's industry mix" },
      { name: "AI Ontology Mapper", dept: "Advisory", primary: true, role: "Runs parallel business mapping for each member who requests a Blueprint after the presentation" },
      { name: "Use Case Ranker", dept: "Advisory", role: "Surfaces ranked AI opportunities for each member's specific business and industry" },
      { name: "ROI Calculator", dept: "Finance", role: "Generates individual ROI projections for each Blueprint so CEOs see their specific numbers" },
      { name: "Workforce Blueprint Designer", dept: "Advisory", role: "Designs AI org chart for each member company based on their size, industry, and priorities" },
      { name: "Batch Delivery Agent", dept: "Delivery", role: "Manages parallel Blueprint generation for multiple members with individual customization" },
      { name: "Revenue Tracker", dept: "Finance", role: "Calculates chair revenue: 70% of each Blueprint fee across all group members who convert" }
    ],
    kpis: { savings: 10500, savings_suf: "", revenue: 6, revenue_suf: " Blueprints", roi: 37, agents: 8 },
    sim: [
      { agent: "Presentation Agent", action: "Generated 'AI Strategy for CEOs' deck for 16-member group. Customized examples: restaurant, HVAC, staffing, law, ecommerce, construction.", narr: "The presentation speaks to each member's industry. Nobody sees generic slides." },
      { agent: "AI Control Tower", action: "Presentation complete. 6 of 16 members requested individual Blueprints. Conversion: 37.5%.", narr: "Over a third of the group wants their own Blueprint. That is 6 paying clients from one session." },
      { agent: "AI Ontology Mapper", action: "Running 6 Blueprints in parallel: restaurant chain ($4M), HVAC ($12M), staffing agency ($6M), law firm ($3M), ecommerce ($8M), construction ($15M).", narr: "All 6 businesses mapped simultaneously. Each gets a fully customized Blueprint in 2 weeks." },
      { agent: "Vistage Chair (Human)", action: "Reviewed all 6 Blueprints. Added member context: HVAC CEO is ready to invest, law firm needs conservative approach. Approved all for delivery.", narr: "The Chair knows each member personally. That context makes every Blueprint land better.", is_hitl: true },
      { agent: "Batch Delivery Agent", action: "6 Blueprints delivered. Each member received: AI org chart, ranked use cases, ROI projections, and recommended next steps.", narr: "Six professional deliverables, all completed in 2 weeks from one group session." },
      { agent: "Revenue Tracker", action: "Chair revenue: 6 Blueprints x $2,500 x 70% = $10,500. Next session: 3 members want Acceleration retainers.", narr: "$10,500 from one group meeting. Plus 3 potential Acceleration retainers at $5,000/month each." }
    ],
    narr: { idea: "Imagine earning $10,500 from a single group meeting...", questions: "The platform learns about your Vistage group...", design: "AIXcelerator sets up parallel Blueprint generation for the whole group...", results: "One group session: 6 Blueprints, $10,500 chair revenue, 37% conversion.", sim: "Watch a Vistage Chair earn $10,500 from one group session." }
  },
  {
    id: "aixcel-acceleration-upsell", industry: "Blueprint to Acceleration",
    company: { name: "Your Scaling Up Practice", size: "12 CEO clients" },
    idea: "My $20M logistics client got their Business Blueprint last quarter. They loved it. Now they want to actually build the AI systems it recommended. How does the Acceleration retainer work and what do I earn as the coach?",
    questions: [
      { q: "What happened after the Blueprint?", a: "Client CEO presented it to their leadership team. They approved 3 of the 8 recommended AI use cases. Now they want to move from plan to production.", method: "type" },
      { q: "What does the client expect?", chips: ["Working AI systems", "Detailed technical plan", "Vendor recommendations", "All of the above"], a: "Working AI systems", method: "chip" },
      { q: "What is your role going forward?", a: "I want to stay involved in the strategic conversations. I facilitate their quarterly planning sessions. AI progress should be part of that rhythm.", method: "type" },
      { q: "What do you want to earn?", chips: ["One-time referral fee", "Ongoing percentage", "Monthly retainer share", "Whatever is fair"], a: "Monthly retainer share", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "deploy", label: "3 AI Agents in 90 Days", icon: "bi-rocket-takeoff", sel: true }, { id: "recurring", label: "Recurring Referral Income", icon: "bi-graph-up-arrow", sel: true }, { id: "deepen", label: "Deeper Client Relationship", icon: "bi-heart", sel: true }],
      systems: [{ id: "system", label: "System Blueprint Engine", icon: "bi-cpu", color: "primary", sel: true }, { id: "compiler", label: "Agent Compiler", icon: "bi-tools", color: "warning", sel: true }, { id: "registry", label: "Capability Registry (MCP)", icon: "bi-grid-3x3-gap", color: "success", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates the full Acceleration from approved Blueprint use cases through deployed, running AI agents" },
      { name: "System Blueprint Engine", dept: "Engineering", primary: true, role: "Translates the Business Blueprint into engineering-ready agent architecture with tools, controls, and dependencies" },
      { name: "Agent Compiler", dept: "Engineering", primary: true, role: "Composes internal agents and external MCP tools into deployable artifacts with security controls built in" },
      { name: "Capability Resolver", dept: "Engineering", role: "Selects optimal MCP connectors from the registry based on cost, latency, reliability, and compliance requirements" },
      { name: "Test Harness Agent", dept: "QA", role: "Generates and runs test suites for each compiled agent before production deployment" },
      { name: "Deployment Agent", dept: "Operations", role: "Handles production deployment, monitoring setup, and SLA enforcement for running agents" },
      { name: "Progress Reporter", dept: "Delivery", role: "Generates quarterly progress reports the coach can present alongside their regular coaching deliverables" },
      { name: "Revenue Agent", dept: "Finance", role: "Tracks Acceleration retainer billing and calculates coach referral bonuses per payment cycle" }
    ],
    kpis: { savings: 5000, savings_suf: "/mo", revenue: 3, revenue_suf: " agents", roi: 90, agents: 8 },
    sim: [
      { agent: "System Blueprint Engine", action: "Translating 3 approved use cases from Blueprint: route optimization, carrier matching, and customs automation for $20M logistics client.", narr: "The Blueprint already defined what to build. Now the Acceleration engine figures out how." },
      { agent: "Capability Resolver", action: "Selected MCP connectors: Samsara (fleet), DAT (rates), project44 (visibility), US CBP (customs). Auth configured.", narr: "The platform connects to the client's existing tools. No rip-and-replace." },
      { agent: "Agent Compiler", action: "3 agents compiled: AI Route Optimizer, AI Carrier Matcher, AI Customs Classifier. Security controls embedded. Test suites generated.", narr: "From Blueprint to deployable agents. The coach never touches the technical side." },
      { agent: "Scaling Up Coach (Human)", action: "Reviewed quarterly progress report. Client's route optimization saving $12K/month. Coach presenting results at next OPSP session.", narr: "The coach stays strategic. They present AI progress alongside regular coaching. The relationship deepens.", is_hitl: true },
      { agent: "Deployment Agent", action: "All 3 agents live in production. Monitoring active. 99.5% availability. Client CEO dashboard live.", narr: "Working AI systems, not PowerPoint. The client sees real results, the coach gets credit." },
      { agent: "Revenue Agent", action: "Acceleration retainer: $5,000/month. Coach referral bonus: $500/month recurring. Blueprint + Acceleration total coach income from this client: $2,250/month.", narr: "The coach earns $1,750 from the Blueprint plus $500/month ongoing from the retainer. One client, recurring income." }
    ],
    narr: { idea: "Imagine your Blueprint client saying 'we want to build this' and you earning monthly...", questions: "The platform learns about the Acceleration opportunity...", design: "AIXcelerator deploys the System Blueprint Engine, Agent Compiler, and Capability Registry...", results: "3 agents deployed in 90 days. Coach earns $500/month recurring referral bonus.", sim: "Watch a Blueprint turn into running AI agents with recurring coach income." }
  }
];

filtered.push(...demos);
fs.writeFileSync('./frontend/src/config/demoScenarios.json', JSON.stringify(filtered));
console.log("Added", demos.length, "AIXcelerator coach demos. Total scenarios:", filtered.length);
demos.forEach(d => console.log(" ", d.id, ":", d.agents.length, "agents,", d.sim.length, "sim steps (" + d.sim.filter(s => s.is_hitl).length + " HITL)"));
