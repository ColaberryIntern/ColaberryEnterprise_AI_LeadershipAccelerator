/**
 * Guards the two ways `scripts/buildStudentFactBase.js` reaches production.
 *
 * The generator used to wrap every command in `ssh root@<prod>`, which works from
 * a developer machine and nowhere else: the backend container has no `ssh` binary,
 * and the production host is refused when it ssh's to itself. Since the Mandrill
 * credential, the Postgres ledger and the verification gate only coexist ON that
 * host, the generator has to run there — so it now detects that it is already on
 * the box and talks to the containers directly.
 *
 * The property that actually matters is NOT "local mode works". It is that the two
 * paths cannot disagree. The freshness gate compares a stamp taken by one run
 * against a probe taken by another; if the local path and the ssh path could
 * produce different fingerprints for the same production state, the gate would
 * report STALE (or, far worse, FRESH) on the strength of which machine happened to
 * run it. These tests pin that they cannot.
 */

const crypto = require('crypto');

const {
  detectTransportMode,
  createTransport,
  DOCKER_SOCKET,
} = require('../../../../scripts/lib/productionTransport');

const {
  collectProduction,
  indexProduction,
  buildRoster,
  assemblePeople,
  dbFingerprint,
  pickBestEnrollment,
  DEFAULTS,
} = require('../../../../scripts/buildStudentFactBase');

const REPO = '/opt/colaberry-accelerator';
const GIT = `${REPO}/.git`;
const CONTAINERS = ['accelerator-db', 'accelerator-backend'];

/** Probes that report a machine which is the production host in every respect. */
const productionProbes = () => ({
  pathExists: (p) => p === GIT || p === DOCKER_SOCKET,
  runningContainers: () => ['accelerator-nginx', 'accelerator-db', 'op-backend', 'accelerator-backend'],
});

const detect = (probes) => detectTransportMode({ repoPath: REPO, containers: CONTAINERS, probes });

// ───────────────────────────────────────────────────────────── transport choice

describe('detectTransportMode', () => {
  it('chooses local ONLY when the checkout, the docker socket and both containers are all here', () => {
    const d = detect(productionProbes());
    expect(d.mode).toBe('local');
    expect(d.why).toBe(
      'on the production host: /opt/colaberry-accelerator/.git, /var/run/docker.sock, '
      + 'containers accelerator-db, accelerator-backend',
    );
    expect(d.markers.missing_containers).toEqual([]);
  });

  it('falls back to ssh on a developer machine, where the production checkout does not exist', () => {
    const d = detect({
      pathExists: (p) => p === DOCKER_SOCKET,
      runningContainers: () => CONTAINERS,
    });
    expect(d.mode).toBe('ssh');
    expect(d.why).toBe('not the production host: no checkout at /opt/colaberry-accelerator/.git');
    // Short-circuited before the daemon was ever asked.
    expect(d.markers.running_containers).toBe(null);
  });

  it('falls back to ssh when the checkout is here but no docker socket is', () => {
    const d = detect({
      pathExists: (p) => p === GIT,
      runningContainers: () => CONTAINERS,
    });
    expect(d.mode).toBe('ssh');
    expect(d.why).toBe('not the production host: no docker socket at /var/run/docker.sock');
  });

  it('falls back to ssh when the docker daemon does not answer `docker ps`', () => {
    const d = detect({
      pathExists: (p) => p === GIT || p === DOCKER_SOCKET,
      runningContainers: () => null,
    });
    expect(d.mode).toBe('ssh');
    expect(d.why).toBe('not the production host: the docker daemon did not answer `docker ps`');
  });

  it('falls back to ssh when only SOME of the containers it execs into are running', () => {
    const d = detect({
      pathExists: (p) => p === GIT || p === DOCKER_SOCKET,
      runningContainers: () => ['accelerator-db', 'accelerator-nginx'],
    });
    expect(d.mode).toBe('ssh');
    expect(d.why).toBe('not the production host: container(s) not running here: accelerator-backend');
    expect(d.markers.missing_containers).toEqual(['accelerator-backend']);
  });

  it('does not mistake the dev stack on the same host for production', () => {
    // The production box also runs `accelerator-dev-backend`. A substring match
    // would accept it; the check is exact-name membership.
    const d = detect({
      pathExists: (p) => p === GIT || p === DOCKER_SOCKET,
      runningContainers: () => ['accelerator-dev-backend', 'accelerator-dev-nginx', 'accelerator-db'],
    });
    expect(d.mode).toBe('ssh');
    expect(d.markers.missing_containers).toEqual(['accelerator-backend']);
  });
});

// ────────────────────────────────────────────────────────────── argv, both modes

