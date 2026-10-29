/**
 * C87 agent places, against the local stack: every AI agent has one place it stays. Reese is in the Classroom; Dara is in
 * the Staff Office on the Program floor at Curriculum, and only a badge that opens the Program floor may see or message her.
 *
 * Proved through the API the campus itself reads (the staff-desks route and POST /dm/open), for one account per case:
 * the admin and owner badges (Program floor), a marketing badge (no Program floor), a member and an Explorer.
 * Called from campus.e2e.js, which owns the stack checks and the step log; kept here because that file is over the ceiling.
 */
async function call(urls, method, pathname, jwt, body) {
  const r = await fetch(urls.api + pathname, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
}
const desksOf = async (urls, jwt) => {
  const r = await call(urls, 'GET', '/api/portal/campus/staff-desks', jwt);
  if (r.status !== 200) throw new Error(`staff-desks ${r.status}`);
  return r.body.desks || [];
};

async function runAgentPlaces({ urls, users, step, must }) {
  let daraId = null;
  await step('places', 'C87: a badge with the Program floor (admin, owner) sees Dara in the Staff Office at Curriculum; Reese is in the Classroom', async () => {
    for (const who of ['staff', 'staff-owner']) {
      const desks = await desksOf(urls, users[who].jwt);
      const dara = desks.find((d) => d.id === 'dara');
      must(!!dara, `${who}: no Dara desk`);
      must(dara.building === 'career' && dara.floor === 'program' && dara.office === '/admin/orchestration', `${who}: Dara at ${dara.building}/${dara.floor}/${dara.office}`);
      const reese = desks.find((d) => d.id === 'reese');
      must(reese && reese.building === 'lecture', `${who}: Reese at ${reese && reese.building}`);
      daraId = daraId || dara.enrollment_id;
    }
    must(!!daraId, 'Dara has no enrollment id (seed switched her on?)');
  });
  await step('places', 'C87: a member, an Explorer and a marketing badge never see Dara, and Reese is in the Classroom for them too', async () => {
    for (const who of ['member', 'explorer', 'staff-marketing']) {
      const desks = await desksOf(urls, users[who].jwt);
      must(!desks.some((d) => d.id === 'dara'), `${who} was sent Dara`);
      const reese = desks.find((d) => d.id === 'reese');
      must(reese && reese.building === 'lecture', `${who}: Reese at ${reese && reese.building}`);
    }
  });
  await step('places', 'C87: opening a chat with Dara is refused without the Program floor, allowed with it', async () => {
    must(!!daraId, 'no Dara id from the previous step');
    for (const who of ['member', 'staff-marketing']) {
      const r = await call(urls, 'POST', '/api/portal/dm/open', users[who].jwt, { otherId: daraId });
      must(r.status === 400 && /badge doesn't open/.test(r.body?.error || ''), `${who}: dm/open ${r.status} ${JSON.stringify(r.body)}`);
    }
    const ok = await call(urls, 'POST', '/api/portal/dm/open', users['staff-owner'].jwt, { otherId: daraId });
    must(ok.status === 200 && !!ok.body?.roomId, `owner: dm/open ${ok.status} ${JSON.stringify(ok.body)}`);
  });
}

module.exports = { runAgentPlaces };
