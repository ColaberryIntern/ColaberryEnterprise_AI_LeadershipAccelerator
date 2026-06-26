/* ============================================================
   Colaberry Knowledge Base - Curriculum & Training domain data
   AI Systems Architect Accelerator, 12 weeks / 4 intensives.
   Grounded in Ali-confirmed program facts (Open House 2026-07-16,
   Cohort 1 kickoff 2026-07-23, $149/$199 membership, Anthropic
   Architect certification) and the Design E curriculum outline.
   Week ranges use the confirmed 1-3 / 4-6 / 7-9 / 10-12 structure;
   sub-course week mapping is left unpinned where sources differ.
   Schema: { categories:[{key,title}], qa:[{category,q,a,detail?,tags}] }
   Voice: warm, sentence case, no emoji, no em-dash.
   ============================================================ */
window.CURRICULUM_DATA = {
  categories: [
    { key: "overview",      title: "Overview & philosophy" },
    { key: "intensives",    title: "The four intensives" },
    { key: "skills",        title: "Tools & skills you build" },
    { key: "experience",    title: "Project, internship & portfolio" },
    { key: "levels",        title: "Levels & progression" },
    { key: "certification", title: "Certification" },
    { key: "logistics",     title: "Format, schedule & dates" }
  ],
  qa: [
    // overview
    { category:"overview", tags:["what","overview","12 weeks","project based"],
      q:"What is the AI Systems Architect Accelerator curriculum?",
      a:"It is a 12-week, project-based program that moves you from AI consumer to AI builder, powered by Anthropic and Claude Code. You learn by building real systems rather than watching lectures, and the work is organized into four intensives that each end in something you have actually shipped." },
    { category:"overview", tags:["philosophy","approach","learn build deploy"],
      q:"What is the teaching philosophy?",
      a:"Learn with Claude, build through Colaberry, deploy in the real world. Every concept is paired with a hands-on build, and an internship and portfolio run alongside the classes so you apply each skill as you learn it instead of saving it for later." },
    { category:"overview", tags:["who for","working professionals","career changers"],
      q:"Who is the curriculum built for?",
      a:"Working professionals, career changers, builders, and technical professionals who want to go from using AI to architecting it. No degree and no tests are required to begin, and the difficulty ramps as your foundation grows." },

    // intensives
    { category:"intensives", tags:["structure","four intensives","weeks","phases"],
      q:"What are the four intensives?",
      a:"Build your AI foundation (weeks 1 to 3), create your AI team (weeks 4 to 6), connect AI to the real world (weeks 7 to 9), and design AI that scales (weeks 10 to 12). Each intensive builds on the one before it, finishing with a capstone you present at the Architect Expo.",
      detail:"The four intensives are the spine of the program; the project, internship, certification, and portfolio lanes run in parallel around them." },
    { category:"intensives", tags:["intensive 1","foundation","claude code","agent skills","api"],
      q:"What happens in intensive one, build your AI foundation?",
      a:"Weeks 1 to 3 give you a working foundation with Claude Code: the fundamentals of Claude Code, building your first agent skills, and using the Claude API to stand up a simple workflow assistant. You finish able to build and run basic AI workflows yourself." },
    { category:"intensives", tags:["intensive 2","ai team","prompt engineering","mcp","subagents"],
      q:"What happens in intensive two, create your AI team?",
      a:"Weeks 4 to 6 are about getting multiple agents to work together: prompt engineering, the Model Context Protocol and advanced MCP, and subagents and multi-agent patterns. You learn to design an AI team, not just a single assistant." },
    { category:"intensives", tags:["intensive 3","real world","workflows","automation","reliability"],
      q:"What happens in intensive three, connect AI to the real world?",
      a:"Weeks 7 to 9 connect your agents to real systems through workflows and automation, with a focus on reliability, so your AI does dependable work against real data and tools instead of one-off demos." },
    { category:"intensives", tags:["intensive 4","scale","governance","architecture","capstone","expo"],
      q:"What happens in intensive four, design AI that scales?",
      a:"Weeks 10 to 12 take you to architect level: governance, systems architecture, and a capstone you present at the Architect Expo. You leave with a real, scaled system and the judgment to design more like it." },

    // skills
    { category:"skills", tags:["tools","claude code","mcp","claude api","skills list"],
      q:"What tools and skills will I learn?",
      a:"Claude Code, the Claude API, agent skills, the Model Context Protocol and multi-agent orchestration with subagents, workflow automation, and the reliability, governance, and systems-architecture practices that hold real AI systems together." },
    { category:"skills", tags:["programmer","coding","non technical","ramp"],
      q:"Do I need to be a programmer to keep up?",
      a:"No. The program is built so working professionals and career changers can learn to build with AI. You work hands-on with Claude Code from week one, and each intensive layers on the next skill as your foundation grows." },
    { category:"skills", tags:["building","what it looks like","hands on","capstone"],
      q:"What does building with Claude actually look like week to week?",
      a:"You use Claude Code as your building environment from the start, then add agent skills, the Claude API, and MCP so your agents can use real tools and data. By the capstone you are orchestrating several agents into a system that does real work." },

    // experience
    { category:"experience", tags:["lanes","parallel","project","internship","portfolio"],
      q:"What runs alongside the classes?",
      a:"Four lanes run in parallel and schedule around your fixed class times: a guided project build, a full-time internship, certification prep, and a portfolio you grow the whole way through. The classes teach the skill, and the lanes are where you apply it." },
    { category:"experience", tags:["internship","real work","full time"],
      q:"Tell me about the internship.",
      a:"A full-time internship runs alongside the program so you are applying what you learn on real work, not just exercises. It is one of the parallel lanes that schedule around your classes." },
    { category:"experience", tags:["portfolio","outcome","leave with","proof"],
      q:"What do I leave the program with?",
      a:"A portfolio of real systems you built, a capstone you present at the Architect Expo, internship experience, and certification prep, all pointed at being able to architect AI systems in the real world." },

    // levels
    { category:"levels", tags:["levels","progression","apprentice","builder","architect","principal"],
      q:"How does progression through the program work?",
      a:"You move through four levels as you build: apprentice, builder, architect, and principal architect. The levels track real capability, from running your first agent to designing systems that scale." },

    // certification
    { category:"certification", tags:["certification","anthropic","architect","credential"],
      q:"What certification do I work toward?",
      a:"You prepare for the Anthropic Architect certification. Certification prep is one of the lanes that runs alongside the program, so you are getting ready for it as you build." },

    // logistics
    { category:"logistics", tags:["length","format","online","live classes"],
      q:"How long is the program and what is the format?",
      a:"Twelve weeks, project-based, delivered through live online classes, with the parallel project, internship, certification, and portfolio lanes running around them." },
    { category:"logistics", tags:["dates","start","open house","kickoff","july"],
      q:"When does it start?",
      a:"The free Open House is Thursday, July 16, 2026, and the first Founding Cohort class is Thursday, July 23, 2026. The Open House comes one week before the cohort it feeds, so you can see the program before you commit." },
    { category:"logistics", tags:["cost","included","membership","price","tool costs"],
      q:"What is included and what does it cost to join?",
      a:"All four intensives, certification prep, the full-time internship, and the guided portfolio are included in the Colaberry AI Membership. The founding rate is $149 a month billed annually, or $199 a month month to month. You also cover your own third-party tool costs, an Anthropic subscription for Claude Code (about $20 a month) and light LLM API usage (most projects under $10 a month), paid directly to those providers." }
  ]
};
