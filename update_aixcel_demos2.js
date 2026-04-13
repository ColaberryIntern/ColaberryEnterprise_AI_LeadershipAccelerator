const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./frontend/src/config/demoScenarios.json', 'utf8'));

const updates = {
  'aixcel-eos-blueprint': {
    sim: [
      { agent: "Coach Action", action: "You texted your $8M manufacturing client: 'I found a tool that maps AI opportunities for your business. Takes 10 minutes. Here is the link.' That is all you did.", narr: "YOUR ONLY STEP: Send the link. The AI Workforce Designer does everything else. You do not schedule a meeting. You do not explain AI. You send a link.", is_hitl: true },
      { agent: "Client Assessment", action: "YOUR CLIENT opened the link at 9:14 PM from their phone. They described their challenge: manual production scheduling, quality defects caught late, no demand forecasting.", narr: "THE CLIENT does this on their own time, on their own device. No meeting with you. No meeting with us. They type their real business problems." },
      { agent: "AI Workforce Designer", action: "THE CLIENT answered 10 questions in 12 minutes. The AI detected manufacturing industry, identified 8 AI opportunities, and ranked them by ROI: scheduling ($340K), quality ($210K), forecasting ($180K).", narr: "THE CLIENT sees their results immediately. AI org chart. Ranked use cases. ROI projections. All generated from their answers. They did this themselves." },
      { agent: "Blueprint Generated", action: "THE CLIENT's Blueprint is complete: 10-agent AI workforce designed, $730K annual benefit calculated, implementation roadmap built. Professional PDF ready for download.", narr: "THE CLIENT now has a complete AI Blueprint. They went through the tool. They got their results. You have not done any work yet." },
      { agent: "Coach Review (Human)", action: "YOU review the Blueprint before the quarterly. You add one note: 'CEO is conservative. Start with quality inspection. He mentioned defects last session.' You approve it.", narr: "NOW you do your 2 minutes of work. You add the relationship context only you know. This is what makes you valuable. The AI built it. You made it land.", is_hitl: true },
      { agent: "Revenue", action: "You present the Blueprint at the quarterly session. CEO approves 2 AI Rocks for Q3. You earned $1,750. Total time invested: sending 1 text + 2 minutes of review.", narr: "$1,750 for sending a link and spending 2 minutes adding context. The client did all the work. You delivered all the value. At 2 clients per month, that is $3,500 additional income." }
    ]
  },
  'aixcel-vistage-group': {
    sim: [
      { agent: "Chair Action", action: "At your group meeting, you said: 'I found an AI tool that maps opportunities for your specific business. Takes 10 minutes. I am sending the link to all of you.' You shared the link in the group chat.", narr: "YOUR ONLY STEP: Share the link with the group. 30 seconds of your time. The rest happens without you.", is_hitl: true },
      { agent: "Members Self-Serve", action: "YOUR MEMBERS started clicking: restaurant CEO at lunch, HVAC owner after dinner, staffing CEO on the train. 6 of 16 completed the assessment within 48 hours.", narr: "EACH MEMBER does this on their own. Different times, different devices. Nobody scheduled a meeting. Nobody asked you a question. They just went through it." },
      { agent: "AI Workforce Designer", action: "6 MEMBERS got 6 different Blueprints: Restaurant ($340K benefit, 8 agents), HVAC ($1.2M, 12 agents), Staffing ($420K, 9 agents), Law Firm ($280K, 7 agents), Ecommerce ($890K, 10 agents), Construction ($780K, 11 agents).", narr: "EACH MEMBER sees results customized to their industry, their size, their challenges. The HVAC company gets completely different recommendations than the law firm. All automatic." },
      { agent: "Blueprints Ready", action: "All 6 Blueprints are complete. Each has: AI org chart, ranked use cases, ROI projections, implementation roadmap. Professional PDFs ready. You have not done any work yet.", narr: "6 CLIENTS did 6 assessments. 6 Blueprints generated. You sent one link to a group chat. That is the total effort so far." },
      { agent: "Chair Review (Human)", action: "YOU spend 10 minutes reviewing all 6 Blueprints. You add one note to each: 'HVAC CEO ready to invest.' 'Law firm needs conservative approach.' 'Construction CEO skeptical but numbers compelling.'", narr: "NOW you do your 10 minutes of work. A quick note on each one. Your relationship knowledge makes generic AI output feel personal and thoughtful.", is_hitl: true },
      { agent: "Revenue", action: "You deliver 6 Blueprints at the next group meeting. Each member pays $2,500. You keep 70%. Your earnings: 6 x $1,750 = $10,500. Three members ask about implementation.", narr: "$10,500 from sharing a link in a group chat and spending 10 minutes on review. Your members did all the work. You delivered all the value. Three want Acceleration retainers next quarter." }
    ]
  },
  'aixcel-acceleration-upsell': {
    sim: [
      { agent: "Client Self-Served", action: "YOUR CLIENT went through the AI Workforce Designer last quarter. They loved their Blueprint: 8 AI use cases, $730K annual benefit. Leadership approved the top 3. Now they want real systems.", narr: "THE CLIENT drove this. They went through the assessment. They showed the Blueprint to their team. They decided to move forward. You facilitated, not sold." },
      { agent: "Acceleration Starts", action: "AIXcelerator begins building the 3 approved AI agents. Connecting to the client's existing Samsara fleet management and DAT rate tools. No rip-and-replace.", narr: "THE CLIENT's existing tools get connected. AIXcelerator builds the agents. You do not touch the technical side. Nobody asks you to." },
      { agent: "First Agent Live", action: "Route Optimization agent deployed for YOUR CLIENT. First week: 12% fewer empty miles, $8,400 saved. Client CEO texts you: 'This is actually working.'", narr: "THE CLIENT sees real results in week one. Not a plan. Not a PowerPoint. Working AI saving real money. And they tell you about it because you are their coach." },
      { agent: "Coach Quarterly (Human)", action: "YOU present AI progress at the quarterly OPSP session. Route optimization: $12K/month saved. You ask: 'Which 2 use cases should we add next quarter?' CEO picks carrier matching and load planning.", narr: "YOUR ROLE: facilitate the strategic conversation. The same thing you already do. AI progress is now a standing agenda item alongside Rocks and KPIs. Natural fit.", is_hitl: true },
      { agent: "Results Compound", action: "Quarter 1 results for YOUR CLIENT: 3 agents deployed, $36K saved, 2 new use cases approved. Client NPS for your coaching increased. They referred you to another CEO.", narr: "THE CLIENT got real AI results. Your coaching practice got stickier. The client is happier. They referred a friend. Everyone won." },
      { agent: "Revenue", action: "Acceleration retainer: $5,000/month. Your referral bonus: $500/month recurring. Total from this one client: $1,750 Blueprint + $500/month ongoing. No technical work. Ever.", narr: "$1,750 from the Blueprint plus $500 every single month. One client. Recurring income. All because you sent a link and facilitated conversations you were already having." }
    ]
  }
};

let updated = 0;
all.forEach(s => {
  if (updates[s.id]) {
    s.sim = updates[s.id].sim;
    updated++;
  }
});

fs.writeFileSync('./frontend/src/config/demoScenarios.json', JSON.stringify(all));
console.log("Updated", updated, "demos with clear CLIENT/COACH separation");
