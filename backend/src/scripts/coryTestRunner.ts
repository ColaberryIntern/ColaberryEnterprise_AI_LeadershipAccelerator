/**
 * Cory Executive Readiness Test Runner
 * Run inside Docker: node dist/scripts/coryTestRunner.js
 * Outputs JSON results to stdout.
 */
import http from 'http';
import jwt from 'jsonwebtoken';

// ─── Generate auth token ────────────────────────────────────────────────────
const token = jwt.sign(
  { sub: '1', email: 'admin@colaberry.com', role: 'admin' },
  process.env.JWT_SECRET || 'dev-secret',
  { expiresIn: '2h' }
);

// ─── Questions ──────────────────────────────────────────────────────────────
interface TQ { id: number; cat: string; q: string; checks: string[] }

const QUESTIONS: TQ[] = [
  // Pipeline & Funnel (1-15)
  { id:1, cat:'pipeline', q:'How many leads do we have in our pipeline?', checks:['num:849'] },
  { id:2, cat:'pipeline', q:'What does our lead pipeline look like right now?', checks:['num:849','word:cold'] },
  { id:3, cat:'pipeline', q:'Break down our leads by temperature — how many are hot, warm, and cold?', checks:['num:839','num:10'] },
  { id:4, cat:'pipeline', q:'What is our lead-to-enrollment conversion rate?', checks:['num:849','num:2'] },
  { id:5, cat:'pipeline', q:'Where are leads getting stuck in the funnel?', checks:['no:agent_name','no:error_count'] },
  { id:6, cat:'pipeline', q:'How many leads came from Apollo versus our alumni network?', checks:['num:608','num:240'] },
  { id:7, cat:'pipeline', q:'Which lead sources are converting best?', checks:['no:SELECT','no:FROM'] },
  { id:8, cat:'pipeline', q:'How many opportunity scores have been generated?', checks:['num:848'] },
  { id:9, cat:'pipeline', q:'What percentage of our leads are warm or hot?', checks:['has_data'] },
  { id:10, cat:'pipeline', q:'How many strategy calls have been scheduled?', checks:['num:14'] },
  { id:11, cat:'pipeline', q:'Show me the lead pipeline funnel from first touch to enrollment', checks:['has_data','has_sections'] },
  { id:12, cat:'pipeline', q:'Are we generating enough warm leads to hit our enrollment targets?', checks:['no:SQL','no:query','has_data'] },
  { id:13, cat:'pipeline', q:'What is the quality distribution of our leads?', checks:['word:cold','word:warm','has_data'] },
  { id:14, cat:'pipeline', q:'How fast are leads moving through the pipeline?', checks:['has_data'] },
  { id:15, cat:'pipeline', q:'Compare our lead volume this week to last week', checks:['has_data'] },

  // Campaigns & Outreach (16-30)
  { id:16, cat:'campaigns', q:'How many campaigns do we have running?', checks:['num:13','num:11'] },
  { id:17, cat:'campaigns', q:'Give me a breakdown of all campaigns by status', checks:['num:11','num:1'] },
  { id:18, cat:'campaigns', q:'Which campaigns should I focus on this week?', checks:['no:agent_name','no:cron','has_data'] },
  { id:19, cat:'campaigns', q:'How many emails have we sent this week?', checks:['num:805'] },
  { id:20, cat:'campaigns', q:'What is our email delivery rate?', checks:['has_data'] },
  { id:21, cat:'campaigns', q:'Are there any campaign errors I should know about?', checks:['no:stack trace','no:TypeError','has_data'] },
  { id:22, cat:'campaigns', q:'How is the Executive Briefing Interest Campaign performing?', checks:['has_data'] },
  { id:23, cat:'campaigns', q:'Which campaigns are generating the most enrollments?', checks:['has_data'] },
  { id:24, cat:'campaigns', q:'How many follow-up sequences are active?', checks:['num:13'] },
  { id:25, cat:'campaigns', q:'What is the ROI on our outbound campaigns?', checks:['no:agent','has_data'] },
  { id:26, cat:'campaigns', q:'How many emails are pending delivery right now?', checks:['num:75'] },
  { id:27, cat:'campaigns', q:'Compare the performance of our alumni campaigns versus cold outbound', checks:['has_data'] },
  { id:28, cat:'campaigns', q:'What happened with the Strategy Call Prep Nudge Campaign?', checks:['word:completed'] },
  { id:29, cat:'campaigns', q:'How many communication touchpoints have we made?', checks:['num:1649'] },
  { id:30, cat:'campaigns', q:'Should we launch the AI Leadership Cold Outbound campaign or keep it in draft?', checks:['word:draft','has_data'] },

  // Enrollment & Revenue (31-45)
  { id:31, cat:'enrollment', q:'How many students are enrolled right now?', checks:['num:2'] },
  { id:32, cat:'enrollment', q:'What is our enrollment trend?', checks:['has_data'] },
  { id:33, cat:'enrollment', q:'How many cohorts do we have?', checks:['num:3'] },
  { id:34, cat:'enrollment', q:'What is our cost per enrollment?', checks:[] },
  { id:35, cat:'enrollment', q:'At our current conversion rate, how many more leads do we need to get 10 enrollments?', checks:['has_data'] },
  { id:36, cat:'enrollment', q:'How are our enrolled students progressing through the program?', checks:['has_data'] },
  { id:37, cat:'enrollment', q:'What is the lifetime value of an enrolled student?', checks:[] },
  { id:38, cat:'enrollment', q:'Are we on track to hit our enrollment goals this quarter?', checks:['has_data'] },
  { id:39, cat:'enrollment', q:'How does enrollment compare month over month?', checks:['has_data'] },
  { id:40, cat:'enrollment', q:'What is the average time from lead to enrollment?', checks:['has_data'] },
  { id:41, cat:'enrollment', q:'Which campaigns are most effective at driving enrollments?', checks:['has_data'] },
  { id:42, cat:'enrollment', q:'Do we have any students at risk of dropping out?', checks:['has_data'] },
  { id:43, cat:'enrollment', q:'What is our program completion rate?', checks:['has_data'] },
  { id:44, cat:'enrollment', q:'How many ICP profiles have we created?', checks:['num:2'] },
  { id:45, cat:'enrollment', q:'Break down our enrollment funnel — leads to strategy calls to enrolled', checks:['has_data'] },

  // Business Briefings (46-60)
  { id:46, cat:'briefing', q:'Give me a business status briefing', checks:['num:849','num:13','num:2','has_sections','no:agent_name','no:error_count','no:agent_type'] },
  { id:47, cat:'briefing', q:'What needs my attention right now?', checks:['has_data'] },
  { id:48, cat:'briefing', q:'What are the biggest risks to our growth?', checks:['has_data','has_sections'] },
  { id:49, cat:'briefing', q:'Give me the CEO morning briefing', checks:['has_data','has_sections','no:cron','no:scheduler','no:middleware'] },
  { id:50, cat:'briefing', q:'What happened in the business today?', checks:['has_data'] },
  { id:51, cat:'briefing', q:'Summarize our business health in three bullet points', checks:['has_data'] },
  { id:52, cat:'briefing', q:'What are our top 3 priorities this week?', checks:['has_data'] },
  { id:53, cat:'briefing', q:'How are we doing overall?', checks:['has_data'] },
  { id:54, cat:'briefing', q:'What is the one thing I should worry about most?', checks:['has_data'] },
  { id:55, cat:'briefing', q:'Give me a SWOT analysis of our current position', checks:['has_data'] },
  { id:56, cat:'briefing', q:'How does this week compare to last week?', checks:['has_data'] },
  { id:57, cat:'briefing', q:'What quick wins can we get this week?', checks:['has_data'] },
  { id:58, cat:'briefing', q:'If you had to present our business to a board, what would you say?', checks:['has_data','has_sections'] },
  { id:59, cat:'briefing', q:'What KPIs should I be watching daily?', checks:['has_data'] },
  { id:60, cat:'briefing', q:'Rate our business health on a scale of 1-10 and explain why', checks:['has_data'] },

  // Operations & Automation (61-70)
  { id:61, cat:'operations', q:'How is our automation running?', checks:['has_data','no:agent_type','no:cron_expression'] },
  { id:62, cat:'operations', q:'Are any business processes failing?', checks:['has_data'] },
  { id:63, cat:'operations', q:'How many automated processes do we have running?', checks:['num:172'] },
  { id:64, cat:'operations', q:'Which automation processes need attention?', checks:['has_data','no:SELECT','no:stack trace'] },
  { id:65, cat:'operations', q:'How much of our outreach is automated versus manual?', checks:['has_data'] },
  { id:66, cat:'operations', q:'What operational capacity do we have available?', checks:['has_data'] },
  { id:67, cat:'operations', q:'How reliable are our business processes?', checks:['has_data'] },
  { id:68, cat:'operations', q:'What is the error rate across our operations?', checks:['has_data'] },
  { id:69, cat:'operations', q:'How many system events happened in the last 24 hours?', checks:['has_data'] },
  { id:70, cat:'operations', q:'Are we operationally ready to scale to 100 students?', checks:['has_data'] },

  // Forecasting & Strategy (71-80)
  { id:71, cat:'strategy', q:'Forecast our enrollment growth for next quarter', checks:['has_data'] },
  { id:72, cat:'strategy', q:'If we double our email outreach, what impact would that have?', checks:['has_data'] },
  { id:73, cat:'strategy', q:'What is the most impactful thing we could do to increase enrollments?', checks:['has_data'] },
  { id:74, cat:'strategy', q:'Should we invest more in alumni referrals or cold outbound?', checks:['has_data'] },
  { id:75, cat:'strategy', q:'What would it take to get to 50 enrollments this year?', checks:['has_data'] },
  { id:76, cat:'strategy', q:'Are we spending our marketing budget effectively?', checks:['has_data'] },
  { id:77, cat:'strategy', q:'What trends are you seeing in our data?', checks:['has_data'] },
  { id:78, cat:'strategy', q:'Compare our outreach volume to industry benchmarks', checks:['has_data'] },
  { id:79, cat:'strategy', q:'What is our customer acquisition cost?', checks:[] },
  { id:80, cat:'strategy', q:'Where is our biggest bottleneck right now?', checks:['has_data'] },

  // Cross-Domain & Multi-Entity (81-90)
  { id:81, cat:'cross-domain', q:'How many campaigns and leads do we have?', checks:['num:13','num:849'] },
  { id:82, cat:'cross-domain', q:'Show me leads, enrollments, and campaign performance together', checks:['has_data'] },
  { id:83, cat:'cross-domain', q:'How do our campaigns connect to enrollment outcomes?', checks:['has_data'] },
  { id:84, cat:'cross-domain', q:'What is the relationship between email volume and lead warming?', checks:['has_data'] },
  { id:85, cat:'cross-domain', q:'Give me a full picture — leads, campaigns, emails, and enrollments', checks:['num:849','num:2'] },
  { id:86, cat:'cross-domain', q:'How do strategy calls translate into enrollments?', checks:['has_data'] },
  { id:87, cat:'cross-domain', q:'Which part of the business is performing best and which worst?', checks:['has_data'] },
  { id:88, cat:'cross-domain', q:'How are alumni referrals performing compared to cold outreach across all metrics?', checks:['has_data'] },
  { id:89, cat:'cross-domain', q:'Tie together our outreach efforts and enrollment results', checks:['has_data'] },
  { id:90, cat:'cross-domain', q:'If I can only look at three metrics, which three should I watch?', checks:['has_data'] },

  // Edge Cases & Stress Tests (91-100)
  { id:91, cat:'edge', q:'What is our revenue?', checks:['no:$1,000,000','no:$500,000'] },
  { id:92, cat:'edge', q:'How many students failed the program?', checks:['no:50 students failed','no:30% failure'] },
  { id:93, cat:'edge', q:'Tell me everything', checks:['has_data','has_sections'] },
  { id:94, cat:'edge', q:'Why is our conversion rate so low?', checks:['has_data'] },
  { id:95, cat:'edge', q:'What data do you have access to?', checks:['has_data'] },
  { id:96, cat:'edge', q:'Can you predict how many enrollments we will have next month?', checks:['has_data'] },
  { id:97, cat:'edge', q:'', checks:[] },
  { id:98, cat:'edge', q:'asdfghjkl random gibberish', checks:[] },
  { id:99, cat:'edge', q:'How many agents have errors and what are the error messages?', checks:['num:3'] },
  { id:100, cat:'edge', q:'Our board meeting is tomorrow. Give me every key metric with context.', checks:['num:849','num:13','num:2','has_sections'] },
];