describe('createTransport argv', () => {
  const CMD = "docker exec accelerator-db psql -U accelerator -d accelerator_prod -Atc 'select 1'";

  it('builds the ssh invocation a developer machine has always used', () => {
    const t = createTransport({ mode: 'ssh', sshTarget: 'root@95.216.199.47' });
    expect(t.argvFor(CMD)).toEqual([
      'ssh',
      ['-o', 'ConnectTimeout=25', '-o', 'BatchMode=yes', 'root@95.216.199.47', CMD],
    ]);
  });

  it('builds a plain local shell invocation on the production host', () => {
    const t = createTransport({ mode: 'local' });
    expect(t.argvFor(CMD)).toEqual(['/bin/sh', ['-c', CMD]]);
  });

  it('carries a byte-identical command string in both modes', () => {
    const viaSsh = createTransport({ mode: 'ssh', sshTarget: 'root@95.216.199.47' }).argvFor(CMD)[1];
    const viaLocal = createTransport({ mode: 'local' }).argvFor(CMD)[1];
    expect(viaSsh[viaSsh.length - 1]).toBe(CMD);
    expect(viaLocal[viaLocal.length - 1]).toBe(CMD);
  });

  it('refuses an unknown mode rather than guessing one', () => {
    expect(() => createTransport({ mode: 'rsync' })).toThrow('createTransport: unknown mode "rsync"');
  });

  it('refuses ssh mode with no host to ssh to', () => {
    expect(() => createTransport({ mode: 'ssh' })).toThrow('createTransport: ssh mode requires sshTarget');
  });
});

describe('createTransport run', () => {
  it('passes stdin through and returns stdout unchanged', () => {
    const seen = [];
    const t = createTransport({
      mode: 'local',
      exec: (file, argv, opts) => { seen.push({ file, argv, input: opts.input }); return 'PAYLOAD-OUT\n'; },
    });
    expect(t.run('cat > /tmp/x', { stdin: 'PAYLOAD-IN' })).toBe('PAYLOAD-OUT\n');
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe('PAYLOAD-IN');
  });

  it('names ssh, the step and the remote stderr when the remote command fails', () => {
    const t = createTransport({
      mode: 'ssh',
      sshTarget: 'root@95.216.199.47',
      exec: () => { const e = new Error('spawn failed'); e.status = 255; e.stderr = 'Permission denied (publickey,password).'; throw e; },
    });
    expect(() => t.run('git rev-parse HEAD', { label: 'reading production HEAD' }))
      .toThrow('ssh failed during reading production HEAD (exit 255): Permission denied (publickey,password).');
  });

  it('names the local shell, not ssh, when the local command fails', () => {
    const t = createTransport({
      mode: 'local',
      exec: () => { const e = new Error('nope'); e.status = 127; e.stderr = 'docker: not found'; throw e; },
    });
    expect(() => t.run('docker ps', { label: 'reading production HEAD' }))
      .toThrow('local shell failed during reading production HEAD (exit 127): docker: not found');
  });
});

// ──────────────────────────────────────────────── the fixture both modes read

const HEAD_SHA = '2019946e314094b8fe785507c92b2eb2f05ce2d3';

