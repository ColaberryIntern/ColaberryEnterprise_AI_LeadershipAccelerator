// Content contract + data for the AI Membership persona landing pages.
// Copy authored by Sohail Syed on BC todo 9946499609 (2026-06-17), upgraded to the
// "One Class, Many Doors" strategy (one cohort/class entered via two doors:
// Door A self-serve $149/mo membership, Door B employer-sponsored seats redeemed by
// code). Treated as the working source draft pending Sohail's sign-off; edit here,
// not in the template. The PersonaContent interface/shape is frozen — only content
// values change. Door-B sponsorship + seat-code redemption is woven into existing
// fields (gap/builtFor/openHouse/finalCta), never new interface keys.

export interface BuildPhase {
  weeks: string;
  title: string;
  desc: string;
}

export interface PersonaContent {
  slug: 'working-professionals' | 'beginners' | 'builders';
  seo: { title: string; description: string };
  hero: { headline: string; body: string[]; price: string; cta: string };
  gap: { title: string; body: string[]; list?: string[] };
  builtFor: { title: string; intro?: string; idealFor: string[]; closing: string[] };
  learn: { title: string; intro: string; items: string[]; goal: string };
  practice?: { title: string; body: string[] };
  buildPath?: { title: string; phases: BuildPhase[] };
  openHouse: { title: string; intro: string; items: string[]; cta: string };
  transformation: { before: string[]; after: string[] };
  different?: { title: string; body: string[] };
  finalCta: { title: string; body: string[]; price: string; tagline: string };
}

const PRICE = 'Membership starts at $149/month. Sponsored by your employer? Redeem your seat code — no card needed.';
const TAGLINE = 'Learn With Claude. Build Through Colaberry. Deploy In The Real World.';
const PRIMARY_CTA = 'Join The Challenge';
const SEAT_CTA = 'Reserve My Free Seat';

// The one line that appears at the close of every persona: the Door-B invitation.
// Routes (conceptually) to seat-code redemption — employer sponsors annual seats,
// you redeem the code, learn on your own time, climb the company leaderboard.
const SPONSOR_LINE =
  'Is your employer sponsoring you? Enter your seat code to unlock the same class — no membership charge, just your code.';