// ─── HTTP helper ────────────────────────────────────────────────────────────
function askCory(question: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ question });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/admin/intelligence/assistant',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Invalid JSON: ${body.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// ─── Scoring ────────────────────────────────────────────────────────────────
function findNum(text: string, target: number, tol = 5): boolean {
  const nums = text.match(/[\d,]+\.?\d*/g);
  if (!nums) return false;
  for (const n of nums) {
    const v = parseFloat(n.replace(/,/g, ''));
    if (!isNaN(v) && Math.abs(v - target) <= tol) return true;
  }
  // Written numbers
  const written: Record<string, number> = { zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15 };
  const lower = text.toLowerCase();
  for (const [w, v] of Object.entries(written)) {
    if (lower.includes(w) && Math.abs(v - target) <= tol) return true;
  }
  return false;
}

interface Result {
  id: number; cat: string; q: string;
  score: number; pass: boolean;
  failures: string[]; warnings: string[];
  intent: string; confidence: number;
  narrative: string; duration_ms: number;
  pipelineErrors: string[];
}

function evaluate(tq: TQ, resp: any, duration: number): Result {
  const failures: string[] = [];
  const warnings: string[] = [];
  let deductions = 0;

  if (!resp || !resp.narrative) {
    return { id: tq.id, cat: tq.cat, q: tq.q, score: 0, pass: false, failures: ['No response'], warnings: [], intent: '', confidence: 0, narrative: '', duration_ms: duration, pipelineErrors: [] };
  }

  const allText = [
    resp.narrative || '',
    resp.narrative_sections?.executive_summary || '',
    ...(resp.narrative_sections?.key_findings || []),
    resp.narrative_sections?.risk_assessment || '',
    ...(resp.narrative_sections?.recommended_actions || []),
  ].join(' ');

  const lower = allText.toLowerCase();

  for (const check of tq.checks) {
    if (check.startsWith('num:')) {
      const target = parseInt(check.split(':')[1]);
      const tol = target > 100 ? Math.ceil(target * 0.02) : (target > 10 ? 2 : 0);
      if (!findNum(allText, target, tol)) {
        failures.push(`Missing number ~${target}`);
        deductions += 10;
      }
    } else if (check.startsWith('word:')) {
      const word = check.split(':')[1];
      if (!lower.includes(word.toLowerCase())) {
        warnings.push(`Missing word "${word}"`);
        deductions += 3;
      }
    } else if (check.startsWith('no:')) {
      const phrase = check.split(':')[1];
      if (lower.includes(phrase.toLowerCase())) {
        failures.push(`Contains forbidden "${phrase}"`);
        deductions += 5;
      }
    } else if (check === 'has_data') {
      const noData = ['no data available', 'data not available', 'unable to retrieve', 'no results found'];
      if (noData.some(p => lower.includes(p)) && allText.length < 150) {
        failures.push('Says no data but data exists');
        deductions += 15;
      }
    } else if (check === 'has_sections') {
      if (!resp.narrative_sections?.executive_summary) {
        warnings.push('Missing narrative_sections');
        deductions += 5;
      }
    }
  }

  const pipelineErrors = (resp.pipelineSteps || [])
    .filter((s: any) => s.status === 'error')
    .map((s: any) => `${s.name}: ${s.detail}`);

  const score = Math.max(0, 100 - deductions);
  return {
    id: tq.id, cat: tq.cat, q: tq.q,
    score, pass: score >= 70 && failures.length === 0,
    failures, warnings,
    intent: resp.intent, confidence: resp.confidence,
    narrative: (resp.narrative || '').substring(0, 250),
    duration_ms: duration,
    pipelineErrors,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const results: Result[] = [];
  const CONCURRENCY = 3; // Run 3 at a time to not overload OpenAI

  console.error(`\n🧪 Starting Cory Executive Readiness Test — ${QUESTIONS.length} questions\n`);

  for (let i = 0; i < QUESTIONS.length; i += CONCURRENCY) {
    const batch = QUESTIONS.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (tq) => {
        const t0 = Date.now();
        try {
          const resp = await askCory(tq.q);
          return evaluate(tq, resp, Date.now() - t0);
        } catch (err: any) {
          return {
            id: tq.id, cat: tq.cat, q: tq.q,
            score: 0, pass: false,
            failures: [`Error: ${err.message}`], warnings: [],
            intent: '', confidence: 0, narrative: '',
            duration_ms: Date.now() - t0, pipelineErrors: [],
          };
        }
      })
    );
    results.push(...batchResults);

    // Progress
    const done = Math.min(i + CONCURRENCY, QUESTIONS.length);
    const passedSoFar = results.filter(r => r.pass).length;
    console.error(`  [${done}/${QUESTIONS.length}] ${passedSoFar} passed so far`);

    // Log failures immediately
    for (const r of batchResults) {
      if (!r.pass && r.failures.length > 0) {
        console.error(`    ❌ Q${r.id}: ${r.failures.join('; ')} — "${r.narrative.substring(0, 100)}..."`);
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  const avgDuration = results.reduce((s, r) => s + r.duration_ms, 0) / results.length;

  console.error(`\n${'═'.repeat(60)}`);
  console.error(`  CORY EXECUTIVE READINESS REPORT`);
  console.error(`${'═'.repeat(60)}`);
  console.error(`  Questions:     ${results.length}`);
  console.error(`  Passed:        ${passed.length} (${(passed.length / results.length * 100).toFixed(1)}%)`);
  console.error(`  Failed:        ${failed.length}`);
  console.error(`  Avg score:     ${avgScore.toFixed(1)}/100`);
  console.error(`  Avg latency:   ${(avgDuration / 1000).toFixed(1)}s`);

  // Category breakdown
  const cats = [...new Set(results.map(r => r.cat))];
  console.error(`\n  ─── By Category ───`);
  for (const cat of cats) {
    const cr = results.filter(r => r.cat === cat);
    const cp = cr.filter(r => r.pass).length;
    const ca = cr.reduce((s, r) => s + r.score, 0) / cr.length;
    console.error(`    ${cat.padEnd(15)} ${cp}/${cr.length} passed  avg: ${ca.toFixed(0)}/100`);
  }

  if (failed.length > 0) {
    console.error(`\n  ─── Failed Questions ───`);
    for (const r of failed) {
      console.error(`    Q${r.id} [${r.cat}] Score:${r.score} Intent:${r.intent}`);
      console.error(`      ${r.q}`);
      console.error(`      Failures: ${r.failures.join('; ')}`);
      if (r.warnings.length) console.error(`      Warnings: ${r.warnings.join('; ')}`);
      console.error(`      Narrative: ${r.narrative.substring(0, 150)}`);
    }
  }

  const passRate = passed.length / results.length;
  console.error(`\n${'═'.repeat(60)}`);
  if (passRate >= 0.95 && avgScore >= 85) {
    console.error(`  VERDICT: ✅ READY for executive use`);
  } else if (passRate >= 0.85 && avgScore >= 75) {
    console.error(`  VERDICT: ⚠️  NEARLY READY — minor issues remain`);
  } else {
    console.error(`  VERDICT: ❌ NOT READY — significant issues found`);
  }
  console.error(`  Pass rate: ${(passRate * 100).toFixed(1)}%  |  Avg score: ${avgScore.toFixed(1)}/100`);
  console.error(`${'═'.repeat(60)}\n`);

  // Output JSON to stdout for programmatic use
  console.log(JSON.stringify({ summary: { total: results.length, passed: passed.length, failed: failed.length, avgScore, avgDuration, passRate }, results }, null, 2));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
