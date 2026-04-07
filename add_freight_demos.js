const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./frontend/src/config/demoScenarios.json', 'utf8'));

// Remove any existing freight demos
const filtered = all.filter(s => !s.id.startsWith('freight-'));

const freightDemos = [
  {
    id: "freight-billing", industry: "Freight Billing Engine",
    company: { name: "SwiftFreight Logistics", size: "150 employees" },
    idea: "We process 3,000 shipments per month but billing takes 3-5 days per load because we are chasing documents, validating rates manually against rate confirmations, and fighting accessorial disputes. Detention and lumper charges are the biggest headache.",
    questions: [
      { q: "What does your company do?", a: "Mid-size freight brokerage handling 3,000+ shipments monthly across truckload and LTL.", method: "type" },
      { q: "Biggest billing challenge?", chips: ["Document Delays","Rate Errors","Accessorial Disputes","Slow Billing"], a: "Document Delays, Accessorial Disputes", method: "chip", multi: true },
      { q: "How do you handle billing today?", a: "Pull load from TMS, manually check rate confirmation, chase POD via email, calculate detention from timestamps. Spreadsheets and emails.", method: "type" },
      { q: "What causes the most disputes?", chips: ["Detention","Rate Mismatches","Missing Documents","Wrong References"], a: "Detention, Missing Documents", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "speed", label: "Same-Day Billing", icon: "bi-lightning", sel: true }, { id: "accuracy", label: "Eliminate Rate Errors", icon: "bi-check-circle", sel: true }, { id: "evidence", label: "Evidence-Backed Charges", icon: "bi-file-earmark-check", sel: true }],
      systems: [{ id: "billing", label: "Freight Billing Accuracy Engine", icon: "bi-calculator", color: "warning", sel: true }, { id: "tower", label: "AI Financial Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates billing pipeline from document receipt to charge lock" },
      { name: "AI Document Classifier", dept: "Billing", primary: true, role: "Classifies BOL, POD, lumper receipts, rate confirmations with confidence scoring" },
      { name: "AI Rate Validator", dept: "Billing", primary: true, role: "Compares charges against contracted rates, fuel surcharge tables, and customer SOPs" },
      { name: "AI Accessorial Auditor", dept: "Billing", role: "Validates detention, layover, TONU, lumper charges against evidence requirements" },
      { name: "AI Bill Lock Agent", dept: "Billing", role: "Locks charge package when all evidence requirements are met per customer policy" },
      { name: "AI Detention Calculator", dept: "Operations", role: "Computes detention from appointment timestamps, check-in/out records, and GPS data" },
      { name: "AI Fuel Surcharge Engine", dept: "Finance", role: "Applies correct fuel surcharge per customer contract from DOE weekly index" },
      { name: "AI SOP Rules Engine", dept: "Compliance", role: "Enforces customer-specific billing rules, references, document requirements, and deadlines" }
    ],
    kpis: { savings: 702, savings_suf: "K", revenue: 0, revenue_suf: "", roi: 340, agents: 8 },
    sim: [
      { agent: "AI Control Tower", action: "Load #4821 delivered. Initiating billing pipeline. Scanning for POD and rate confirmation.", narr: "Every delivered load automatically enters the billing pipeline." },
      { agent: "AI Document Classifier", action: "POD received via email. Classified with 96% confidence. Extracted: recipient signature, delivery timestamp, no damage notes.", narr: "AI reads the POD, extracts every field, and validates completeness in seconds." },
      { agent: "AI Rate Validator", action: "Linehaul confirmed: $2,850 matches rate confirmation RC-4821. Fuel surcharge: $342 (DOE week 14).", narr: "Rate validation against the contract happens instantly." },
      { agent: "Billing Supervisor (Human)", action: "Reviewed and approved: detention charge of $1,450 flagged by AI Accessorial Auditor (confidence 78%). Timestamps verified.", narr: "AI flags uncertain charges for human review. Supervisor approves in 30 seconds.", is_hitl: true },
      { agent: "AI Bill Lock Agent", action: "All evidence met: POD with signature, rate confirmation match, detention pre-approval on file. Charge package locked: $4,642.", narr: "The billing package is complete. No missing documents, no unapproved charges." },
      { agent: "AI Control Tower", action: "Billing complete: Load #4821 billed in 4 minutes. Industry average: 3-5 days.", narr: "What used to take days of chasing documents now happens in minutes." }
    ],
    narr: { idea: "Imagine every load billed the same day it delivers...", questions: "The AI advisor learns about your billing challenges...", design: "AI recommends a freight billing accuracy engine...", results: "Your Billing Engine: 8 agents, same-day billing, $702K savings.", sim: "Watch AI bill a load in 4 minutes that used to take 3-5 days." }
  },
  {
    id: "freight-invoice", industry: "Freight Invoice Engine",
    company: { name: "SwiftFreight Logistics", size: "150 employees" },
    idea: "Our invoices get rejected 15% of the time because of missing PODs, wrong reference numbers, or formatting issues. Average DSO is 45 days and we lose track of which invoices were acknowledged versus accepted.",
    questions: [
      { q: "What does your company do?", a: "Freight brokerage processing 3,000+ invoices monthly to enterprise shippers via email, EDI, and portals.", method: "type" },
      { q: "How do you send invoices?", chips: ["Email","EDI (210)","Customer Portals","All of the above"], a: "All of the above", method: "chip" },
      { q: "What causes rejections?", a: "Missing POD attachments, wrong PO numbers, customer-specific formatting requirements we miss.", method: "type" },
      { q: "What is your average DSO?", chips: ["Under 30","30-45 days","45-60 days","Over 60"], a: "45-60 days", method: "chip" }
    ],
    design: {
      outcomes: [{ id: "dso", label: "Reduce DSO", icon: "bi-clock-history", sel: true }, { id: "reject", label: "Zero Rejections", icon: "bi-x-circle", sel: true }],
      systems: [{ id: "invoice", label: "AR Collection & Invoice Intelligence", icon: "bi-receipt", color: "primary", sel: true }, { id: "tower", label: "AI Financial Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates invoice generation, delivery, acceptance tracking, and collection prioritization" },
      { name: "AI Invoice Composer", dept: "Collections", primary: true, role: "Generates invoices with correct charges, documentation bundle, and payer-specific formatting" },
      { name: "AI Document Packager", dept: "Collections", role: "Assembles invoice attachment bundle: POD, BOL, receipts per customer requirements" },
      { name: "AI EDI Formatter", dept: "Technology", role: "Formats invoices as EDI 210 for enterprise shippers, handles 997/824 signals" },
      { name: "AI Collection Prioritizer", dept: "Finance", primary: true, role: "Scores open invoices by collection probability, aging risk, and payment patterns" },
      { name: "AI Short-Pay Reconciler", dept: "Finance", role: "Matches partial payments to invoice lines, identifies disputed amounts automatically" },
      { name: "AI Acknowledgment Tracker", dept: "Collections", role: "Distinguishes technical receipt (997) from business acceptance (824/payment)" }
    ],
    kpis: { savings: 420, savings_suf: "K", revenue: 0, revenue_suf: "", roi: 290, agents: 7 },
    sim: [
      { agent: "AI Control Tower", action: "47 loads ready to invoice today. Routing by customer preference: 28 email, 12 EDI, 7 portal.", narr: "AI knows how each customer wants invoices delivered." },
      { agent: "AI Invoice Composer", action: "Generated invoice #INV-4821: $4,642 with POD, BOL, and detention receipt. Customer PO matched: PO-88721.", narr: "Every reference number, document, and format included automatically." },
      { agent: "AI EDI Formatter", action: "Transmitted EDI 210 to GlobalCorp. Received 997 in 12 seconds. Awaiting 824 business acceptance.", narr: "AI distinguishes receipt from acceptance. 997 = got the file. 824 = agree with charges." },
      { agent: "AR Manager (Human)", action: "Approved: rebill for Acme Shipping with $52K open balance. AI flagged high-risk collection. Manager authorized revised invoice.", narr: "High-value rebills always route to a human. AI handles the routine 85%.", is_hitl: true },
      { agent: "AI Short-Pay Reconciler", action: "GlobalCorp paid $4,200 on $4,642. $442 short-pay mapped to disputed detention line. Residual case opened.", narr: "Partial payments matched to specific line items instantly." },
      { agent: "AI Control Tower", action: "Daily: 47 invoices sent, 0 rejections, 38 acknowledged, 3 short-pays reconciled. DSO trending: 32 days (was 45).", narr: "DSO drops because invoices go out correct, with correct docs, on day one." }
    ],
    narr: { idea: "Imagine every invoice accepted on first submission...", questions: "The AI advisor learns about your invoicing challenges...", design: "AI recommends AR collection and invoice intelligence...", results: "Your Invoice Engine: 7 agents, zero rejections, DSO from 45 to 30 days.", sim: "Watch AI send 47 invoices with zero rejections." }
  },
  {
    id: "freight-dispute", industry: "Freight Dispute Engine",
    company: { name: "SwiftFreight Logistics", size: "150 employees" },
    idea: "We lose $800K per year to disputes. Accessorial denials, rate mismatches, missing PODs. Each dispute takes 8 hours of manual evidence assembly across email threads, TMS records, and call logs.",
    questions: [
      { q: "What does your company do?", a: "Freight brokerage handling 200+ disputes per month. More time on disputes than new loads.", method: "type" },
      { q: "Common disputes?", chips: ["Detention Denials","Rate Mismatches","Missing POD","Late Penalties"], a: "Detention Denials, Rate Mismatches, Missing POD", method: "chip", multi: true },
      { q: "How do you resolve disputes?", a: "Customer emails dispute. Dig through emails, call logs, rate confirmations. Negotiate. Takes days to weeks.", method: "type" },
      { q: "What would help most?", chips: ["Faster Resolution","Better Evidence","Prevent Repeats","Auto-Response"], a: "Better Evidence, Prevent Repeats", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "cost", label: "Cut Dispute Costs 60%", icon: "bi-piggy-bank", sel: true }, { id: "speed", label: "70% Faster Resolution", icon: "bi-lightning", sel: true }, { id: "prevent", label: "Prevent Repeat Disputes", icon: "bi-shield-check", sel: true }],
      systems: [{ id: "dispute", label: "Dispute Resolution Intelligence", icon: "bi-exclamation-triangle", color: "danger", sel: true }, { id: "tower", label: "AI Financial Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Coordinates dispute intake, evidence assembly, response generation, and resolution tracking" },
      { name: "AI Dispute Classifier", dept: "Operations", primary: true, role: "Classifies disputes from email, EDI 824, portal rejections, and short-pay notes" },
      { name: "AI Evidence Binder", dept: "Operations", primary: true, role: "Auto-assembles defense packet: rate confirmation, BOL, POD, timestamps, approvals, GPS data" },
      { name: "AI Response Generator", dept: "Operations", role: "Generates evidence-grounded dispute responses without overstating certainty" },
      { name: "AI Negotiation Tracker", dept: "Finance", role: "Tracks every exchange: sent, offered, accepted, and final disposition" },
      { name: "AI Write-Off Analyzer", dept: "Finance", role: "Identifies write-off patterns by customer, lane, and type. Recommends billing rule changes." },
      { name: "AI Root Cause Detector", dept: "Compliance", role: "Finds systematic issues: SOP misapplication, documentation gaps, accessorial policy failures" },
      { name: "AI Playbook Engine", dept: "Operations", role: "Maintains dispute resolution playbooks by type with expected outcomes" }
    ],
    kpis: { savings: 480, savings_suf: "K", revenue: 0, revenue_suf: "", roi: 310, agents: 8 },
    sim: [
      { agent: "AI Control Tower", action: "Dispute received: Acme rejected detention $1,450 on Load #4821. Reason: unapproved accessorial.", narr: "Dispute intake is automatic. No more buried email discovery." },
      { agent: "AI Dispute Classifier", action: "Classified: accessorial denial, detention, Acme. Matched to playbook DET-01.", narr: "AI knows exactly what type of dispute and which playbook to follow." },
      { agent: "AI Evidence Binder", action: "Defense packet assembled in 8 seconds: rate con, POD timestamp, appointment confirmation, check-in sheet.", narr: "8 hours of evidence assembly done in 8 seconds." },
      { agent: "Finance Controller (Human)", action: "Reviewed dispute response. AI recommends: uphold $1,450 based on contract terms and timestamps. Controller approved.", narr: "AI builds the case. A human reviews before sending. No automated liability admission.", is_hitl: true },
      { agent: "AI Root Cause Detector", action: "Pattern: 12 detention disputes from Acme Chicago warehouse in 90 days. Recommendation: update SOP for Chicago detention pre-approval.", narr: "AI prevents repeat disputes by finding the root cause." },
      { agent: "AI Control Tower", action: "Monthly: 200 disputes, 142 auto-resolved, 38 human-reviewed. Average: 2.4 hours (was 8). $480K saved.", narr: "Disputes become managed process, not fire drill." }
    ],
    narr: { idea: "Imagine assembling dispute evidence in 8 seconds instead of 8 hours...", questions: "The AI advisor learns about your dispute challenges...", design: "AI recommends dispute resolution intelligence with automated evidence binders...", results: "Your Dispute Engine: 8 agents, 70% faster, $480K saved.", sim: "Watch AI resolve a detention dispute with auto-assembled evidence." }
  },
  {
    id: "freight-settlement", industry: "Freight Settlement Engine",
    company: { name: "SwiftFreight Logistics", size: "150 employees" },
    idea: "We pay 300+ carriers monthly but settlement is manual. Matching invoices to rate confirmations, checking for double-brokering, managing quick pay. We have been burned by fraudulent carrier identity twice this year.",
    questions: [
      { q: "What does your company do?", a: "Freight brokerage settling 300+ carrier payments monthly. Mix of ACH, quick pay, and factoring. $3M+ monthly payables.", method: "type" },
      { q: "Biggest challenge?", chips: ["Manual Matching","Fraud Risk","Quick Pay","Duplicate Payments"], a: "Manual Matching, Fraud Risk", method: "chip", multi: true },
      { q: "How do you settle today?", a: "Carrier submits invoice and POD. AP manually matches against rate con and TMS. Validates accessorials. Checks quick pay. Cuts ACH. All manual.", method: "type" },
      { q: "Fraud experience?", chips: ["Double Brokering","Identity Theft","Payee Manipulation","None"], a: "Double Brokering, Payee Manipulation", method: "chip", multi: true }
    ],
    design: {
      outcomes: [{ id: "match", label: "90% Auto-Match", icon: "bi-check2-all", sel: true }, { id: "fraud", label: "Prevent Fraud", icon: "bi-shield-lock", sel: true }, { id: "speed", label: "Same-Day Settlement", icon: "bi-lightning", sel: true }],
      systems: [{ id: "settle", label: "Carrier Settlement & Pay Platform", icon: "bi-bank", color: "success", sel: true }, { id: "fraud", label: "FMCSA Compliance & Fraud Shield", icon: "bi-shield-check", color: "danger", sel: true }, { id: "tower", label: "AI Financial Control Tower", icon: "bi-cpu", color: "dark", sel: true }]
    },
    agents: [
      { name: "AI Control Tower", dept: "Executive", cory: true, role: "Orchestrates settlement from carrier invoice to payment execution and remittance" },
      { name: "AI Three-Way Matcher", dept: "AP", primary: true, role: "Matches carrier invoice to rate confirmation and POD. Flags discrepancies." },
      { name: "AI Payee Verifier", dept: "Compliance", primary: true, role: "Validates carrier identity against FMCSA, flags bank changes, detects factoring redirections" },
      { name: "AI Quick Pay Processor", dept: "Finance", role: "Computes quick pay fees, validates eligibility, routes accelerated payments" },
      { name: "AI Double-Broker Detector", dept: "Compliance", role: "Identifies double-brokering patterns from carrier chains and pricing anomalies" },
      { name: "AI Carrier Identity Checker", dept: "Compliance", role: "Monitors FMCSA authority, insurance, and safety ratings before payment" },
      { name: "AI Payment Executor", dept: "Finance", role: "Executes ACH with EDI 820 remittance, handles factoring redirects" },
      { name: "AI Remittance Generator", dept: "Finance", role: "Creates 820 remittance advice for carrier reconciliation" },
      { name: "AI FMCSA Monitor", dept: "Compliance", role: "Tracks broker surety bond status and carrier authority changes" }
    ],
    kpis: { savings: 525, savings_suf: "K", revenue: 0, revenue_suf: "", roi: 280, agents: 9 },
    sim: [
      { agent: "AI Control Tower", action: "47 carrier invoices received. Initiating three-way match against rate confirmations and PODs.", narr: "Every carrier invoice enters settlement automatically." },
      { agent: "AI Three-Way Matcher", action: "Matched 42 of 47. 5 exceptions: 2 rate mismatches, 2 missing PODs, 1 accessorial dispute.", narr: "90% matched automatically. Only exceptions need humans." },
      { agent: "AI Payee Verifier", action: "ALERT: Carrier MC-88421 bank details changed 24 hours before settlement. Previous: First National. New: offshore. BLOCKED.", narr: "AI catches payee manipulation before money moves." },
      { agent: "AP Manager (Human)", action: "Reviewed blocked payment for MC-88421. Confirmed fraudulent bank change. Payment held. Investigation opened.", narr: "AI blocks suspicious payments. A human investigates and decides.", is_hitl: true },
      { agent: "AI Double-Broker Detector", action: "Risk: Load #5102 priced 22% below market. Carrier MC-77201 subcontracted to unknown MC. Double-brokering detected.", narr: "AI identifies double-brokering before you pay the wrong party." },
      { agent: "AI Control Tower", action: "Daily: 42 carriers paid via ACH with 820 remittance. 1 fraud prevented ($28,400). 3 quick-pay with $1,200 fees earned.", narr: "Settlement becomes predictable, auditable, and fraud-resistant." }
    ],
    narr: { idea: "Imagine settling 300+ carriers monthly with zero fraud...", questions: "The AI advisor learns about your settlement challenges...", design: "AI recommends carrier settlement with fraud detection...", results: "Your Settlement Engine: 9 agents, $525K fraud prevented, 90% auto-matched.", sim: "Watch AI catch a fraudulent bank change before a $28K payment." }
  }
];

filtered.push(...freightDemos);
fs.writeFileSync('./frontend/src/config/demoScenarios.json', JSON.stringify(filtered));
console.log("Added", freightDemos.length, "freight demos. Total scenarios:", filtered.length);
freightDemos.forEach(d => console.log(" ", d.id, ":", d.agents.length, "agents,", d.sim.length, "sim steps (" + d.sim.filter(s => s.is_hitl).length + " HITL)"));
