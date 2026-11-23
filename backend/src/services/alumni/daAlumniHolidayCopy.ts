/**
 * AL1 (Ali, 2026-11-22): the Data Analytics alumni holiday campaign. Ten emails from Ali, about two
 * a week, Tue Nov 24 to Thu Dec 24 2026, every one offering verified alumni 50% off the yearly
 * membership (the alumni_annual_2026 account credit: $894 off $1,788, granted automatically when
 * the alum's account email matches their alumni record; it closes on its own at year end, which
 * the emails deliberately do not say).
 *
 * The bodies are Ali's approved text, word for word. Each has one {{personal_opening}} the
 * scheduler fills per person (services/alumni/alumniPersonalOpening.ts) and the first name filled
 * at booking. Ali's signature is appended by the scheduler (settings.ali_signature), once.
 *
 * Every outside claim is sourced (docs/reports/al1/DA_ALUMNI_HOLIDAY_CAMPAIGN.html):
 *   45% of data and analytics postings mention AI    Indeed Hiring Lab, Jan 22 2026
 *   FDE postings up more than 1,000%                 Lightcast via Fortune, Sep 3 2026
 *   FDE median total compensation about $225,000     Levels.fyi, Nov 21 2026
 *   Anthropic $100M, 10,000 engineers, by end 2027   Anthropic, Oct 2 2026 (nomination only)
 *   75% of analytics content will use GenAI by 2027  Gartner press release, Jun 18 2025
 */
export const DA_ALUMNI_CAMPAIGN_KEY = 'da_alumni_holiday_2026';
export const ALUMNI_SIGNUP_URL = 'https://enterprise.colaberry.ai/portal/signup';

/** openingAfter: how many of Ali's paragraphs come before the personal opening (1 for "Happy Thanksgiving."). */
export interface AlumniStep { date: string; subject: string; theme: string; paragraphs: string[]; openingAfter?: number }

const OFFER = 'I\'m letting all of our alumni know: verified Colaberry alumni get 50% off the yearly membership. That\'s $894 instead of $1,788.';
const OFFER_SHORT = 'I\'m letting all alumni know that verified alumni get 50% off the yearly membership: $894 instead of $1,788.';
const CLAIM = `To claim it, sign in or create your account at <a href="${ALUMNI_SIGNUP_URL}">${ALUMNI_SIGNUP_URL}</a> and choose the yearly plan under Subscription. Your 50% applies automatically when your email matches our alumni records. If you studied with us under a different email, just reply and I'll take care of it.`;

