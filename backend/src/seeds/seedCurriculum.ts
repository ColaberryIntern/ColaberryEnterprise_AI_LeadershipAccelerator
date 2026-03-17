import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';
import LiveSession from '../models/LiveSession';

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // Find Cohort 1
  const cohort = await Cohort.findOne({ where: { name: 'Cohort 1 — March 2026' } });
  if (!cohort) {
    console.error('Cohort 1 not found!');
    process.exit(1);
  }

  console.log(`Seeding sessions for: ${cohort.name} (${cohort.id})`);

  const sessions = [
    {
      cohort_id: cohort.id,
      session_number: 1,
      title: 'The Enterprise AI Mandate',
      description:
        'Why AI leadership matters now. Assess your organization\'s AI maturity, identify high-impact use cases, and build the strategic case for your AI initiative.',
      session_date: '2026-04-02',
      start_time: '1:00 PM',
      end_time: '3:00 PM',
      session_type: 'core' as const,
      status: 'scheduled' as const,
      curriculum_json: [
        {
          title: 'The AI Leadership Imperative',
          description:
            'Why every executive needs AI fluency now. Industry trends, competitive pressure, and the cost of inaction.',
          duration_minutes: 20,
        },
        {
          title: 'AI Maturity Assessment',
          description:
            'Evaluate where your organization stands on the AI maturity curve using our 5-level framework. Identify gaps and quick wins.',
          duration_minutes: 25,
        },
        {
          title: 'Identifying High-Impact Use Cases',
          description:
            'Framework for scoring AI opportunities by business impact, data readiness, and technical feasibility. Prioritize your top 3 candidates.',
          duration_minutes: 30,
        },
        {
          title: 'Building the Strategic Case',
          description:
            'Craft a compelling 1-page AI Initiative Brief: problem statement, proposed solution, expected ROI, and resource requirements.',
          duration_minutes: 25,
        },
        {
          title: 'Cohort Introductions & Use Case Sharing',
          description:
            'Meet your fellow participants. Share your organization\'s AI challenge and get initial peer feedback on your use case selection.',
          duration_minutes: 20,
        },
      ],
      materials_json: [
        { title: 'AI Maturity Assessment Template', type: 'template', url: '' },
        { title: 'Use Case Prioritization Scorecard', type: 'template', url: '' },
        { title: 'AI Initiative Brief Template', type: 'template', url: '' },
        { title: 'Enterprise AI Landscape 2026 (Reading)', type: 'reading', url: '' },
        { title: 'Session 1 Slides', type: 'slide', url: '' },
      ],
    },
    {
      cohort_id: cohort.id,
      session_number: 2,
      title: 'Architecture & the 3-Agent System',
      description:
        'Hands-on lab: Set up Claude Code, learn the 3-agent pattern (Planner, Builder, Reviewer), and build your first working AI agent.',
      session_date: '2026-04-07',
      start_time: '1:00 PM',
      end_time: '3:00 PM',
      session_type: 'lab' as const,
      status: 'scheduled' as const,
      curriculum_json: [
        {
          title: 'Claude Code Environment Setup',
          description:
            'Install and configure Claude Code (Max/Team plan). Set up your GitHub repository, API keys, and development environment.',
          duration_minutes: 20,
        },
        {
          title: 'The 3-Agent Architecture Pattern',
          description:
            'Deep dive into the Planner-Builder-Reviewer pattern. How enterprise AI systems decompose complex tasks into reliable, auditable agent workflows.',
          duration_minutes: 25,
        },
        {
          title: 'Building Your First Agent',
          description:
            'Guided hands-on: Create a working Planner agent that takes a business requirement and produces a structured implementation plan.',
          duration_minutes: 30,
        },
        {
          title: 'Agent Communication & Orchestration',
          description:
            'How agents pass context, validate outputs, and handle failures. Implement the Builder agent that executes the Planner\'s instructions.',
          duration_minutes: 25,
        },
        {
          title: 'Quality Gates & the Reviewer Agent',
          description:
            'Add automated review and quality checks. Build the Reviewer agent that validates Builder output against Planner requirements.',
          duration_minutes: 20,
        },
      ],
      materials_json: [
        { title: 'Claude Code Setup Guide', type: 'reading', url: '' },
        { title: '3-Agent Architecture Reference', type: 'reading', url: '' },
        { title: 'Starter Repository (GitHub)', type: 'tool', url: '' },
        { title: 'Agent Prompt Templates', type: 'template', url: '' },
        { title: 'Session 2 Slides', type: 'slide', url: '' },
      ],
    },
    {
      cohort_id: cohort.id,
      session_number: 3,
      title: 'Guided POC Launch',
      description:
        'Scope and launch your AI Proof of Capability. Connect real data, build production-ready workflows, and establish success metrics.',
      session_date: '2026-04-09',
      start_time: '1:00 PM',
      end_time: '3:00 PM',
      session_type: 'core' as const,
      status: 'scheduled' as const,
      curriculum_json: [
        {
          title: 'POC Scoping Workshop',
          description:
            'Narrow your use case to a demonstrable proof of capability. Define inputs, outputs, success criteria, and a 1-week build timeline.',
          duration_minutes: 25,
        },
        {
          title: 'Data Integration Strategies',
          description:
            'Connect your AI agents to real organizational data. APIs, document ingestion, database queries, and structured output formats.',
          duration_minutes: 25,
        },
        {
          title: 'Building Production-Ready Workflows',
          description:
            'Move from concept to production: error handling, retry logic, logging, and output validation. Patterns that survive the executive demo.',
          duration_minutes: 25,
        },
        {
          title: 'Success Metrics & Measurement',
          description:
            'Define quantitative and qualitative KPIs for your POC. Set up measurement frameworks that demonstrate business value.',
          duration_minutes: 20,
        },
        {
          title: 'Peer Review & Checkpoint',
          description:
            'Present your POC plan to a peer group. Get structured feedback on scope, feasibility, and business impact.',
          duration_minutes: 25,
        },
      ],
      materials_json: [
        { title: 'POC Scoping Canvas', type: 'template', url: '' },
        { title: 'Data Integration Playbook', type: 'reading', url: '' },
        { title: 'Success Metrics Framework', type: 'template', url: '' },
        { title: 'POC Progress Tracker', type: 'template', url: '' },
        { title: 'Session 3 Slides', type: 'slide', url: '' },
      ],
    },
    {
      cohort_id: cohort.id,
      session_number: 4,
      title: 'Refinement & Executive Positioning',
      description:
        'Harden your POC, build your executive narrative, and prepare a compelling ROI-driven presentation for stakeholder buy-in.',
      session_date: '2026-04-14',
      start_time: '1:00 PM',
      end_time: '3:00 PM',
      session_type: 'lab' as const,
      status: 'scheduled' as const,
      curriculum_json: [
        {
          title: 'POC Hardening & Edge Cases',
          description:
            'Stress-test your proof of capability. Handle edge cases, improve reliability, and ensure consistent output quality.',
          duration_minutes: 25,
        },
        {
          title: 'The Executive AI Narrative',
          description:
            'Craft a story that resonates with C-suite audiences. Frame AI capabilities in terms of business outcomes, not technology.',
          duration_minutes: 25,
        },
        {
          title: 'ROI Framework & Business Case',
          description:
            'Build a defensible ROI model: cost savings, revenue impact, risk reduction, and time-to-value. Templates for board-ready presentations.',
          duration_minutes: 25,
        },
        {
          title: 'Executive Deck Structure',
          description:
            'Build your presentation: problem, solution, demo, results, roadmap. Practice the 10-minute executive pitch format.',
          duration_minutes: 25,
        },
        {
          title: 'Dry Run & Peer Feedback',
          description:
            'Present your draft deck to peers. Get structured feedback on clarity, persuasiveness, and demo flow.',
          duration_minutes: 20,
        },
      ],
      materials_json: [
        { title: 'Executive Presentation Template', type: 'template', url: '' },
        { title: 'ROI Calculator Spreadsheet', type: 'template', url: '' },
        { title: 'AI Business Case Examples', type: 'reading', url: '' },
        { title: 'Presentation Feedback Rubric', type: 'template', url: '' },
        { title: 'Session 4 Slides', type: 'slide', url: '' },
      ],
    },
    {
      cohort_id: cohort.id,
      session_number: 5,
      title: 'Executive Demonstrations — Demo Day',
      description:
        'Present your AI Proof of Capability to the cohort. Live demos, executive feedback, 90-day roadmap planning, and graduation.',
      session_date: '2026-04-16',
      start_time: '1:00 PM',
      end_time: '3:00 PM',
      session_type: 'core' as const,
      status: 'scheduled' as const,
      curriculum_json: [
        {
          title: 'Live Executive Demonstrations',
          description:
            'Each participant presents their AI POC in a 10-minute executive pitch format: problem, solution, live demo, results, and ask.',
          duration_minutes: 60,
        },
        {
          title: 'Peer & Instructor Feedback',
          description:
            'Structured feedback rounds using the executive evaluation rubric. Actionable suggestions for strengthening your business case.',
          duration_minutes: 20,
        },
        {
          title: '90-Day AI Expansion Roadmap',
          description:
            'Plan your post-program path: Phase 1 (expand POC), Phase 2 (team enablement), Phase 3 (organizational scaling). Timeline, resources, and milestones.',
          duration_minutes: 20,
        },
        {
          title: 'Lessons Learned & Best Practices',
          description:
            'Cohort retrospective: what worked, what didn\'t, and patterns for sustaining AI momentum in your organization.',
          duration_minutes: 10,
        },
        {
          title: 'Graduation & Next Steps',
          description:
            'Certificate of completion, alumni community access, ongoing advisory options, and continued learning resources.',
          duration_minutes: 10,
        },
      ],
      materials_json: [
        { title: '90-Day Roadmap Template', type: 'template', url: '' },
        { title: 'Executive Evaluation Rubric', type: 'template', url: '' },
        { title: 'AI Scaling Playbook', type: 'reading', url: '' },
        { title: 'Alumni Resources Guide', type: 'reading', url: '' },
        { title: 'Session 5 Slides', type: 'slide', url: '' },
      ],
    },
  ];

  for (const sessionData of sessions) {
    const [session, created] = await LiveSession.findOrCreate({
      where: {
        cohort_id: sessionData.cohort_id,
        session_number: sessionData.session_number,
      },
      defaults: sessionData,
    });

    if (!created) {
      // Update existing session with curriculum data
      await session.update({
        title: sessionData.title,
        description: sessionData.description,
        curriculum_json: sessionData.curriculum_json,
        materials_json: sessionData.materials_json,
      });
      console.log(`Updated: Session ${session.session_number} — ${session.title}`);
    } else {
      console.log(`Created: Session ${session.session_number} — ${session.title}`);
    }
  }

  console.log('\nCurriculum seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
