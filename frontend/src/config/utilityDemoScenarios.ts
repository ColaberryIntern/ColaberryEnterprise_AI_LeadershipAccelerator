// 8 utility-specific demo scenarios for the co-op landing page
// Each has focused agents matching the card's agent count

export const UTILITY_DEMO_SCENARIOS = [
  {
    id: "utility-outage", industry: "Outage Prediction",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "We are a regional electric cooperative serving 380,000 members. Our biggest challenge is unplanned outages \u2014 transformers fail without warning, causing extended downtime and expensive emergency repairs. We want AI to predict equipment failures before they happen.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative serving 380,000 residential and commercial members across 4 counties with 75,000+ meters.", method: "type" },
      { q: "How large is your organization?", chips: ["1-10","11-50","51-200","201-1000","1000+"], a: "201-1000", method: "chip" },
      { q: "What\u2019s your biggest operational challenge?", a: "Unplanned transformer failures cause 6-12 hour outages. We replace equipment reactively instead of predictively. Each major failure costs $50K-$200K in emergency repairs.", method: "type" },
      { q: "Which systems need AI most?", chips: ["Grid Operations","Customer Service","Field Services","Compliance","Finance"], a: "Grid Operations, Field Services", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "predict", label: "Predict Failures", icon: "bi-lightning-charge", sel: true }, { id: "reduce", label: "Reduce Downtime", icon: "bi-clock-history", sel: true }, { id: "save", label: "Cut Repair Costs", icon: "bi-piggy-bank", sel: true }],
      systems: [{ id: "grid", label: "Grid Intelligence Engine", icon: "bi-lightning-charge", color: "warning", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Central orchestrator monitoring all grid sensors and coordinating predictive maintenance actions" },
      { name: "Outage Predictor", dept: "Operations", primary: true, role: "Analyzes transformer thermal data, load patterns, and weather to predict failures 48 hours in advance" },
      { name: "Grid Monitor", dept: "Operations", role: "Continuously monitors voltage, frequency, and power quality across all feeders in real-time" }
    ],
    kpis: { savings: 185, savings_suf: "K", revenue: 420, revenue_suf: "K", roi: 340, agents: 3 },
    sim: [
      { agent: "AI Control Tower", action: "Scanning 75,000 meters and 2,400 transformers for anomalies", narr: "The AI Control Tower monitors every piece of equipment on your grid." },
      { agent: "Outage Predictor", action: "Alert: Transformer T-4821 thermal stress \u2014 87% failure probability within 48 hours", narr: "AI catches the failure pattern days before it would cause an outage." },
      { agent: "Grid Monitor", action: "Confirmed: Feeder 7 load imbalance correlating with T-4821 degradation", narr: "Grid monitoring validates the prediction with real-time power data." },
      { agent: "AI Control Tower", action: "Auto-scheduled preventive maintenance \u2014 zero member impact", narr: "Preventive maintenance instead of emergency repair. No outage." },
      { agent: "Outage Predictor", action: "Monthly: 14 failures predicted, 13 prevented, $185K avoided", narr: "AI turns reactive grid management into proactive operations." },
      { agent: "AI Control Tower", action: "Year-to-date: 92% fewer unplanned outages", narr: "Members experience fewer outages. Board sees measurable results." }
    ],
    narr: { idea: "Imagine your cooperative could predict equipment failures before they happen...", questions: "The AI advisor learns about your grid operations...", design: "AI recommends grid intelligence and predictive monitoring...", results: "Your AI system: 3 agents, $185K savings, 92% fewer unplanned outages.", sim: "Watch AI predict and prevent a transformer failure." }
  },
  {
    id: "utility-storm", industry: "Storm Response",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "We serve 380,000 members and during storms our call center gets overwhelmed with 15,000+ calls. Members wait 45+ minutes for updates. Crew dispatch is manual and slow. We need AI to handle storm communication and coordinate restoration.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative. During severe weather, we handle 15,000+ inbound calls and coordinate 200+ field crews.", method: "type" },
      { q: "How large is your organization?", chips: ["1-10","11-50","51-200","201-1000","1000+"], a: "201-1000", method: "chip" },
      { q: "What\u2019s your biggest storm challenge?", a: "Call center overwhelmed \u2014 15,000 calls in 3 hours. Members angry about long hold times. Manual crew dispatch takes hours.", method: "type" },
      { q: "Which functions need AI most?", chips: ["Customer Comms","Crew Dispatch","Damage Assessment","Restoration Planning"], a: "Customer Comms, Crew Dispatch, Restoration Planning", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "calls", label: "Reduce Call Volume", icon: "bi-telephone-x", sel: true }, { id: "speed", label: "Faster Restoration", icon: "bi-lightning", sel: true }, { id: "notify", label: "Proactive Updates", icon: "bi-bell", sel: true }],
      systems: [{ id: "cust", label: "Member Comms Engine", icon: "bi-megaphone", color: "info", sel: true }, { id: "field", label: "Crew Dispatch Engine", icon: "bi-truck", color: "success", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Coordinates storm response across customer comms, crew dispatch, and grid operations" },
      { name: "Storm Response Bot", dept: "Customer Support", primary: true, role: "Auto-sends outage alerts to affected members via text, email, and IVR before they call" },
      { name: "Outage Communicator", dept: "Customer Support", role: "Handles inbound calls with real-time ETAs and personalized restoration updates" },
      { name: "Crew Dispatcher", dept: "Field Services", primary: true, role: "Optimally routes restoration crews based on outage severity, location, and proximity" }
    ],
    kpis: { savings: 210, savings_suf: "K", revenue: 580, revenue_suf: "K", roi: 310, agents: 4 },
    sim: [
      { agent: "AI Control Tower", action: "Storm alert: Category 2 approaching. 42,000 members in projected path.", narr: "The AI Control Tower activates storm protocols before the first outage." },
      { agent: "Storm Response Bot", action: "Auto-sent alerts to 42,000 members via text and email", narr: "Members notified before they lose power \u2014 reducing panic calls." },
      { agent: "Crew Dispatcher", action: "Pre-positioned 12 crews at staging areas closest to impact zones", narr: "AI pre-stages crews for fastest possible response time." },
      { agent: "Outage Communicator", action: "Handling 8,400 inbound calls simultaneously with real-time ETAs", narr: "No hold times. Every member gets a personalized restoration estimate." },
      { agent: "AI Control Tower", action: "Restoration 62% complete. Rerouting 3 crews to critical areas.", narr: "The Control Tower continuously optimizes crew allocation." },
      { agent: "Storm Response Bot", action: "Result: 60% fewer inbound calls vs. comparable storm last year", narr: "Proactive communication dramatically reduces call center load." }
    ],
    narr: { idea: "Imagine handling a major storm without your call center being overwhelmed...", questions: "The AI advisor learns about your storm response...", design: "AI recommends member communication and crew dispatch engines...", results: "Your AI system: 4 agents, 60% fewer storm calls, 28% faster restoration.", sim: "Watch AI coordinate storm response across 42,000 members." }
  },
  {
    id: "utility-metering", industry: "Smart Metering",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "We have 75,000+ meters but limited real-time visibility. Theft detection takes months. Meter malfunctions go undetected. We want AI to analyze meter data for anomalies, theft, and demand patterns.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative with 75,000+ AMI meters needing better real-time visibility into usage, theft, and equipment health.", method: "type" },
      { q: "How many meters?", chips: ["Under 10K","10K-50K","50K-100K","100K+"], a: "50K-100K", method: "chip" },
      { q: "What\u2019s your biggest metering challenge?", a: "Theft costs $180K+ annually. Meter malfunctions go undetected for weeks. Can't forecast demand accurately.", method: "type" },
      { q: "Which capabilities matter most?", chips: ["Theft Detection","Anomaly Alerts","Demand Forecasting","Meter Health"], a: "Theft Detection, Anomaly Alerts", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "theft", label: "Detect Theft", icon: "bi-shield-exclamation", sel: true }, { id: "anomaly", label: "Spot Anomalies", icon: "bi-exclamation-triangle", sel: true }],
      systems: [{ id: "meter", label: "Meter Intelligence Engine", icon: "bi-speedometer2", color: "primary", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Monitors all 75,000 meters and escalates anomalies to the right teams" },
      { name: "Meter Analyzer", dept: "Operations", primary: true, role: "Detects usage anomalies, theft patterns, and meter malfunctions across the entire fleet" }
    ],
    kpis: { savings: 180, savings_suf: "K", revenue: 320, revenue_suf: "K", roi: 260, agents: 2 },
    sim: [
      { agent: "AI Control Tower", action: "Real-time scan: 75,842 meters active. 23 anomalies flagged.", narr: "Every meter monitored continuously." },
      { agent: "Meter Analyzer", action: "Theft detected: Account #34821 showing 40% consumption drop", narr: "AI catches theft patterns that take months manually." },
      { agent: "Meter Analyzer", action: "Malfunction alert: 3 meters in Zone 7 reporting zero reads", narr: "Equipment issues caught in real-time, not at billing." },
      { agent: "AI Control Tower", action: "Monthly recovery: $15,200 in detected theft, 12 meters repaired", narr: "$180K annual revenue recovery from theft detection." },
      { agent: "Meter Analyzer", action: "Demand forecast: 8.2% peak increase Thursday \u2014 capacity adjustment needed", narr: "Accurate demand forecasting for rate planning." },
      { agent: "AI Control Tower", action: "Quarterly: 47 theft cases, $180K recovered, 99.7% meter uptime", narr: "Board-ready reporting with measurable ROI." }
    ],
    narr: { idea: "Imagine knowing what every meter on your grid is doing in real-time...", questions: "The AI advisor learns about your metering infrastructure...", design: "AI recommends meter intelligence and anomaly detection...", results: "Your AI system: 2 agents, $180K recovery, 99.7% uptime.", sim: "Watch AI detect theft and anomalies across 75,000 meters." }
  },
  {
    id: "utility-vegetation", industry: "Vegetation Management",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "Vegetation contact causes 35% of our outages. Trimming is on fixed cycles, not risk-based. We spend $2M/year with no way to prioritize the highest-risk areas.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative with 4,200 miles of distribution lines. Vegetation causes 35% of our outages.", method: "type" },
      { q: "How do you manage vegetation?", chips: ["Fixed cycle","Complaint-based","Visual inspection","Combination"], a: "Combination", method: "chip" },
      { q: "What\u2019s your vegetation budget?", a: "$2M annually for trimming on a fixed 3-year cycle. We trim low-risk areas while high-risk corridors grow unchecked.", method: "type" },
      { q: "What would help most?", chips: ["Risk Prioritization","Growth Prediction","Satellite Analysis","Cost Optimization"], a: "Risk Prioritization, Growth Prediction", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "reduce", label: "Reduce Veg Outages", icon: "bi-tree", sel: true }, { id: "optimize", label: "Optimize Spend", icon: "bi-piggy-bank", sel: true }],
      systems: [{ id: "veg", label: "Vegetation Intelligence", icon: "bi-tree", color: "success", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Correlates vegetation data with outage history to identify highest-risk corridors" },
      { name: "Vegetation Analyzer", dept: "Operations", primary: true, role: "Analyzes satellite imagery and growth models to prioritize trimming by actual risk" }
    ],
    kpis: { savings: 340, savings_suf: "K", revenue: 280, revenue_suf: "K", roi: 220, agents: 2 },
    sim: [
      { agent: "AI Control Tower", action: "Analyzing 4,200 miles of corridors against outage history", narr: "AI combines satellite imagery, weather, and outage data." },
      { agent: "Vegetation Analyzer", action: "High-risk: Corridor 7-B, 18-inch encroachment, 73% outage probability", narr: "Risk-based prioritization instead of fixed-cycle trimming." },
      { agent: "Vegetation Analyzer", action: "Rescheduled: 7-B to priority, deferred low-risk 12-A", narr: "$340K saved by not trimming low-risk areas on schedule." },
      { agent: "AI Control Tower", action: "Growth forecast: 14 corridors reaching critical in 90 days", narr: "Predict and prevent instead of react." },
      { agent: "Vegetation Analyzer", action: "Annual: 35% fewer veg outages, $340K cost reduction", narr: "Same budget, dramatically better outcomes." },
      { agent: "AI Control Tower", action: "Board report: Veg outages down from 412 to 268", narr: "Measurable improvement in reliability scores." }
    ],
    narr: { idea: "Imagine knowing exactly which trees will cause your next outage...", questions: "The AI advisor learns about your vegetation challenges...", design: "AI recommends vegetation intelligence and risk prioritization...", results: "Your AI system: 2 agents, 35% fewer veg outages, $340K savings.", sim: "Watch AI prioritize trimming by actual risk." }
  },
  {
    id: "utility-ratecase", industry: "Rate Case Automation",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "Rate case preparation takes 4-6 months of manual work. Cost-of-service studies require data from 12 systems. We want AI to automate regulatory filing preparation.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative filing rate cases with the state PUC every 3 years. Each filing takes 4-6 months.", method: "type" },
      { q: "How often do you file?", chips: ["Annually","Every 2 years","Every 3 years","As needed"], a: "Every 3 years", method: "chip" },
      { q: "What\u2019s your biggest challenge?", a: "Data in 12 systems. Cost-of-service studies are manual Excel work. PUC formatting is error-prone. Team of 3 people.", method: "type" },
      { q: "Which tasks should AI handle?", chips: ["Data Aggregation","Cost Analysis","Filing Generation","Rate Design"], a: "Data Aggregation, Cost Analysis, Filing Generation", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "speed", label: "Faster Filings", icon: "bi-lightning", sel: true }, { id: "accuracy", label: "Reduce Errors", icon: "bi-check-circle", sel: true }, { id: "staff", label: "Free Up Staff", icon: "bi-people", sel: true }],
      systems: [{ id: "reg", label: "Regulatory Engine", icon: "bi-file-earmark-bar-graph", color: "primary", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates data collection from 12 systems and tracks filing progress" },
      { name: "Rate Case Analyst", dept: "Finance", primary: true, role: "Automates cost-of-service studies, rate design, and PUC filing generation" },
      { name: "Data Integrator", dept: "Operations", role: "Pulls and reconciles data from billing, accounting, engineering, and ops" }
    ],
    kpis: { savings: 160, savings_suf: "K", revenue: 0, revenue_suf: "", roi: 280, agents: 3 },
    sim: [
      { agent: "AI Control Tower", action: "Rate case initiated. Connecting to 12 data sources.", narr: "AI aggregates data that took weeks to collect manually." },
      { agent: "Data Integrator", action: "Pulled 847,000 records from billing, accounting, engineering, ops", narr: "Data from 12 systems reconciled automatically." },
      { agent: "Rate Case Analyst", action: "Cost-of-service complete: revenue requirement $47.2M, 3.8% adjustment", narr: "6 weeks of manual analysis done in hours." },
      { agent: "Rate Case Analyst", action: "Generated PUC-compliant filing with all schedules and exhibits", narr: "Formatting matches regulatory requirements exactly." },
      { agent: "AI Control Tower", action: "Review: 0 data errors, 100% compliance with filing requirements", narr: "AI catches errors before submission." },
      { agent: "Rate Case Analyst", action: "Result: Filed in 3 weeks instead of 4 months", narr: "80% faster. Team focuses on strategy, not data entry." }
    ],
    narr: { idea: "Imagine preparing your next rate case in weeks instead of months...", questions: "The AI advisor learns about your regulatory process...", design: "AI recommends regulatory automation and data integration...", results: "Your AI system: 3 agents, 80% faster prep, zero errors.", sim: "Watch AI prepare a complete rate case from 12 data sources." }
  },
  {
    id: "utility-memberservices", industry: "Member Services AI",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "Our call center handles 3,000+ calls per week. Average wait time is 8 minutes. After-hours calls go to voicemail. We want AI to handle routine inquiries 24/7.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative with 380,000 members. Call center of 15 handles billing, outages, service requests, new connections.", method: "type" },
      { q: "Weekly call volume?", chips: ["Under 500","500-1,000","1,000-3,000","3,000+"], a: "3,000+", method: "chip" },
      { q: "What\u2019s your biggest challenge?", a: "8-minute wait times. After-hours unanswered. 60% of calls are routine billing. High staff turnover.", method: "type" },
      { q: "Which inquiries should AI handle?", chips: ["Billing","Outage Status","Service Requests","New Connections"], a: "Billing, Outage Status, Service Requests", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "wait", label: "Zero Wait Times", icon: "bi-clock", sel: true }, { id: "247", label: "24/7 Service", icon: "bi-moon-stars", sel: true }, { id: "satisfy", label: "Member Satisfaction", icon: "bi-emoji-smile", sel: true }],
      systems: [{ id: "member", label: "Member Services Engine", icon: "bi-headset", color: "info", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Routes inquiries to the right AI agent and escalates complex issues to humans" },
      { name: "Member Service Bot", dept: "Customer Support", primary: true, role: "Handles billing, payments, usage inquiries, and account changes 24/7" },
      { name: "Outage Reporter", dept: "Customer Support", role: "Provides real-time outage status, ETAs, and restoration updates" }
    ],
    kpis: { savings: 145, savings_suf: "K", revenue: 210, revenue_suf: "K", roi: 290, agents: 3 },
    sim: [
      { agent: "AI Control Tower", action: "Active: 47 simultaneous member conversations across phone, text, chat", narr: "AI handles 47 conversations at once." },
      { agent: "Member Service Bot", action: "Resolved billing inquiry for #78421 in 23 seconds \u2014 no hold time", narr: "Members get instant answers." },
      { agent: "Outage Reporter", action: "Sent proactive updates to 1,200 affected members with ETAs", narr: "Members get updates before they call." },
      { agent: "Member Service Bot", action: "After-hours: 34 service requests processed between 9 PM and 6 AM", narr: "24/7 service without overnight staffing." },
      { agent: "AI Control Tower", action: "Escalated 3 complex complaints to humans with full context", narr: "AI handles routine, humans handle complex." },
      { agent: "Member Service Bot", action: "Weekly: 45% fewer calls, member satisfaction up 22%", narr: "Fewer calls, happier members, lower costs." }
    ],
    narr: { idea: "Imagine every member getting instant answers 24/7...", questions: "The AI advisor learns about your member service operations...", design: "AI recommends member services and intelligent routing...", results: "Your AI system: 3 agents, 45% fewer calls, 24/7 service.", sim: "Watch AI handle 47 member conversations simultaneously." }
  },
  {
    id: "utility-fleet", industry: "Fleet & Crew Dispatch",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "We have 200+ crew members and 85 vehicles. Dispatching is manual \u2014 supervisors call crews one by one. During emergencies, it takes 2+ hours to coordinate.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional electric cooperative with 200+ field crew, 85 vehicles. Manual dispatch averages 2+ hours for emergency coordination.", method: "type" },
      { q: "Fleet size?", chips: ["Under 25","25-50","50-100","100+"], a: "50-100", method: "chip" },
      { q: "What\u2019s your dispatch challenge?", a: "Manual phone calls. No real-time tracking. 2+ hours for storm coordination. Wasted drive time.", method: "type" },
      { q: "What would help most?", chips: ["Auto Dispatch","Route Optimization","Real-time Tracking","Priority Scheduling"], a: "Auto Dispatch, Route Optimization, Priority Scheduling", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "speed", label: "Faster Response", icon: "bi-lightning", sel: true }, { id: "efficiency", label: "Route Efficiency", icon: "bi-geo-alt", sel: true }, { id: "emergency", label: "Emergency Coordination", icon: "bi-exclamation-triangle", sel: true }],
      systems: [{ id: "dispatch", label: "Dispatch Engine", icon: "bi-truck", color: "success", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Coordinates all field operations and prioritizes jobs by severity and member impact" },
      { name: "Crew Dispatcher", dept: "Field Services", primary: true, role: "Auto-assigns crews based on location, skills, availability, and priority" },
      { name: "Route Optimizer", dept: "Field Services", role: "Calculates optimal routes, reducing windshield time by 28%" }
    ],
    kpis: { savings: 195, savings_suf: "K", revenue: 310, revenue_suf: "K", roi: 250, agents: 3 },
    sim: [
      { agent: "AI Control Tower", action: "Morning: 47 work orders, 85 vehicles available. Optimizing.", narr: "AI sees every job and crew simultaneously." },
      { agent: "Crew Dispatcher", action: "Auto-assigned 47 jobs to 32 crews in 8 seconds", narr: "2 hours of phone calls done in 8 seconds." },
      { agent: "Route Optimizer", action: "Optimized all 32 routes \u2014 saving 340 miles total", narr: "Less windshield time, more wrench time." },
      { agent: "AI Control Tower", action: "Emergency: Downed line on Hwy 7. Nearest crew ETA 14 min", narr: "Emergency response in minutes, not hours." },
      { agent: "Crew Dispatcher", action: "Auto-reassigned 3 non-urgent jobs for emergency priority", narr: "AI rebalances without manual intervention." },
      { agent: "AI Control Tower", action: "Monthly: 28% faster restoration, $195K reduced costs", narr: "Crews get to the right place faster, every time." }
    ],
    narr: { idea: "Imagine dispatching 200 crew members in seconds instead of hours...", questions: "The AI advisor learns about your field operations...", design: "AI recommends dispatch optimization and fleet tracking...", results: "Your AI system: 3 agents, 28% faster response, $195K savings.", sim: "Watch AI dispatch 32 crews to 47 jobs in 8 seconds." }
  },
  {
    id: "utility-compliance", industry: "Regulatory Compliance",
    company: { name: "PeakGrid Energy", size: "850 employees" },
    idea: "NERC, FERC, and state PUC compliance consumes one full-time employee. Reports are manual, error-prone, and stressful before deadlines. We want AI to auto-generate reports from operational data.",
    questions: [
      { q: "What does your cooperative do?", a: "Regional cooperative subject to NERC reliability standards, FERC reporting, and state PUC oversight.", method: "type" },
      { q: "Reports per year?", chips: ["Under 10","10-25","25-50","50+"], a: "25-50", method: "chip" },
      { q: "What\u2019s your challenge?", a: "One FTE assembles reports manually from 8 systems. Audit errors are embarrassing. Deadline pressure is constant.", method: "type" },
      { q: "What would help most?", chips: ["Auto Reporting","Continuous Monitoring","Audit Preparation","Gap Detection"], a: "Auto Reporting, Continuous Monitoring", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "auto", label: "Auto Reports", icon: "bi-file-earmark-check", sel: true }, { id: "monitor", label: "Continuous Monitoring", icon: "bi-shield-check", sel: true }],
      systems: [{ id: "comp", label: "Compliance Engine", icon: "bi-shield-check", color: "success", sel: true }, { id: "tower", label: "AI Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Monitors all regulatory requirements and deadlines, triggers report generation" },
      { name: "Compliance Reporter", dept: "Compliance", primary: true, role: "Auto-generates NERC, FERC, and state PUC reports from live operational data" }
    ],
    kpis: { savings: 120, savings_suf: "K", revenue: 0, revenue_suf: "", roi: 240, agents: 2 },
    sim: [
      { agent: "AI Control Tower", action: "Dashboard: 3 NERC reports due in 14 days, 1 FERC in 30 days", narr: "AI tracks every deadline." },
      { agent: "Compliance Reporter", action: "Auto-generated NERC CIP-002 from operational data \u2014 0 manual entries", narr: "Reports from live data, not spreadsheets." },
      { agent: "Compliance Reporter", action: "Gap: Substation 7 missing quarterly inspection record", narr: "Catches gaps before auditors do." },
      { agent: "AI Control Tower", action: "Auto-notified maintenance \u2014 inspection deadline in 5 days", narr: "AI triggers corrective actions, not just flags." },
      { agent: "Compliance Reporter", action: "Monthly: 12 reports filed, 0 errors, 3 gaps resolved", narr: "90% less manual compliance work." },
      { agent: "AI Control Tower", action: "Audit prep: All docs pre-assembled. Audit time reduced 60%", narr: "Walk into audits with confidence." }
    ],
    narr: { idea: "Imagine compliance reports that write themselves...", questions: "The AI advisor learns about your regulatory requirements...", design: "AI recommends compliance automation and monitoring...", results: "Your AI system: 2 agents, 90% less manual work, zero errors.", sim: "Watch AI generate compliance reports automatically." }
  }
];
