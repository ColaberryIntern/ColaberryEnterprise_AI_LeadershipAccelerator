const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./frontend/src/config/demoScenarios.json', 'utf8'));

// Replace the 3 aixcelerator demos with coach-client journey perspective
const demos = {
  'aixcel-eos-blueprint': {
    industry: "EOS Blueprint Delivery",
    company: { name: "Your Coaching Practice", size: "15 CEO clients" },
    idea: "My manufacturing client asked me about AI at our last quarterly. I sent them the AI Workforce Designer link. They went through the assessment on their own. Now I have a Blueprint to present at the next session and I earn $1,750.",
    questions: [
      { q: "What does your coaching practice look like?", a: "EOS Implementer with 15 active CEO clients. They meet quarterly. Every single one is asking about AI.", method: "type" },
      { q: "Are clients asking about AI?", chips: ["Every meeting", "Sometimes", "Not yet", "I bring it up"], a: "Every meeting", method: "chip" },
      { q: "What do you do when they ask?", a: "I used to say 'talk to a consultant.' Now I send them the AI Workforce Designer link. They go through it on their own time. I get the Blueprint to review before their next session.", method: "type" },
      { q: "How do you deliver it?", chips: ["Part of quarterly session", "Standalone meeting", "Email it over", "All of the above"], a: "Part of quarterly session", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "earn", label: "Earn $1,750 Per Client", icon: "bi-cash-coin", sel: true }, { id: "answer", label: "Instant AI Answer", icon: "bi-lightbulb", sel: true }, { id: "retain", label: "Deepen Relationships", icon: "bi-people", sel: true }],
      systems: [{ id: "advisor", label: "AI Workforce Designer", icon: "bi-diagram-3", color: "primary", sel: true }, { id: "blueprint", label: "Business Blueprint", icon: "bi-file-earmark-bar-graph", color: "success", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates the client's assessment from business challenge through complete Blueprint delivery" },
      { name: "Business Analyzer", dept: "Advisory", primary: true, role: "Guides the client through 10 questions about their business, challenges, and AI readiness" },
      { name: "Industry Detector", dept: "Advisory", role: "Identifies the client's industry and tailors all recommendations using calibrated benchmarks" },
      { name: "Use Case Ranker", dept: "Advisory", primary: true, role: "Surfaces and ranks AI opportunities by ROI based on the client's specific answers" },
      { name: "AI Org Designer", dept: "Advisory", role: "Designs the complete AI agent workforce with roles, departments, and human oversight" },
      { name: "ROI Calculator", dept: "Finance", role: "Calculates savings, loss prevention, implementation cost, and 3-year ROI using industry data" },
      { name: "Blueprint Generator", dept: "Delivery", role: "Packages everything into a professional PDF report the coach can present" },
      { name: "Impact Simulator", dept: "Delivery", role: "Runs a live simulation showing the AI agents operating in the client's business" }
    ],
    kpis: { savings: 1750, savings_suf: "", revenue: 3500, revenue_suf: "/mo", roi: 0, agents: 8 },
    sim: [
      { agent: "AI Control Tower", action: "Coach sent advisor link to $8M manufacturing client. Client clicked and started the assessment at 9:14 PM from their phone.", narr: "The client does this on their own time. No meeting required. The coach just sends a link." },
      { agent: "Business Analyzer", action: "Client described their challenge: manual production scheduling, quality defects caught too late, no demand forecasting. Answered all 10 questions in 12 minutes.", narr: "The AI Workforce Designer walks them through it. The client types their real business problems." },
      { agent: "Use Case Ranker", action: "8 AI opportunities identified. Top 3: production scheduling ($340K impact), quality inspection ($210K), inventory forecasting ($180K). Total: $730K annual benefit.", narr: "Ranked by ROI using manufacturing industry benchmarks. Real numbers, not guesses." },
      { agent: "AI Org Designer", action: "Designed 10-agent AI workforce: Production Scheduler, Quality Inspector, Demand Forecaster, plus 7 supporting agents with human oversight at every critical point.", narr: "A complete AI org chart the CEO can understand. Not technical jargon. Business roles." },
      { agent: "Coach (Human)", action: "Reviewed the Blueprint before the quarterly. Added context: CEO is conservative, prioritize quality inspection first (he mentioned defects last session). Approved for presentation.", narr: "The coach adds what the AI cannot know: the relationship context, the CEO's personality, what was discussed last quarter. This is what makes it land.", is_hitl: true },
      { agent: "AI Control Tower", action: "Blueprint presented at quarterly session. CEO approved 2 AI initiatives as Q3 Rocks. Coach earned $1,750. Acceleration conversation started for Q4.", narr: "The coach earned $1,750 for sending one link. The client got a concrete AI plan. At 2 clients per month, that is $3,500 additional monthly income." }
    ],
    narr: { idea: "Imagine sending a client a link and earning $1,750 when they go through it...", questions: "The platform learns about your coaching practice...", design: "Your client uses the AI Workforce Designer to build their Blueprint...", results: "One link, one client, $1,750. The client does the work. You deliver the value.", sim: "Watch a coach send a link, the client goes through the assessment, and the coach earns $1,750." }
  },
  'aixcel-vistage-group': {
    industry: "Vistage Group Session",
    company: { name: "Your Vistage Chair Practice", size: "16 CEO members" },
    idea: "I told my Vistage group about the AI Workforce Designer. Showed them a quick demo. 6 of 16 members went through the assessment that week. Now I have 6 Blueprints to review and deliver. That is $10,500 from one group mention.",
    questions: [
      { q: "How large is your Vistage group?", a: "16 CEO members. Restaurant chain, HVAC, staffing, law firm, ecommerce, construction, and more.", method: "type" },
      { q: "How often do they ask about AI?", chips: ["Every meeting", "Most meetings", "Occasionally", "Rarely"], a: "Every meeting", method: "chip" },
      { q: "What happened when you showed them the tool?", a: "I demoed the AI Workforce Designer for 5 minutes at the start of the meeting. 6 members pulled it up on their phones during the break. By Friday all 6 had completed their assessments.", method: "type" },
      { q: "What was the result?", chips: ["Members loved it", "Mixed reactions", "Too technical", "Need more time"], a: "Members loved it", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "group", label: "$10,500 From One Mention", icon: "bi-cash-stack", sel: true }, { id: "value", label: "Become the AI Chair", icon: "bi-trophy", sel: true }, { id: "retain", label: "Increase Member Retention", icon: "bi-arrow-repeat", sel: true }],
      systems: [{ id: "advisor", label: "AI Workforce Designer", icon: "bi-diagram-3", color: "primary", sel: true }, { id: "parallel", label: "Parallel Blueprint Processing", icon: "bi-layers", color: "warning", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Manages parallel assessments from multiple group members, each getting their own customized Blueprint" },
      { name: "Business Analyzer", dept: "Advisory", primary: true, role: "Guides each member through the 10-question assessment independently on their own device and time" },
      { name: "Industry Detector", dept: "Advisory", primary: true, role: "Detects each member's industry: restaurant, HVAC, staffing, law, ecommerce, construction. Different benchmarks for each." },
      { name: "Use Case Ranker", dept: "Advisory", role: "Generates unique AI opportunities for each business based on their specific answers and industry" },
      { name: "AI Org Designer", dept: "Advisory", role: "Designs a different AI workforce for each member company based on size, industry, and priorities" },
      { name: "ROI Calculator", dept: "Finance", role: "Calculates individual ROI for each Blueprint so every CEO sees their specific numbers" },
      { name: "Blueprint Generator", dept: "Delivery", role: "Produces 6 separate professional Blueprints, each fully customized to that member's business" },
      { name: "Revenue Tracker", dept: "Finance", role: "Calculates chair revenue: 70% of each Blueprint across all members who completed the assessment" }
    ],
    kpis: { savings: 10500, savings_suf: "", revenue: 6, revenue_suf: " Blueprints", roi: 37, agents: 8 },
    sim: [
      { agent: "AI Control Tower", action: "Chair shared the AI Workforce Designer link with 16 group members. 6 started assessments within 48 hours.", narr: "The Chair mentions it once. Members do it on their own time. No extra meetings needed." },
      { agent: "Business Analyzer", action: "6 assessments completed: restaurant chain ($4M), HVAC company ($12M), staffing agency ($6M), law firm ($3M), ecommerce brand ($8M), construction company ($15M).", narr: "Each member described their own business challenges. The AI customized everything for their industry." },
      { agent: "Industry Detector", action: "6 different industries detected. Manufacturing benchmarks for HVAC. Professional services for law firm. Retail for ecommerce. Each gets calibrated numbers.", narr: "The HVAC company gets different FTE costs, ROI projections, and agent roles than the law firm. Nothing generic." },
      { agent: "ROI Calculator", action: "6 individual ROI projections: HVAC ($1.2M savings), ecommerce ($890K), construction ($780K), staffing ($420K), restaurant ($340K), law firm ($280K).", narr: "Every CEO sees what AI means for THEIR specific business. Not industry averages. Their numbers." },
      { agent: "Vistage Chair (Human)", action: "Reviewed all 6 Blueprints. Added member context: HVAC CEO ready to invest, law firm needs conservative approach, construction CEO skeptical but numbers are compelling. Approved all for delivery.", narr: "The Chair knows each member personally. A 2-minute note on each Blueprint makes it feel custom and thoughtful.", is_hitl: true },
      { agent: "Revenue Tracker", action: "6 Blueprints delivered at next group meeting. Chair revenue: 6 x $2,500 x 70% = $10,500. 3 members asked about implementation.", narr: "$10,500 from mentioning a link at one meeting. Three members want Acceleration retainers next quarter." }
    ],
    narr: { idea: "Imagine mentioning a tool at your group meeting and earning $10,500 that week...", questions: "The platform processes your entire group in parallel...", design: "Each member gets their own customized AI Blueprint...", results: "One mention, 6 Blueprints, $10,500. Plus 3 Acceleration conversations started.", sim: "Watch a Vistage Chair earn $10,500 from sharing one link with their group." }
  },
  'aixcel-acceleration-upsell': {
    industry: "Blueprint to Acceleration",
    company: { name: "Your Scaling Up Practice", size: "12 CEO clients" },
    idea: "My logistics client went through the AI Workforce Designer last quarter. They loved the Blueprint. Now they want to actually build the AI systems it recommended. The Acceleration retainer kicks in and I earn monthly recurring income.",
    questions: [
      { q: "What happened after the Blueprint?", a: "Client CEO showed the Blueprint to the leadership team. They approved 3 of the 8 AI use cases. Now they want working systems, not just a plan.", method: "type" },
      { q: "What does the client expect?", chips: ["Working AI systems", "More detailed plan", "Vendor list", "All of the above"], a: "Working AI systems", method: "chip" },
      { q: "What is your role going forward?", a: "I still run their quarterly planning sessions. AI progress is now a standing agenda item. I facilitate the strategic discussion, not the technical build.", method: "type" },
      { q: "What do you earn?", chips: ["One-time fee", "Monthly recurring", "Both", "Not sure"], a: "Monthly recurring", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "deploy", label: "Working AI in 90 Days", icon: "bi-rocket-takeoff", sel: true }, { id: "recurring", label: "Recurring Monthly Income", icon: "bi-graph-up-arrow", sel: true }, { id: "deepen", label: "Deeper Client Lock-In", icon: "bi-heart", sel: true }],
      systems: [{ id: "accel", label: "AI Acceleration Engine", icon: "bi-cpu", color: "primary", sel: true }, { id: "deploy", label: "Agent Deployment", icon: "bi-cloud-upload", color: "success", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates the transition from Blueprint recommendations to deployed, running AI agents" },
      { name: "System Architect", dept: "Engineering", primary: true, role: "Translates the 3 approved Blueprint use cases into technical agent architecture" },
      { name: "Agent Builder", dept: "Engineering", primary: true, role: "Builds and configures the AI agents using pre-built connectors for the client's existing tools" },
      { name: "Integration Agent", dept: "Engineering", role: "Connects to the client's existing systems: Samsara, DAT, QuickBooks, whatever they already use" },
      { name: "Test Agent", dept: "QA", role: "Validates each agent works correctly before going live in production" },
      { name: "Deploy Agent", dept: "Operations", role: "Launches agents into production with monitoring, alerting, and performance dashboards" },
      { name: "Progress Reporter", dept: "Delivery", role: "Generates quarterly reports the coach presents alongside their regular coaching deliverables" },
      { name: "Revenue Agent", dept: "Finance", role: "Tracks the $5,000/month retainer and calculates the coach's recurring referral bonus" }
    ],
    kpis: { savings: 5000, savings_suf: "/mo", revenue: 500, revenue_suf: "/mo coach", roi: 90, agents: 8 },
    sim: [
      { agent: "AI Control Tower", action: "Client's Blueprint identified 8 AI use cases. Leadership approved top 3: route optimization ($340K), carrier matching ($210K), load planning ($180K).", narr: "The Blueprint did the hard work. The client already knows what to build and why. No more discovery phase." },
      { agent: "Agent Builder", action: "Building 3 AI agents from the Blueprint specifications. Connecting to client's existing Samsara fleet management and DAT rate tools.", narr: "The coach never touches the technical side. AIXcelerator builds it. The client's existing tools get connected." },
      { agent: "Deploy Agent", action: "Route Optimization agent live. First week results: 12% reduction in empty miles, $8,400 saved this week.", narr: "Real results in the first week. Not a plan. Not a slide deck. Working AI that saves money." },
      { agent: "Scaling Up Coach (Human)", action: "Presented quarterly AI progress at OPSP session. Route optimization saving $12K/month. CEO approved 2 more use cases for next quarter.", narr: "The coach presents AI results the same way they present any other quarterly metric. It fits naturally into their existing process.", is_hitl: true },
      { agent: "Progress Reporter", action: "Quarterly report generated: 3 agents deployed, $36K saved in first quarter, 2 new use cases approved, client NPS score increased.", narr: "The coach has proof that AI is delivering. This makes the coaching relationship stickier than ever." },
      { agent: "Revenue Agent", action: "Acceleration retainer: $5,000/month. Coach referral bonus: $500/month recurring. Total coach income from this client: Blueprint $1,750 + $500/month ongoing.", narr: "The coach earned $1,750 from the Blueprint plus $500 every month the retainer continues. One client, recurring income, zero technical work." }
    ],
    narr: { idea: "Imagine your client's Blueprint turning into real AI systems and you earning monthly...", questions: "The platform transitions from Blueprint to Acceleration...", design: "AIXcelerator builds and deploys the AI agents from the Blueprint...", results: "3 agents deployed. $36K saved in Q1. Coach earns $500/month recurring.", sim: "Watch a Blueprint become working AI with recurring coach income." }
  }
};

let updated = 0;
all.forEach(s => {
  if (demos[s.id]) {
    Object.assign(s, demos[s.id]);
    updated++;
  }
});

fs.writeFileSync('./frontend/src/config/demoScenarios.json', JSON.stringify(all));
console.log("Updated", updated, "AIXcelerator demos to coach-client journey perspective");