export const workingProfessionals: PersonaContent = {
  slug: 'working-professionals',
  seo: {
    title: 'Learn To Build With AI — Skills You Can Use At Work',
    description:
      'One class, two doors. Working professionals join Colaberry’s AI cohort to learn with Claude and build real projects — self-serve at $149/month, or redeem an employer-sponsored seat code. Start at the free Open House.',
  },
  hero: {
    headline: 'Most People Consume AI. You’ll Learn To Build With It.',
    body: [
      'AI is changing every role — but consuming AI and building with it are not the same skill.',
      'This is one class, entered through two doors. Join as an individual for $149/month, or redeem a seat code your employer sponsored. Either door, same cohort: you learn with Claude, build real projects on your own time, and prove what you can actually ship.',
      'Start at our free Open House and see how working professionals turn AI from a buzzword into a workflow.',
    ],
    price: PRICE,
    cta: PRIMARY_CTA,
  },
  gap: {
    title: 'Consuming AI Is Easy. Building With It Is Rare.',
    body: [
      'Almost everyone on your team is experimenting with AI tools. Very few are learning to build with AI — to wire it into real research, analysis, and decision-making.',
      'Most professionals stall at clever prompts. The advantage goes to the people who can design a workflow, connect AI to real data, and ship something that holds up at work.',
      'That building skill is exactly what this cohort develops — through one class you can enter on your own, or through a seat your employer sponsors.',
      'Whichever door you walk through, you end up in the same room: learning by building, not just watching.',
    ],
  },
  builtFor: {
    title: 'Built For Working Professionals',
    intro:
      'Designed for professionals who want to stay relevant — and for employers who want to discover who their real AI builders are, without pulling anyone off the job.',
    idealFor: [
      'Business Analysts',
      'Project Managers',
      'Product Managers',
      'Operations Professionals',
      'Marketing Professionals',
      'HR Professionals',
      'Consultants',
      'Managers and Team Leads',
    ],
    closing: [
      'You do not need to become a machine learning engineer — you need practical AI skills you can apply at work.',
      'Two doors, one class: join yourself for $149/month, or redeem an employer-sponsored seat code and learn on your own time.',
    ],
  },
  learn: {
    title: 'Learn With Claude, Build For Real',
    intro: 'Inside the cohort, you will learn to use Claude to actually build — not just chat:',
    items: [
      'Research and analysis you can defend',
      'Planning and documentation that ships',
      'Reusable AI workflows, not one-off prompts',
      'Solving real business problems end to end',
      'AI-assisted project development',
      'Use cases drawn from your own role',
    ],
    goal: 'The goal is simple: stop consuming AI and start building with it as a practical work partner.',
  },
  practice: {
    title: 'Build Through Real Projects',
    body: [
      'Learning about AI is not the same as building with it. You need reps.',
      'Inside the cohort you work real projects that show AI doing real work — in operations, analysis, workflows, and problem solving — on your own time, at your own pace.',
      'You learn by building. You learn by applying. You learn by shipping something you can demo.',
      'And at Demo Day, you present what you built — the clearest proof of who can really build with AI.',
    ],
  },
  openHouse: {
    title: 'What You Will Explore In The Free Open House',
    intro: 'During the Open House, you will see:',
    items: [
      'How one class works through two doors — individual or employer-sponsored',
      'How working professionals learn to build with Claude, not just use it',
      'How real projects turn AI skills into work you can demo',
      'How employers sponsor seats to discover their real AI builders',
      'How to join yourself for $149/month',
      'How to redeem an employer seat code if your company is sponsoring you',
    ],
    cta: SEAT_CTA,
  },
  transformation: {
    before: [
      'You know AI is important and you’ve tried a few tools.',
      'But you’re still consuming AI, not building with it.',
      'You can’t yet point to something you shipped with AI at work.',
    ],
    after: [
      'You use Claude and real AI workflows to solve real problems.',
      'You’ve built and demoed work that applies AI to your actual role.',
      'You can speak — and build — confidently across AI use cases.',
      'You’re visibly one of the people who builds with AI, not just talks about it.',
    ],
  },
  different: {
    title: 'Why This Is Different',
    body: [
      'Most AI courses teach tools and prompts, then leave you with information and no reps. You finish knowing about AI without having built anything.',
      'Colaberry runs one class, entered through two doors — you self-serve, or your employer sponsors your seat — and both lead to the same outcome: you build.',
      'You learn with Claude, build through real projects, present at Demo Day, and keep improving every month. The deliverable isn’t a certificate — it’s proof you can build.',
    ],
  },
  finalCta: {
    title: 'Join The Free Open House',
    body: [
      'See the class behind both doors, and choose yours.',
      'Join the challenge yourself for $149/month, or sponsor your team and discover who your real AI builders are — without taking anyone off the job.',
      SPONSOR_LINE,
    ],
    price: PRICE,
    tagline: TAGLINE,
  },
};