const ENROLLMENTS = [
  // Zoe: the real seat plus a withdrawn duplicate, the Million Meshesha shape.
  { id: 'enr-zoe', email: 'zoe@example.com', full_name: 'Zoe Q', status: 'active', portal_enabled: true, enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-07T10:00:00Z', portal_token_expires_at: '2026-08-15T20:41:59Z', mgmt_role: null },
  { id: 'enr-zoe-dup', email: 'zoe@example.com', full_name: 'Zoe Q', status: 'withdrawn', portal_enabled: true, enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-18T10:00:00Z', portal_token_expires_at: null, mgmt_role: null },
  // Amy: holds the shipped wizard placeholder, not her own words.
  { id: 'enr-amy', email: 'amy@example.com', full_name: 'Amy R', status: 'active', portal_enabled: true, enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-01T10:00:00Z', portal_token_expires_at: null, mgmt_role: null },
  // Two live seats on one address: the newest is the WRONG one to pick.
  { id: 'enr-dup-old', email: 'dup@example.com', full_name: 'Dup D', status: 'active', portal_enabled: true, enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-02T10:00:00Z', portal_token_expires_at: null, mgmt_role: null },
  { id: 'enr-dup-new', email: 'dup@example.com', full_name: 'Dup D', status: 'active', portal_enabled: true, enrollment_type: 'explorer', payment_status: 'unpaid', created_at: '2026-07-30T10:00:00Z', portal_token_expires_at: null, mgmt_role: null },
  // Ours, not a student's.
  { id: 'enr-ali', email: 'ali@colaberry.com', full_name: 'Ali M', status: 'active', portal_enabled: true, enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-06-01T10:00:00Z', portal_token_expires_at: null, mgmt_role: 'admin' },
];

const PROJECTS = [
  { id: 'prj-zoe', enrollment_id: 'enr-zoe', name: 'NEXUS AI', organization_name: 'Nexus Health', github_repo_url: null, created_at: '2026-07-08T10:00:00Z' },
  { id: 'prj-amy', enrollment_id: 'enr-amy', name: null, organization_name: null, github_repo_url: null, created_at: '2026-07-03T10:00:00Z' },
  { id: 'prj-dup', enrollment_id: 'enr-dup-old', name: 'Dup Build', organization_name: null, github_repo_url: null, created_at: '2026-07-04T10:00:00Z' },
  { id: 'prj-ali', enrollment_id: 'enr-ali', name: 'Fixture', organization_name: null, github_repo_url: null, created_at: '2026-06-02T10:00:00Z' },
];

const INTAKE = [
  { project_id: 'prj-zoe', idea: 'A triage bot for clinic intake forms', name: 'NEXUS AI', users: 'Clinic front desk staff', target_weeks: 12, status: 'complete', answers_count: 3 },
  { project_id: 'prj-amy', idea: 'An AI agent that triages my support inbox and drafts replies', name: null, users: 'Support reps at a 40-person SaaS', target_weeks: 6, status: 'draft', answers_count: 0 },
];

const PLANS = [
  { project_id: 'prj-zoe', status: 'published', version: 2, published_at: '2026-07-09T10:00:00Z' },
  { project_id: 'prj-amy', status: 'draft', version: 1, published_at: null },
];

const TASKS = [
  { project_id: 'prj-zoe', story_id: 'STORY-000', status: 'open', due_on: '2026-08-10', verified_at: null, acceptance_count: 4 },
  { project_id: 'prj-zoe', story_id: 'p1786001-t1', status: 'complete', due_on: null, verified_at: null, acceptance_count: 0 },
  { project_id: 'prj-zoe', story_id: 'p1786001-t2', status: 'open', due_on: null, verified_at: null, acceptance_count: 0 },
];

const REPOS = [
  { enrollment_id: 'enr-zoe', project_id: 'prj-zoe', repo_url: 'https://github.com/zoe/nexus', repo_owner: 'zoe', repo_name: 'nexus', last_sync_at: null },
];

/**
 * An exec that answers the generator's commands from the fixture above and records
 * every command string it was given. Both modes get the same instance behaviour,
 * so any difference in what they ask for shows up as a difference in `recorded`.
 */
function cannedExec(recorded) {
  const answers = [
    ['rev-parse --abbrev-ref HEAD', 'main\n'],
    ['rev-parse HEAD', `${HEAD_SHA}\n`],
    ['from enrollments', JSON.stringify(ENROLLMENTS)],
    ['from projects', JSON.stringify(PROJECTS)],
    ['from build_intake', JSON.stringify(INTAKE)],
    ['from build_plans', JSON.stringify(PLANS)],
    ['from student_tasks', JSON.stringify(TASKS)],
    ['from github_connections', JSON.stringify(REPOS)],
  ];
  return (file, argv) => {
    const command = argv[argv.length - 1];
    recorded.push(command);
    for (const [needle, body] of answers) if (command.includes(needle)) return body;
    throw new Error(`cannedExec: no fixture for command: ${command}`);
  };
}

/** Run the whole read-and-assemble path over one transport mode. */
function runPipeline(mode) {
  const recorded = [];
  const transport = createTransport({ mode, sshTarget: 'root@95.216.199.47', exec: cannedExec(recorded) });
  const raw = collectProduction(transport, DEFAULTS.cohortName);
  const index = indexProduction(raw);
  const { roster } = buildRoster(index);
  const people = assemblePeople({
    index,
    roster,
    mail: { ok: false, mailbox: null, messages: {}, errors: {} },
    skipMail: true,
  });
  return { recorded, head: raw.head, people, fingerprint: dbFingerprint(people) };
}

// ─────────────────────────────────────────────────────────────── the equivalence

describe('the local path and the ssh path are the same read', () => {
  let ssh;
  let local;
  let stderr;

  beforeAll(() => {
    stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    ssh = runPipeline('ssh');
    local = runPipeline('local');
  });

  afterAll(() => stderr.mockRestore());

  it('issues the identical command strings, in the identical order', () => {
    expect(local.recorded).toEqual(ssh.recorded);
    // 2 git reads + 6 SELECTs. Pinned so a new query cannot slip in unnoticed on
    // one path only.
    expect(ssh.recorded).toHaveLength(8);
    expect(ssh.recorded[0]).toBe('git -C /opt/colaberry-accelerator rev-parse HEAD');
  });

  it('produces a byte-identical people array', () => {
    expect(JSON.stringify(local.people)).toBe(JSON.stringify(ssh.people));
  });

  it('produces an identical fingerprint, which is the stamp the gate compares', () => {
    expect(local.fingerprint).toBe(ssh.fingerprint);
    expect(local.head.sha).toBe(HEAD_SHA);
  });

  it('actually read the fixture, rather than agreeing on nothing', () => {
    // 3 project-holding students, plus the 6 project-less addresses the T7
    // assessment carried forward. The fixture address is excluded.
    expect(ssh.people).toHaveLength(9);
    expect(ssh.people.map((p) => p.email)).not.toContain('ali@colaberry.com');

    const zoe = ssh.people.find((p) => p.email === 'zoe@example.com');
    expect(zoe.project_name).toBe('NEXUS AI');
    expect(zoe.has_published_plan).toBe(true);
    expect(zoe.story000_due).toBe('2026-08-10');
    expect(zoe.legacy_ticked).toBe(1);
    expect(zoe.withdrawn_duplicate_count).toBe(1);
    expect(zoe.login_candidate_count).toBe(1);
    expect(zoe.login_resolves_to_id).toBe('enr-zoe');
    expect(zoe.repo_connected).toBe(true);

    const amy = ssh.people.find((p) => p.email === 'amy@example.com');
    expect(amy.idea_is_demo_text).toBe(true);
    expect(amy.demo_contaminated_fields).toEqual(['idea', 'users', 'target_weeks']);
    expect(amy.project_name).toBe(null);
  });

  it('resolves a doubled login to the paid standard seat, not the newest row', () => {
    const dup = ssh.people.find((p) => p.email === 'dup@example.com');
    expect(dup.login_candidate_count).toBe(2);
    expect(dup.login_resolves_to_id).toBe('enr-dup-old');
  });
});

describe('pickBestEnrollment', () => {
  it('returns null when there is nothing to pick', () => {
    expect(pickBestEnrollment([])).toBe(null);
  });

  it('prefers the paid standard seat over a newer unpaid explorer seat', () => {
    const picked = pickBestEnrollment([
      ENROLLMENTS.find((e) => e.id === 'enr-dup-new'),
      ENROLLMENTS.find((e) => e.id === 'enr-dup-old'),
    ]);
    expect(picked.id).toBe('enr-dup-old');
  });

  it('falls through to most-recently-created when every other rank ties', () => {
    const older = { id: 'a', enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-07T10:00:00Z', mgmt_role: null };
    const newer = { id: 'b', enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-18T10:00:00Z', mgmt_role: null };
    expect(pickBestEnrollment([older, newer]).id).toBe('b');
  });
});

// ──────────────────────────────────────────────── the fingerprint is host-neutral

describe('dbFingerprint', () => {
  const person = (email) => ({
    email,
    project_id: 'p', project_name: 'n', organization_name: 'o',
    has_published_plan: true, has_story000: true, story000_status: 'open', story000_due: '2026-08-10',
    has_answers: true, answers_count: 1, idea_is_demo_text: false,
    login_candidate_count: 1, login_outcome: 'LINK_WOULD_BE_SENT', login_resolves_to_id: 'e',
    repo_connected: false, legacy_ticked: 0,
  });

  it('is the same hash whichever order the people arrive in', () => {
    const a = person('B@example.com');
    const b = person('a@example.com');
    expect(dbFingerprint([a, b])).toBe(dbFingerprint([b, a]));
  });

  it('sorts by code unit, not by collation, so two machines agree', () => {
    // This pair is the whole point: ICU orders 'a' before 'B', code units order
    // 'B' before 'a'. The generator now runs on a Windows dev box AND on the
    // Linux production host, and `localeCompare` answers to ICU data and the
    // process locale. A fingerprint that moved with the locale would make the
    // freshness gate cry STALE at the machine, not at production.
    expect('B@example.com'.localeCompare('a@example.com')).toBe(1);
    expect('B@example.com' < 'a@example.com').toBe(true);

    const codeUnitOrder = crypto.createHash('sha256').update(JSON.stringify([
      ['B@example.com', 'p', 'n', 'o', true, true, 'open', '2026-08-10', true, 1, false, 1, 'LINK_WOULD_BE_SENT', 'e', false, 0],
      ['a@example.com', 'p', 'n', 'o', true, true, 'open', '2026-08-10', true, 1, false, 1, 'LINK_WOULD_BE_SENT', 'e', false, 0],
    ])).digest('hex');

    // Pinned deliberately: this hash IS the contract. If a projection field is
    // added or the comparator changes, every committed fact base stamp becomes
    // meaningless, and that should cost someone a failing test.
    expect(dbFingerprint([person('a@example.com'), person('B@example.com')])).toBe(codeUnitOrder);
  });
});
