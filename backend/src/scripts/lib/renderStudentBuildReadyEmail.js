// renderStudentBuildReadyEmail.js
//
// The note a student gets once their build is set up. Pure rendering, no
// transport and no database, so the words that actually reach a student can be
// asserted in a unit test rather than reviewed by eye in a dry run.
// See __tests__/renderStudentBuildReadyEmail.test.js.
//
// Tone, per the program's standing email rules: plain and human, no em-dashes,
// no marketing voice, one instruction. They are being told a single thing, that
// their board exists and STORY-000 is the first task on it. Everything else is
// noise on top of that.

const PROJECTS_URL = 'https://enterprise.colaberry.ai/portal/projects';
const SUBJECT = 'Your build project is set up';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai`;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A first name we are willing to put at the top of an email, or the local part
 * of the address when the stored name is unusable. Better a bare handle than
 * "Dear ,". Anything with digits or punctuation in it is not a first name.
 */
function firstName(fullName, email) {
  const n = String(fullName || '').trim().split(/\s+/)[0];
  if (n && /^[A-Za-z][A-Za-z'-]*$/.test(n)) return n;
  return String(email || '').split('@')[0] || 'there';
}

/**
 * The project name, or null when there is nothing worth saying back.
 *
 * Real production names include "N/A" and the empty string, because the name
 * comes from a free-text intake field. Naming the project is warmer when there
 * is a name and actively worse when there is not: "Your project, N/A, is set
 * up" reads like a bug, which is exactly what it is.
 */
function projectPhrase(projectName) {
  const n = String(projectName || '').trim();
  const useless = !n || n.length < 2 || /^(n\/?a|none|test|tbd|untitled|unnamed|-+|\.+)$/i.test(n);
  return useless ? null : n;
}

/**
 * @param {object} row  one READY row from auditStudentBuilds.js
 * @returns {{subject: string, text: string, html: string}}
 */
function renderStudentBuildReadyEmail(row) {
  const r = row || {};
  const name = firstName(r.fullName, r.email);
  const project = projectPhrase(r.projectName);
  const count = Number(r.taskCount || 0);

  const openerText = project
    ? `Your project, ${project}, is set up in the portal.`
    : 'Your build project is set up in the portal.';
  const openerHtml = project
    ? `Your project, <strong>${esc(project)}</strong>, is set up in the portal.`
    : 'Your build project is set up in the portal.';

  // Singular/plural matters here because the number is real and a student will
  // notice "1 tasks" faster than anything else in the message.
  const taskLine = `Your board has ${count} ${count === 1 ? 'task' : 'tasks'} on it, dated against the cohort schedule.`;

  const text = `${name},

${openerText} ${taskLine}

Next step: open Projects and start STORY-000, Build your Command Center. It is the first task on the board and the rest of the build hangs off it. It gives you one page showing what you are building and how far along you are, and it is what you will demo from.

${PROJECTS_URL}

If the board does not look like your project, reply to this and I will fix it.

${SIG_TEXT}
`;

  const html = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 640px;">
<p>${esc(name)},</p>
<p>${openerHtml} ${esc(taskLine)}</p>
<p>Next step: open Projects and start <strong>STORY-000, Build your Command Center</strong>. It is the first task on the board and the rest of the build hangs off it. It gives you one page showing what you are building and how far along you are, and it is what you will demo from.</p>
<p style="margin: 22px 0;"><a href="${PROJECTS_URL}" style="display: inline-block; background: #1a365d; color: #ffffff; padding: 11px 22px; border-radius: 4px; text-decoration: none; font-weight: 600;">Open Projects</a></p>
<p>If the board does not look like your project, reply to this and I will fix it.</p>
${SIG_HTML}
</div>`;

  return { subject: SUBJECT, text, html };
}

module.exports = { renderStudentBuildReadyEmail, firstName, projectPhrase, SUBJECT, PROJECTS_URL };