export const DA_ALUMNI_STEPS: AlumniStep[] = [
  { date: '2026-11-24', subject: 'The Data Analyst job is changing. Here\'s what I\'m doing about it.', theme: 'how the Data Analyst and BI Developer roles are changing, and why I am writing to every alum',
    paragraphs: [
      'I\'m writing to every Colaberry alum this week, and I wanted you to hear this from me directly.',
      'The Data Analyst and BI Developer roles are changing faster than anything I\'ve seen since we started Colaberry. By December of last year, 45% of data and analytics job postings mentioned AI, more than any other field Indeed tracks. Employers still want people who understand data. Now they want those people to build with AI too.',
      'That\'s why we built the Forward Deployed AI Engineer Accelerator. It takes what you already know about data and turns it into the skill set companies are hiring for right now.',
      OFFER, CLAIM,
      'Over the next few weeks I\'ll share why I believe this is the right move for people like you.'] },
  { date: '2026-11-26', subject: 'A Thanksgiving Special for Colaberry alumni', theme: 'Thanksgiving, gratitude for our alumni', openingAfter: 1,
    paragraphs: [
      'Happy Thanksgiving.',
      'Today I\'m thankful for everyone who has trusted Colaberry with their career, and that includes you.',
      'So I\'m making this week a Thanksgiving Special. I\'m letting all alumni know that verified alumni get 50% off the yearly membership in the Forward Deployed AI Engineer Accelerator: $894 instead of $1,788.',
      'If you\'ve felt uncertain about where the analyst role is heading, this is a way to get ahead of it with a team you already know.',
      CLAIM, 'Enjoy the day with your family.'] },
  { date: '2026-11-30', subject: 'What a Forward Deployed Engineer makes', theme: 'the Forward Deployed Engineer role',
    paragraphs: [
      'There\'s a role most analysts haven\'t heard of yet: the Forward Deployed Engineer. These are the people who sit with a business, understand its data and its problems, and build AI systems that actually get used.',
      'It\'s one of the fastest-growing jobs in tech. Postings rose more than 1,000% in the first eight months of 2026 compared with the same months of 2025. The median total compensation is about $225,000 a year.',
      'If you\'ve worked with data, SQL and stakeholders, you already have a big part of what this job needs. The Accelerator gives you the rest.',
      OFFER_SHORT, CLAIM] },
  { date: '2026-12-03', subject: 'Everything we ever taught, in one platform', theme: 'building our whole platform with AI in six months',
    paragraphs: [
      'Here\'s something I\'m proud of. Every technology we\'ve used at Colaberry over the years, from SQL and Power BI to Python, I was able to build into this platform within six months, using AI.',
      'That is what building looks like now. One person who understands the business and knows how to work with AI can build what used to take a team. It\'s exactly what the Forward Deployed AI Engineer Accelerator teaches: not theory, building.',
      'I\'m letting all alumni know: verified alumni get 50% off the yearly membership, $894 instead of $1,788.', CLAIM] },
  { date: '2026-12-07', subject: 'Your portfolio is your resume now', theme: 'showing real projects to employers',
    paragraphs: [
      'Hiring managers don\'t just want to hear what you know. They want to see what you\'ve built.',
      'If you spend the next few months building up your portfolio on hire.refactored.ai, you\'ll be able to show real-world project examples in what is becoming one of the most sought-after positions in tech. Every project you build in the Accelerator goes into that portfolio, ready to share with an employer.',
      OFFER_SHORT, CLAIM] },
  { date: '2026-12-10', subject: 'Anthropic is spending $100 million on this skill', theme: 'how much companies are investing in AI deployment skills',
    paragraphs: [
      'In October, Anthropic, the company behind Claude, announced a $100 million commitment to train 10,000 engineers to put AI to work inside companies by the end of 2027.',
      'Those classes aren\'t open to the public. Companies nominate their own people to attend.',
      'That tells you two things: how valuable this skill has become, and how hard it is to get the training on your own. This is a unique opportunity to put yourself in high demand after so much uncertainty in the analyst role, with a brand you trust, for half off.',
      OFFER_SHORT, CLAIM] },
  { date: '2026-12-14', subject: 'What happened to the BI Developer role', theme: 'how BI Developer work is changing',
    paragraphs: [
      'A lot of you came to Colaberry to become BI Developers. Building models, reports and dashboards was a great career, and those skills still matter.',
      'What\'s changed is how the work gets done. Gartner predicts that by 2027, 75% of analytics content will use generative AI. The value is moving to the person who understands the business and can build the AI system around the data. That\'s the bridge from BI Developer to Forward Deployed Engineer, and you\'re closer to it than most people.',
      OFFER_SHORT, CLAIM] },
  { date: '2026-12-17', subject: 'What the next three months could look like', theme: 'a plan for the next three months',
    paragraphs: [
      'Here\'s what I would do in your shoes.',
      'Spend the next three months building. One real AI project a month, on real business problems, each one added to your hire.refactored.ai portfolio. By spring you would have work you can show an employer, in one of the most sought-after roles in tech, instead of a line on a resume.',
      'That\'s what the Forward Deployed AI Engineer Accelerator is built for: live sessions, a community building alongside you, and projects you build on the platform from week one.',
      OFFER_SHORT, CLAIM] },
  { date: '2026-12-21', subject: 'A Christmas Special for our alumni', theme: 'the holidays and starting the new year',
    paragraphs: [
      'As the year winds down, I wanted to do something for the people who have been part of Colaberry along the way.',
      'So here\'s my Christmas Special. I\'m letting all alumni know that verified alumni get 50% off the yearly membership in the Forward Deployed AI Engineer Accelerator: $894 instead of $1,788. Start the new year already building toward one of the most sought-after roles in tech.',
      CLAIM, 'Merry Christmas.'] },
  { date: '2026-12-24', subject: 'Merry Christmas, and one last note', theme: 'Christmas Eve, a closing note', openingAfter: 1,
    paragraphs: [
      'Merry Christmas to you and your family.',
      'This is my last note in this series. After so much uncertainty around the analyst role, I believe the Forward Deployed Engineer path is the clearest opportunity our alumni have had in years, and I would love for you to take it with us.',
      'I\'m letting all alumni know one more time: verified alumni get 50% off the yearly membership, $894 instead of $1,788.',
      CLAIM, 'If you have a question, just reply. I read every one.'] },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One step's body for one person: greeting, the {{personal_opening}} placeholder (filled at send),
 * then Ali's text. Paragraphs are trusted HTML (they carry the claim link); the name is escaped.
 */
export function alumniStepBody(step: AlumniStep, firstName: string | null): string {
  const hi = firstName ? `<p>Hi ${esc(firstName)},</p>` : '<p>Hi,</p>';
  const paras = step.paragraphs.map((p) => `<p>${p}</p>`);
  const at = Math.min(step.openingAfter ?? 0, paras.length);
  return [hi, ...paras.slice(0, at), '<p>{{personal_opening}}</p>', ...paras.slice(at)].join('\n');
}
