require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.8; max-width: 700px;">

<p>Dhee,</p>

<p>I need to talk about the OpenClaw autonomous outreach work. I've done a deep analysis of what's been happening and we need to make significant changes. This is not about effort — you've been putting in work. This is about directing that work where it actually produces results.</p>

<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

<h2 style="color: #1a365d; font-size: 16px;">Where We Are Now</h2>

<table style="border-collapse: collapse; width: 100%; font-size: 13px; margin: 10px 0;">
<tr style="background: #f7fafc;"><th style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">Platform</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Your Posts</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Engagement</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Leads</th></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Medium</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">151</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">8%</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #e53e3e; font-weight: bold;">0</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Product Hunt</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">83</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">0%</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #e53e3e; font-weight: bold;">0</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Dev.to (automated)</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">204</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #38a169;">78%</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #e53e3e; font-weight: bold;">0</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0;">LinkedIn</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #e53e3e;">0</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">-</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">-</td></tr>
</table>

<p><strong>234 manual posts across Medium and Product Hunt. Zero leads. Zero meetings.</strong></p>

<p>The average time from when content is generated to when you post it is <strong>61.5 hours</strong>. That's 2.5 days. By then, many of the source articles have been deleted, making our comments irrelevant.</p>

<p>138 people replied to our Dev.to comments and <strong>nobody replied back to them</strong>. Those are warm conversations we're leaving on the table.</p>

<p>Meanwhile, LinkedIn — where our actual buyers (CEOs, VPs, Directors) spend their time — has <strong>zero posts</strong>.</p>

<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

<h2 style="color: #1a365d; font-size: 16px;">What Changes Starting Tomorrow</h2>

<h3 style="color: #e53e3e; font-size: 14px;">STOP: Product Hunt</h3>
<p>83 posts, 0% engagement, 0 leads. Remove it from your workflow. Do not spend another minute on it.</p>

<h3 style="color: #dd6b20; font-size: 14px;">REDUCE: Medium to 1 post per day</h3>
<p>You were doing 10-20+ per day. Quantity is not the goal. Pick the single best piece each morning. Skip everything else.</p>

<h3 style="color: #38a169; font-size: 14px;">START: LinkedIn — 2 posts per day</h3>
<p>This is the #1 change. Our target audience lives on LinkedIn, not Product Hunt. Every minute you spent on Product Hunt shifts to LinkedIn.</p>

<h3 style="color: #38a169; font-size: 14px;">START: Reply to Dev.to threads — 8 per day</h3>
<p>138 people engaged with our content and got zero follow-up. These are the warmest leads in our funnel. Reply to them.</p>

<h3 style="color: #2b6cb0; font-size: 14px;">FIX: Process the Autonomous page same-day</h3>
<p>Approve or reject everything within 24 hours. No more 2.5-day delays.</p>

<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

<h2 style="color: #1a365d; font-size: 16px;">Your New Daily Schedule — 55 Minutes</h2>

<table style="border-collapse: collapse; width: 100%; font-size: 13px; margin: 10px 0;">
<tr style="background: #f7fafc;"><th style="padding: 8px; border: 1px solid #e2e8f0;">Time</th><th style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">Task</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Min</th></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">9:00</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Post LinkedIn #1</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">5</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">9:05</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Post 1 Medium article</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">5</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">9:10</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Reply to 5 Dev.to threads</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">15</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">9:25</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Review Autonomous page — approve/reject all</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">15</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">12:00</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Post LinkedIn #2</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">5</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">12:05</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Reply to 3 more Dev.to threads</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">10</td></tr>
</table>

<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

<h2 style="color: #1a365d; font-size: 16px;">Step-by-Step Instructions</h2>

