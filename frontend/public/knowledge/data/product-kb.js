/* ============================================================
   Colaberry Knowledge Base - Product & Platform domain data
   The student platform and the Colaberry AI Membership as a
   product. Public-safe only: what a member or prospect sees.
   Excludes internal infrastructure, hosting, domains in flux,
   launch-gate status, and engineering detail.
   Grounded in Ali-confirmed membership facts (2026-06-25) and
   the membership landing personas (working professionals,
   beginners, builders).
   Schema: { categories:[{key,title}], qa:[{category,q,a,detail?,tags}] }
   Voice: warm, sentence case, no emoji, no em-dash.
   ============================================================ */
window.PRODUCT_DATA = {
  categories: [
    { key: "platform",   title: "The student platform" },
    { key: "membership", title: "The membership & what's included" },
    { key: "tracks",     title: "Membership tracks" },
    { key: "tools",      title: "AI tools & costs" },
    { key: "access",     title: "Getting started" }
  ],
  qa: [
    // platform
    { category:"platform", tags:["platform","what","student","online"],
      q:"What is the student platform?",
      a:"The Accelerator runs on Colaberry's online student platform. It is where you take the live classes, follow the curriculum, track your progress through the levels, and do the program end to end, all from your browser." },
    { category:"platform", tags:["access","where","anywhere","browser"],
      q:"Where and how do I access the program?",
      a:"Everything is online. You join the live classes and use the platform from any modern browser, so you can take part from anywhere." },
    { category:"platform", tags:["design system","brand","look"],
      q:"Is the platform built on the Colaberry design system?",
      a:"Yes. The platform and the program materials use the Colaberry design system, the same brand and component language documented in the Design section of this knowledge base, so everything feels like one product." },

    // membership
    { category:"membership", tags:["membership","what is","full program","included"],
      q:"What is the Colaberry AI Membership?",
      a:"It is the product that gives you the full AI Systems Architect Accelerator: all four intensives, certification prep, the full-time internship, and a guided portfolio, with no separate course fees. The membership is the program." },
    { category:"membership", tags:["pricing","plans","founding","149","199"],
      q:"What are the plans and pricing?",
      a:"Two plans. $149 a month billed annually, the founding rate that locks for the life of your membership, or $199 a month month to month, which you can cancel anytime. The Founding Cohort is the first cohort at the locked founding rate." },
    { category:"membership", tags:["bundle","per course","499","1497","replaced"],
      q:"Is there still a separate per-course or bundle fee?",
      a:"No. The membership replaced the older per-intensive and bundle pricing. One membership covers the whole program." },

    // tracks
    { category:"tracks", tags:["personas","tracks","beginners","builders","professionals"],
      q:"Are there different paths for different starting points?",
      a:"Yes. There are membership paths for working professionals, for beginners, and for builders, so the on-ramp matches where you are starting from. All paths lead into the same Accelerator." },

    // tools
    { category:"tools", tags:["tools","claude code","api","costs","third party"],
      q:"What AI tools will I use, and what do they cost?",
      a:"You build with Claude Code and the Claude API throughout the program. Those are third-party tools you pay for directly: an Anthropic subscription for Claude Code is about $20 a month, and your own LLM API usage is usually under $10 a month per project. Colaberry discloses these before you enroll, and they are on top of your membership." },
    { category:"tools", tags:["why claude","anthropic","powered by"],
      q:"Why does Colaberry build the program on Claude and Anthropic?",
      a:"The Accelerator is powered by Anthropic and Claude Code, so you learn on the same tools professionals use to build real AI systems. That is also why you work toward the Anthropic Architect certification." },

    // access
    { category:"access", tags:["start","open house","enroll","first step"],
      q:"How do I get started?",
      a:"Start at the free Open House on Thursday, July 16, 2026 to see the program, then join the Founding Cohort, which begins Thursday, July 23, 2026. You reserve a free Open House seat first, then enroll." }
  ]
};
