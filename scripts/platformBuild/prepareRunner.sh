#!/usr/bin/env bash
# Prepares an ephemeral GitHub-hosted runner for the platform build (L13.5).
# Shared by platform-build-runner.yml and platform-build-sandbox-check.yml, so CI proves exactly
# the setup production uses.   Usage: prepareRunner.sh install | proxy | drop-sudo
set -euo pipefail

CODEX_VERSION=0.172.0   # must match codexConfig.cjs (a unit test checks)
AGENT_DIR="$RUNNER_TEMP/agent"

case "${1:-}" in
  install)
    # Codex sandboxes commands with bubblewrap and seccomp. Ubuntu 24.04 blocks the unprivileged
    # user namespaces that needs; the sysctls are absent on some images, hence `|| true`. The
    # build script proves the result, so a miss here fails the build rather than weakening it.
    sudo apt-get update -qq
    sudo apt-get install -y -qq bubblewrap > /dev/null
    sudo sysctl -qw kernel.unprivileged_userns_clone=1 2> /dev/null || true
    sudo sysctl -qw kernel.apparmor_restrict_unprivileged_userns=0 2> /dev/null || true
    mkdir -p "$AGENT_DIR"
    cd "$AGENT_DIR"
    npm init -y > /dev/null
    npm install --no-audit --no-fund --silent "@openai/codex@$CODEX_VERSION" "@openai/codex-responses-api-proxy@$CODEX_VERSION"
    # The agent's commands get a fixed PATH (codexConfig.cjs) that includes /usr/local/bin.
    sudo ln -sf "$(command -v node)" /usr/local/bin/node
    ;;
  proxy)
    if [ -z "${OPENAI_API_KEY:-}" ]; then
      echo "::warning::OPENAI_API_KEY is not set; the build step will report AuthError."
      exit 0
    fi
    # On stdin: never in the proxy's arguments or environment.
    printf '%s' "$OPENAI_API_KEY" | env -u OPENAI_API_KEY nohup \
      "$AGENT_DIR/node_modules/.bin/codex-responses-api-proxy" \
      --server-info "$RUNNER_TEMP/proxy.json" > /dev/null 2>&1 &
    unset OPENAI_API_KEY
    for _ in $(seq 1 30); do
      [ -s "$RUNNER_TEMP/proxy.json" ] && exit 0
      sleep 1
    done
    echo "::error::The key proxy did not start."
    exit 1
    ;;
  drop-sudo)
    # After this nothing in the job can become root, so nothing can read the proxy's memory.
    sudo chmod 600 /var/run/docker.sock 2> /dev/null || true
    sudo gpasswd -d "$USER" docker > /dev/null 2>&1 || true
    sudo sh -c "gpasswd -d '$USER' sudo; gpasswd -d '$USER' admin; rm -f /etc/sudoers.d/*" > /dev/null 2>&1 || true
    sudo -k 2> /dev/null || true
    if sudo -n true 2> /dev/null; then
      echo "::error::sudo is still available."
      exit 1
    fi
    ;;
  *)
    echo "usage: prepareRunner.sh install | proxy | drop-sudo" >&2
    exit 2
    ;;
esac
