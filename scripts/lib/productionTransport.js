'use strict';
/*
 * productionTransport.js — one command string, two ways to reach production.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/buildStudentFactBase.js` reads production by wrapping every command in
 * `ssh root@<prod>`. That works from a developer machine and nowhere else:
 *
 *   - inside the backend container there is no `ssh` binary at all, so the
 *     freshness probe that `verify-drafts.js` depends on cannot run there;
 *   - ON the production host, `ssh root@95.216.199.47` is refused
 *     (`Permission denied (publickey,password)`), so the box cannot ssh to itself.
 *
 * The three things a real send needs — the Mandrill credential, a durable Postgres
 * ledger, and the ability to run the verification gate — only coexist on the
 * production host. So the generator has to work when it is ALREADY THERE.
 *
 * THE EQUIVALENCE ARGUMENT
 * ------------------------
 * The single most important property of this module is that both transports run
 * the SAME COMMAND STRING against the SAME BOX. `ssh host '<cmd>'` hands `<cmd>`
 * to a shell on the production host; local mode hands the identical `<cmd>` to a
 * shell on the production host. Nothing above this module knows which one ran, and
 * no caller composes a different command for a different mode. Divergence between
 * the two paths is therefore not something to be tested away case by case; it is
 * structurally unavailable, because there is exactly one command builder.
 *
 * Everything the commands touch (`docker exec accelerator-db psql …`,
 * `docker exec accelerator-backend node …`) executes inside a container whose
 * environment comes from the container, not from whoever invoked `docker exec`.
 * Locale, timezone and encoding are therefore fixed by the container image in both
 * modes rather than inherited from the caller.
 *
 * SECURITY
 * --------
 * This module never reads, stores, or logs a credential. In both modes the Gmail
 * refresh token and the Mandrill key stay inside the container that already holds
 * them; nothing is transmitted to the calling host and nothing is echoed. The only
 * strings this module puts on stderr are the command LABEL and, on failure, the
 * remote stderr — which is why callers must label steps rather than pass secrets
 * on a command line.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

/** The docker daemon socket. Present iff a daemon is (or was) running here. */
const DOCKER_SOCKET = '/var/run/docker.sock';

/**
 * The probes detection uses, isolated so tests can drive detection without a
 * docker daemon, a production checkout, or a network.
 */
function defaultProbes() {
  return {
    pathExists: (p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    },
    /**
     * Names of containers running here, or null when no daemon is reachable.
     * null and [] are deliberately different: "no docker" and "docker with
     * nothing running" fail for different reasons and read differently in `why`.
     */
    runningContainers: () => {
      try {
        return execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
          encoding: 'utf8',
          timeout: 20000,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      } catch {
        return null;
      }
    },
  };
}

/**
 * Decide whether this process is already sitting on the production host.
 *
 * The markers are NOT a heuristic for "which machine am I". They are the exact
 * preconditions the local path needs in order to be correct:
 *
 *   1. the production checkout is at the path the commands read HEAD from;
 *   2. a docker daemon is reachable from this process;
 *   3. every container the commands `docker exec` into is running here.
 *
 * If all three hold, running the commands locally reaches precisely the repo and
 * the containers the ssh path would have reached, so local mode is right by
 * construction rather than by inference about hostnames. If any one fails, local
 * mode could not work anyway and ssh is the only remaining path.
 *
 * Residual risk, stated: a host that runs a *different* stack under these exact
 * container names would satisfy all three. That is bounded — the first query names
 * the database explicitly, so a wrong stack fails loudly on an unknown database
 * rather than returning plausible wrong facts — and `--force-ssh` overrides it.
 *
 * @returns {{mode: 'local'|'ssh', markers: object, why: string}}
 */
function detectTransportMode({ repoPath, containers, probes = defaultProbes() }) {
  const gitPath = `${repoPath}/.git`;
  const wanted = [...containers];

  const markers = {
    checkout_path: gitPath,
    checkout_present: probes.pathExists(gitPath),
    docker_socket_path: DOCKER_SOCKET,
    docker_socket_present: false,
    running_containers: null,
    missing_containers: wanted,
  };

  if (!markers.checkout_present) {
    return { mode: 'ssh', markers, why: `not the production host: no checkout at ${gitPath}` };
  }

  markers.docker_socket_present = probes.pathExists(DOCKER_SOCKET);
  if (!markers.docker_socket_present) {
    return { mode: 'ssh', markers, why: `not the production host: no docker socket at ${DOCKER_SOCKET}` };
  }

  const running = probes.runningContainers();
  markers.running_containers = running;
  if (running === null) {
    return { mode: 'ssh', markers, why: 'not the production host: the docker daemon did not answer `docker ps`' };
  }

  const missing = wanted.filter((name) => !running.includes(name));
  markers.missing_containers = missing;
  if (missing.length) {
    return { mode: 'ssh', markers, why: `not the production host: container(s) not running here: ${missing.join(', ')}` };
  }

  return {
    mode: 'local',
    markers,
    why: `on the production host: ${gitPath}, ${DOCKER_SOCKET}, containers ${wanted.join(', ')}`,
  };
}

/**
 * Build the transport.
 *
 * `run(command)` is the ONLY place a mode is allowed to matter. Both branches pass
 * the caller's `command` through untouched, as a single argv element, to a shell on
 * the production host. The ssh branch additionally names the host; that is the
 * whole of the difference.
 *
 * @param {'local'|'ssh'} mode
 * @param {string}  sshTarget            user@host, ssh mode only
 * @param {Function} exec                injected for tests; execFileSync-shaped
 * @param {string}  shell                shell used in local mode
 */
function createTransport({
  mode,
  sshTarget,
  exec = execFileSync,
  shell = '/bin/sh',
  connectTimeoutSec = 25,
  maxBuffer = 128 * 1024 * 1024,
  timeoutMs = 300000,
}) {
  if (mode !== 'local' && mode !== 'ssh') {
    throw new Error(`createTransport: unknown mode "${mode}"`);
  }
  if (mode === 'ssh' && !sshTarget) {
    throw new Error('createTransport: ssh mode requires sshTarget');
  }

  /**
   * Turn one command string into the argv that runs it on production.
   * Exposed on the transport so a test can assert both modes carry the SAME
   * command text rather than trusting that they do.
   */
  const argvFor = (command) => (mode === 'local'
    ? [shell, ['-c', command]]
    : ['ssh', ['-o', `ConnectTimeout=${connectTimeoutSec}`, '-o', 'BatchMode=yes', sshTarget, command]]);

  function run(command, { stdin, label } = {}) {
    const [file, argv] = argvFor(command);
    try {
      return exec(file, argv, {
        input: stdin,
        encoding: 'utf8',
        maxBuffer,
        timeout: timeoutMs,
      });
    } catch (err) {
      const stderr = (err.stderr || '').toString().trim();
      const who = mode === 'local' ? 'local shell' : 'ssh';
      throw new Error(
        `${who} failed${label ? ` during ${label}` : ''} (exit ${err.status}): ${stderr || err.message}`,
      );
    }
  }

  return { mode, run, argvFor };
}

module.exports = { detectTransportMode, createTransport, defaultProbes, DOCKER_SOCKET };