export const beginners: PersonaContent = {
  slug: 'beginners',
  seo: {
    title: 'Start Building With AI — Even If You’re A Beginner',
    description:
      'One class, two doors. Beginners, students, and career switchers learn to build with Claude through guided projects — self-serve at $149/month, or redeem an employer-sponsored seat code. Start at the free Open House.',
  },
  hero: {
    headline: 'Most People Consume AI. You Can Learn To Build With It.',
    body: [
      'AI is creating new opportunities everywhere — but most people only ever learn to consume it. Very few learn to build.',
      'This is one class, entered through two doors. Start as an individual for $149/month, or redeem a seat code your employer sponsored. Either way, same cohort: a clear, step-by-step path to building real things with Claude, even from zero.',
      'Start at our free Open House and see exactly where to begin.',
    ],
    price: PRICE,
    cta: PRIMARY_CTA,
  },
  gap: {
    title: 'You Don’t Need To Be An Expert. You Need To Start Building.',
    body: [
      'Lots of people want to learn AI but feel stuck — too many tools, too many tutorials, no clear first step.',
      'They consume videos and tips, but never build anything they can point to.',
      'They don’t know how Claude works, what to learn first, or how to turn watching into a real, demoable skill.',
      'This cohort gives you one clear starting point, guided practice, and a path from consuming AI to building with it.',
      'And you can enter either door — join yourself, or redeem a seat your employer sponsored.',
    ],
  },
  builtFor: {
    title: 'Built For Beginners And Career Switchers',
    idealFor: [
      'Students',
      'Recent graduates',
      'Career switchers',
      'Job seekers',
      'Non-technical professionals',
      'Early-career professionals',
      'Anyone who wants to start building with AI from the ground up',
    ],
    closing: [
      'You don’t need advanced technical experience — you need the right guidance and real reps.',
      'Two doors, one class: start yourself for $149/month, or redeem an employer-sponsored seat code and learn on your own time.',
    ],
  },
  learn: {
    title: 'Learn To Build With AI, Step By Step',
    intro: 'Inside the cohort, you will learn:',
    items: [
      'What AI tools can really do — beyond the hype',
      'How Claude works, in plain language',
      'How to use AI for research, writing, planning, and problem solving',
      'How AI workflows are designed, not just prompted',
      'How real AI projects get built from scratch',
    ],
    goal: 'The goal isn’t to overwhelm you — it’s to move you from consuming AI to building with it, one confident step at a time.',
  },
  practice: {
    title: 'Build Through Guided Projects',
    body: [
      'Watching videos makes you a consumer. Building makes you a builder.',
      'To gain real AI skills you need reps, so inside the cohort you work guided projects that apply what you learn.',
      'You learn by doing — and start creating work you can explain, improve, and show.',
      'At Demo Day you present what you built, proof that you’ve moved from beginner to builder.',
    ],
  },
  openHouse: {
    title: 'What You Will Explore In The Free Open House',
    intro: 'During the Open House, you will see:',
    items: [
      'How one class works through two doors — individual or employer-sponsored',
      'How beginners start building with Claude, not just watching tutorials',
      'How guided projects turn learning into work you can demo',
      'How career switchers use real projects to open new doors',
      'How to start yourself for $149/month',
      'How to redeem an employer seat code if your company is sponsoring you',
    ],
    cta: SEAT_CTA,
  },
  transformation: {
    before: [
      'You’re interested in AI but unsure where to start.',
      'AI feels too technical, too fast, or too confusing.',
      'You’ve consumed plenty about AI but built nothing yet.',
    ],
    after: [
      'You understand the basics of AI and how Claude works.',
      'You use Claude with confidence on real tasks.',
      'You’ve built and demoed practical projects of your own.',
      'You have a clear path to keep building and improving.',
    ],
  },
  different: {
    title: 'Why This Is Different',
    body: [
      'Most AI learning is a pile of random tutorials that leaves you consuming, never building.',
      'Colaberry runs one guided class, entered through two doors — you start yourself, or your employer sponsors your seat — and both lead to the same place: you build.',
      'You learn with Claude, build through projects, get real support, present at Demo Day, and keep improving every month.',
    ],
  },
  finalCta: {
    title: 'Join The Free Open House',
    body: [
      'See how beginners and career switchers go from consuming AI to building with it the right way.',
      'Start the challenge yourself for $149/month — or, if you lead a team, sponsor seats and discover who your real AI builders are without taking anyone off the job.',
      SPONSOR_LINE,
    ],
    price: PRICE,
    tagline: TAGLINE,
  },
};

