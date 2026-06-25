// Content contract + data for the AI Membership persona landing pages.
// Copy authored by Sohail Syed on BC todo 9946499609 (2026-06-17). Treated as
// his source draft pending his sign-off; edit here, not in the template.

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

const PRICE = 'Membership starts at $149/month.';
const TAGLINE = 'Learn With Claude. Build Through Colaberry. Deploy In The Real World.';
const PRIMARY_CTA = 'Join The Free Open House';
const SEAT_CTA = 'Reserve My Free Seat';

export const workingProfessionals: PersonaContent = {
  slug: 'working-professionals',
  seo: {
    title: 'Learn AI Skills You Can Actually Use At Work',
    description:
      'Colaberry’s AI Membership helps working professionals learn with Claude, build through real projects, and stay ahead in the AI economy. Join the free Open House. Membership starts at $149/month.',
  },
  hero: {
    headline: 'Learn AI Skills You Can Actually Use At Work',
    body: [
      'AI is changing every role.',
      'The professionals who learn how to use AI, build with AI, and apply AI to real business problems will have a major advantage.',
      'Join our free Open House and see how Colaberry’s AI Membership helps working professionals learn with Claude, build through real projects, and stay ahead in the AI economy.',
    ],
    price: PRICE,
    cta: PRIMARY_CTA,
  },
  gap: {
    title: 'AI Is No Longer Optional',
    body: [
      'AI is already changing how teams research, write, analyze, plan, automate, and make decisions.',
      'Most professionals are experimenting with AI tools.',
      'Very few are learning how to apply AI to real business workflows.',
      'That is the gap this membership is designed to close.',
    ],
  },
  builtFor: {
    title: 'Built For Working Professionals',
    intro: 'This membership is designed for professionals who want to stay relevant as AI changes their industry.',
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
      'You do not need to become a machine learning engineer.',
      'You need practical AI skills you can apply at work.',
    ],
  },
  learn: {
    title: 'Learn With Claude',
    intro: 'Inside the membership, you will learn how to use Claude for:',
    items: [
      'Research and analysis',
      'Planning and documentation',
      'Workflow improvement',
      'Business problem solving',
      'AI-assisted project development',
      'Real-world use cases',
    ],
    goal: 'The goal is simple: learn how to use AI as a practical work partner.',
  },
  practice: {
    title: 'Build Through Real Projects',
    body: [
      'Learning AI is not enough.',
      'You need practice.',
      'Inside the membership, you will work on real projects that show how AI can be used in business, operations, workflows, and problem solving.',
      'You will learn by building. You will learn by applying. You will learn by doing.',
    ],
  },
  openHouse: {
    title: 'What You Will Explore In The Free Open House',
    intro: 'During the Open House, you will see:',
    items: [
      'What is included inside the AI Membership',
      'How working professionals can learn AI with Claude',
      'How real projects help you build practical skills',
      'How the membership helps you stay updated as AI evolves',
      'How Colaberry guides you from learning to implementation',
      'How to get started for $149/month',
    ],
    cta: SEAT_CTA,
  },
  transformation: {
    before: [
      'You know AI is important.',
      'You may have tried a few tools.',
      'But you are not sure how to use AI in a structured, valuable, and professional way.',
    ],
    after: [
      'You understand how to use Claude and AI workflows to solve real problems.',
      'You can apply AI to your work.',
      'You can speak confidently about AI use cases.',
      'You become more valuable in your role and more prepared for the future of work.',
    ],
  },
  different: {
    title: 'Why This Is Different',
    body: [
      'Most AI courses teach tools. Most AI courses teach prompts. Most AI courses leave you with information, but not enough practice.',
      'Colaberry’s AI Membership is different.',
      'You learn with Claude. You build through real projects. You apply AI to practical problems. You keep improving every month.',
    ],
  },
  finalCta: {
    title: 'Join The Free Open House',
    body: [
      'See what is included inside Colaberry’s AI Membership.',
      'Learn how working professionals are using Claude, real projects, and guided learning to build practical AI skills.',
    ],
    price: PRICE,
    tagline: TAGLINE,
  },
};