<h3 style="color: #2b6cb0; font-size: 14px;">LinkedIn Posting (9:00 AM and 12:00 PM)</h3>
<ol>
<li>Go to <a href="https://enterprise.colaberry.ai/admin/content-queue">enterprise.colaberry.ai/admin/content-queue</a></li>
<li>Look for the best piece of content — something that would make a VP or CEO stop scrolling. If there's a LinkedIn draft, use that first. Otherwise pick a strong Medium piece.</li>
<li>Click the <strong>Copy</strong> button</li>
<li>Open <a href="https://linkedin.com">linkedin.com</a> (logged into Ali's account)</li>
<li>Click <strong>"Start a post"</strong></li>
<li>Paste the content</li>
<li>Add 3-5 hashtags at the bottom: <code>#AI #EnterpriseAI #AILeadership #DigitalTransformation #AIAgents</code></li>
<li>Click <strong>Post</strong></li>
<li>Go back to Content Queue and click <strong>Mark Posted</strong></li>
</ol>
<p><strong>Best times:</strong> 8-9 AM and 12-1 PM CT. Tuesday through Thursday get the most views. Avoid weekends.</p>

<h3 style="color: #2b6cb0; font-size: 14px;">Medium Posting (9:05 AM — 1 per day ONLY)</h3>
<ol>
<li>Go to <a href="https://enterprise.colaberry.ai/admin/content-queue">enterprise.colaberry.ai/admin/content-queue</a></li>
<li>Filter by <strong>Medium</strong></li>
<li>Read the top 3 pieces. Pick the ONE that is most insightful. Skip anything generic.</li>
<li>Click <strong>Copy</strong></li>
<li>Open <a href="https://medium.com">medium.com</a> (logged into Ali's account — ali@colaberry.com)</li>
<li>Click <strong>Write</strong> (top right)</li>
<li>Paste the content</li>
<li>Add a title — either the first sentence or a punchy summary</li>
<li>Add tags: <code>AI, Artificial Intelligence, Enterprise, Leadership, Machine Learning</code></li>
<li>Click <strong>Publish</strong></li>
<li>Go back to Content Queue, click <strong>Mark Posted</strong> on the one you published and <strong>Skip</strong> on the ones you rejected</li>
</ol>

<h3 style="color: #2b6cb0; font-size: 14px;">Dev.to Thread Replies (9:10 AM and 12:05 PM)</h3>
<ol>
<li>Go to <a href="https://dev.to/notifications">dev.to/notifications</a> (logged into the Colaberry account)</li>
<li>Look for replies to our comments — these are people who responded to something we posted</li>
<li>For each reply, write a <strong>genuine, personal response</strong> (2-3 sentences). Do NOT use a template. Read what they said and respond to their specific point.</li>
<li>End your reply naturally with something like: <em>"We actually help enterprise teams work through exactly this kind of challenge. If you're curious what an AI workforce design looks like for your use case, take a look at advisor.colaberry.ai/advisory"</em></li>
<li>Do <strong>5 in the morning, 3 in the afternoon</strong> = 8 warm conversations per day</li>
<li><strong>Skip</strong> one-word replies like "nice" or "thanks" — only reply to people who said something substantive</li>
</ol>

<h3 style="color: #2b6cb0; font-size: 14px;">Autonomous Page Review (9:25 AM)</h3>
<ol>
<li>Go to <a href="https://enterprise.colaberry.ai/admin/autonomous">enterprise.colaberry.ai/admin/autonomous</a></li>
<li>Sort by newest first</li>
<li>For each item:<br/>
&bull; <strong>Approve</strong> if it's insightful, professional, relevant to AI/enterprise<br/>
&bull; <strong>Reject</strong> if it's generic, off-topic, or low quality</li>
<li>Process everything from today and yesterday. Nothing should sit more than 24 hours.</li>
<li>If there are 30+ items, be aggressive with rejections. Quality over quantity.</li>
<li>This should take 15 minutes max.</li>
</ol>

<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

<h2 style="color: #1a365d; font-size: 16px;">What Success Looks Like in 2 Weeks</h2>

<ul>
<li><strong>LinkedIn:</strong> 20+ posts on Ali's profile, visible to our target executive audience</li>
<li><strong>Medium:</strong> 10-14 high-quality articles (not 150 mediocre ones)</li>
<li><strong>Dev.to:</strong> 80+ reply conversations driving people to advisor.colaberry.ai</li>
<li><strong>Autonomous page:</strong> Zero backlog, everything processed same day</li>
<li><strong>Product Hunt:</strong> Zero time spent</li>
</ul>

<p>The goal is not to post the most content. It's to post the <strong>right content on the right platform</strong> and follow up with people who engage. 3 great LinkedIn posts that a VP reads are worth more than 83 Product Hunt comments nobody sees.</p>

<p>Start this tomorrow morning. Let me know if you have questions about any of the steps.</p>

<br/>
<p>Ali</p>

</div>
`;

async function main() {
  await transporter.sendMail({
    from: 'Ali Muwwakkil <ali@colaberry.com>',
    to: 'dhee@colaberry.com',
    cc: 'ali@colaberry.com',
    subject: 'OpenClaw Outreach — Changes Starting Tomorrow',
    html: html,
  });
  console.log('Sent to dhee@colaberry.com (cc: ali@colaberry.com)');
}

main().catch(e => console.error('Error:', e.message));