export const builders: PersonaContent = {
  slug: 'builders',
  seo: {
    title: 'Turn Your AI Idea Into A Working System',
    description:
      'One class, two doors. Builders, founders, and idea owners use Claude and a 12-week build path to turn ideas into real AI systems — self-serve at $149/month, or redeem an employer-sponsored seat code. Start at the free Open House.',
  },
  hero: {
    headline: 'You Have An Idea. Learn To Build It With AI.',
    body: [
      'Most people consume AI. Very few build with it. You’re ready to be in the second group.',
      'This is one class, entered through two doors. Join as an individual for $149/month, or redeem a seat code your employer sponsored. Either door, same cohort: the structure, tools, and guidance to turn your idea into a working AI system with Claude.',
      'Start at our free Open House and see how builders go from concept to deployed.',
    ],
    price: PRICE,
    cta: PRIMARY_CTA,
  },
  gap: {
    title: 'Your Idea Needs A Build Path',
    body: [
      'Many people have AI ideas. Very few know how to build them into something real and deployable.',
      'Consuming AI content won’t get you there — building will. You may want to build:',
    ],
    list: [
      'A product',
      'A business workflow',
      'An automation',
      'A customer support tool',
      'A content system',
      'A research assistant',
      'An internal business solution',
    ],
  },
  builtFor: {
    title: 'Built For Builders And Idea Owners',
    intro:
      'For people with an idea to ship — and for employers who want to find their real AI builders by seeing who actually deploys something.',
    idealFor: [
      'Entrepreneurs',
      'Founders',
      'Freelancers',
      'Consultants',
      'Business owners',
      'Creators',
      'Technical professionals',
      'Anyone with an idea they want to build using AI',
    ],
    closing: [
      'You don’t need everything figured out — you need a clear path, practical guidance, and a place to start building.',
      'Two doors, one class: join yourself for $149/month, or redeem an employer-sponsored seat code and build on your own time.',
    ],
  },
  learn: {
    title: 'Build With Claude',
    intro: 'Inside the cohort, you will learn to use Claude to actually build:',
    items: [
      'Idea development and validation',
      'Research and planning',
      'Workflow and agent design',
      'Project documentation that scales',
      'AI-assisted prototyping',
      'Real-world problem solving',
      'Implementation and deployment support',
    ],
    goal: 'The goal is to move you from scattered ideas to a build plan to something you’ve actually shipped.',
  },
  buildPath: {
    title: 'Your 12-Week Build Path',
    phases: [
      {
        weeks: 'Weeks 1–3',
        title: 'Build Your AI Foundation',
        desc: 'Clarify your idea, set up your AI workspace, and learn the foundations needed to begin building.',
      },
      {
        weeks: 'Weeks 4–6',
        title: 'Create Your AI Team',
        desc: 'Design AI agents and workflows that support your project.',
      },
      {
        weeks: 'Weeks 7–9',
        title: 'Connect AI To The Real World',
        desc: 'Connect your project to real data, tools, workflows, and use cases.',
      },
      {
        weeks: 'Weeks 10–12',
        title: 'Design AI That Scales',
        desc: 'Turn your project into a stronger system with architecture, documentation, and deployment planning — ready to present at Demo Day.',
      },
    ],
  },
  openHouse: {
    title: 'What You Will Explore In The Free Open House',
    intro: 'During the Open House, you will see:',
    items: [
      'How one class works through two doors — individual or employer-sponsored',
      'How builders use Claude to develop and ship ideas',
      'How live projects move you from concept to deployed system',
      'How the 12-week build path and Demo Day work',
      'How to join yourself for $149/month',
      'How to redeem an employer seat code if your company is sponsoring you',
    ],
    cta: SEAT_CTA,
  },
  transformation: {
    before: [
      'You have an idea and you know AI can help.',
      'But you’re not sure how to build it, structure it, or make it real.',
      'You’ve consumed plenty about AI without shipping anything.',
    ],
    after: [
      'You have a clear build path and know how to use Claude through it.',
      'You’ve built your AI-powered system, not just planned it.',
      'You can improve, demo, and keep developing what you made.',
      'You present at Demo Day as someone who builds with AI, not just talks about it.',
    ],
  },
  finalCta: {
    title: 'Join The Free Open House',
    body: [
      'See how builders and idea owners turn ideas into deployed AI systems.',
      'Join the challenge yourself for $149/month — or sponsor your team and discover who your real AI builders are without taking anyone off the job.',
      SPONSOR_LINE,
    ],
    price: PRICE,
    tagline: TAGLINE,
  },
};

export const personaBySlug: Record<PersonaContent['slug'], PersonaContent> = {
  'working-professionals': workingProfessionals,
  beginners,
  builders,
};