export const beginners: PersonaContent = {
  slug: 'beginners',
  seo: {
    title: 'Start Learning AI, Even If You Are A Beginner',
    description:
      'Colaberry’s AI Membership helps beginners, students, and career switchers learn AI step by step with Claude, guided projects, and practical support. Join the free Open House. Membership starts at $149/month.',
  },
  hero: {
    headline: 'Start Learning AI, Even If You Are A Beginner',
    body: [
      'AI is creating new opportunities across every industry.',
      'But many people do not know where to begin.',
      'Join our free Open House and see how Colaberry’s AI Membership helps beginners, students, and career switchers learn AI step by step with Claude, guided projects, and practical support.',
    ],
    price: PRICE,
    cta: PRIMARY_CTA,
  },
  gap: {
    title: 'You Do Not Need To Be An AI Expert',
    body: [
      'Many people want to learn AI, but feel stuck.',
      'They do not know which tools to use.',
      'They do not know what to learn first.',
      'They do not know how Claude works.',
      'They do not know how to turn learning into real skills.',
      'This membership gives you a clear starting point, guided learning, and real practice.',
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
      'Anyone who wants to start learning AI from the ground up',
    ],
    closing: [
      'You do not need advanced technical experience.',
      'You need the right guidance and a practical learning path.',
    ],
  },
  learn: {
    title: 'Learn AI Step By Step',
    intro: 'Inside the membership, you will learn:',
    items: [
      'What AI tools can do',
      'How Claude works',
      'How to use AI for research, writing, planning, and problem solving',
      'How AI workflows are created',
      'How real AI projects are built',
    ],
    goal: 'The goal is not to overwhelm you. The goal is to help you build confidence one step at a time.',
  },
  practice: {
    title: 'Build Through Guided Projects',
    body: [
      'Watching videos is not enough.',
      'To build real AI skills, you need practice.',
      'Inside the membership, you will work on guided projects that help you apply what you learn.',
      'You will learn by doing. You will start creating work you can explain, improve, and show.',
    ],
  },
  openHouse: {
    title: 'What You Will Explore In The Free Open House',
    intro: 'During the Open House, you will see:',
    items: [
      'What is included inside the AI Membership',
      'How beginners can start learning AI with Claude',
      'How guided projects help you build practical skills',
      'How career switchers can use AI to create new opportunities',
      'How to get started for $149/month',
    ],
    cta: SEAT_CTA,
  },
  transformation: {
    before: [
      'You are interested in AI, but you feel unsure where to start.',
      'AI may feel too technical, too fast, or too confusing.',
    ],
    after: [
      'You understand the basics of AI.',
      'You know how to use Claude with confidence.',
      'You start building practical projects.',
      'You have a clear path to keep improving.',
    ],
  },
  different: {
    title: 'Why This Is Different',
    body: [
      'Most AI learning feels confusing. There are too many tools, videos, and random tutorials.',
      'Colaberry’s AI Membership gives you a guided path.',
      'You learn with Claude. You build through projects. You get practical support. You keep improving every month.',
    ],
  },
  finalCta: {
    title: 'Join The Free Open House',
    body: [
      'See how Colaberry’s AI Membership helps beginners and career switchers start learning AI the right way.',
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
      'Colaberry’s AI Membership helps builders, entrepreneurs, and idea owners use Claude, live projects, and guided support to turn ideas into real AI-powered systems. Join the free Open House. Membership starts at $149/month.',
  },
  hero: {
    headline: 'Turn Your AI Idea Into A Working System',
    body: [
      'You have an idea.',
      'Now you need the structure, tools, and guidance to build it.',
      'Join our free Open House and see how Colaberry’s AI Membership helps builders, entrepreneurs, and idea owners use Claude, live projects, and guided support to turn ideas into real AI-powered systems.',
    ],
    price: PRICE,
    cta: PRIMARY_CTA,
  },
  gap: {
    title: 'Your Idea Needs A Build Path',
    body: [
      'Many people have AI ideas.',
      'Few know how to turn them into something real.',
      'You may want to build:',
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
      'You do not need to have everything figured out.',
      'You need a clear path, practical guidance, and a place to start building.',
    ],
  },
  learn: {
    title: 'Build With Claude',
    intro: 'Inside the membership, you will learn how to use Claude for:',
    items: [
      'Idea development',
      'Research and planning',
      'Workflow design',
      'Project documentation',
      'AI-assisted prototyping',
      'Problem solving',
      'Implementation support',
    ],
    goal: 'The goal is to help you move from scattered ideas to a clear build plan.',
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
        desc: 'Turn your project into a stronger system with architecture, documentation, and deployment planning.',
      },
    ],
  },
  openHouse: {
    title: 'What You Will Explore In The Free Open House',
    intro: 'During the Open House, you will see:',
    items: [
      'What is included inside the AI Membership',
      'How builders use Claude to develop ideas',
      'How live projects help you move from concept to execution',
      'How the 12-week build path works',
      'How to get started for $149/month',
    ],
    cta: SEAT_CTA,
  },
  transformation: {
    before: [
      'You have an idea.',
      'You know AI can help.',
      'But you are not sure how to build it, structure it, or make it real.',
    ],
    after: [
      'You have a clear build path.',
      'You understand how to use Claude in the process.',
      'You start building your AI-powered system.',
      'You create something you can improve, demonstrate, and continue developing.',
    ],
  },
  finalCta: {
    title: 'Join The Free Open House',
    body: [
      'See how Colaberry’s AI Membership helps builders and idea owners turn ideas into AI-powered systems.',
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
