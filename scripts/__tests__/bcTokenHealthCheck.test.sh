#!/usr/bin/env bash
# Tests for scripts/bcTokenHealthCheck.sh — the self-heal-before-alert flow.
# Stubs `docker` and the refresh script, so nothing touches CCPP, Basecamp or Mandrill.
#   run:  bash scripts/__tests__/bcTokenHealthCheck.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$HERE/../bcTokenHealthCheck.sh"
FAILS=0

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }

# setup <probe exit codes...> ; env REFRESH_RC controls the stub refresh's exit code
setup() {
  T="$(mktemp -d)"
  mkdir -p "$T/bin"
  printf '%s\n' "$@" > "$T/probe_codes"
  # Fake docker: records env flags + JS, pops the next exit code.
  cat > "$T/bin/docker" <<EOF
#!/usr/bin/env bash
n=\$(( \$(cat "$T/calls" 2>/dev/null || echo 0) + 1 )); echo "\$n" > "$T/calls"
for a in "\$@"; do case "\$a" in BC_ALERT=*|BC_REFRESH_NOTE=*) printf '%s\n' "\$a" >> "$T/env.\$n";; esac; done
printf '%s' "\${@: -1}" > "$T/probe.js"
exit "\$(sed -n "\${n}p" "$T/probe_codes")"
EOF
  cat > "$T/refresh.sh" <<EOF
#!/usr/bin/env bash
echo "\$*" > "$T/refresh_args"
echo "minted token prefix: AAAAAAAA"
echo "probe HTTP 200 (expect 200)"
exit \${REFRESH_RC:-0}
EOF
  # Fake flock: records its args, then runs the command, or reports the lock as busy.
  cat > "$T/bin/flock" <<EOF
#!/usr/bin/env bash
echo "\$*" > "$T/flock_args"
[ -n "\${LOCK_BUSY:-}" ] && exit 75
shift 5; exec "\$@"
EOF
  chmod +x "$T/bin/docker" "$T/bin/flock" "$T/refresh.sh"
}

run_sut() {
  PATH="$T/bin:$PATH" BC_REFRESH_SCRIPT="$T/refresh.sh" BC_HEALTH_LOG="$T/health.log" BC_MINT_LOCK="$T/lock/bc-mint.lock" \
    bash "$SUT" > "$T/out" 2>&1
  echo $?
}

# 1. Healthy: one probe, no refresh, exit 0.
setup 0
rc=$(run_sut)
[ "$rc" = 0 ] && [ "$(cat "$T/calls")" = 1 ] && [ ! -f "$T/refresh_args" ] \
  && pass "healthy token: no refresh, no alert" || fail "healthy token (rc=$rc)"
grep -q '^BC_ALERT=0$' "$T/env.1" && pass "first probe never alerts" || fail "first probe alert flag"
# The embedded JS must be valid after bash quoting.
if command -v node >/dev/null; then
  node --check "$T/probe.js" && pass "probe JS parses" || fail "probe JS has a syntax error"
fi
grep -q 'basecampapi.com/3945211/my/profile.json' "$T/probe.js" && pass "account id interpolated" || fail "account id interpolation"

# 2. Expired then healed: refresh runs with --commit, second probe is alert-armed, exit 0, no alert.
setup 2 0
rc=$(run_sut)
[ "$rc" = 0 ] && [ "$(cat "$T/refresh_args")" = "--commit" ] && grep -q 'HEALED by refresh' "$T/out" \
  && pass "expired token healed by refresh, no alert" || fail "heal path (rc=$rc)"
grep -q '^BC_ALERT=1$' "$T/env.2" && pass "re-probe is alert-armed" || fail "re-probe alert flag"
grep -q 'HEALED' "$T/health.log" && pass "outcome written to log" || fail "log write"

# 3. Still dead after refresh: alert pass returns 2, refresh tail reaches the alert.
setup 2 2
rc=$(REFRESH_RC=1 run_sut)
[ "$rc" = 2 ] && pass "still unhealthy after refresh -> exit 2 (alert sent)" || fail "dead path (rc=$rc)"
grep -q 'BC_REFRESH_NOTE=exit 1' "$T/env.2" && grep -q 'minted token prefix' "$T/env.2" \
  && pass "refresh exit + tail passed into alert" || fail "refresh note"

# 4. Probe error (CCPP down) on both passes: refresh still attempted, exit 3.
setup 3 3
rc=$(run_sut)
[ "$rc" = 3 ] && [ -f "$T/refresh_args" ] && pass "probe error -> refresh attempted, exit 3" || fail "probe error path (rc=$rc)"

# 5. Idempotent: two healthy runs produce identical outcomes, no side effects.
setup 0 0
r1=$(run_sut); rm -f "$T/calls"; r2=$(run_sut)
[ "$r1" = 0 ] && [ "$r2" = 0 ] && [ ! -f "$T/refresh_args" ] && pass "rerun is idempotent" || fail "idempotency"

# 6. The refresh runs under the shared mint lock, with a bounded wait.
setup 2 0
rc=$(run_sut)
[ "$rc" = 0 ] && grep -q -- "-w 120 -E 75 $T/lock/bc-mint.lock $T/refresh.sh --commit" "$T/flock_args" \
  && pass "refresh runs under the mint lock" || fail "mint lock (rc=$rc)"
grep -q 'ops-engine/bc-mint.lock' "$SUT" && grep -q 'ops-engine/bc-mint.lock' "$HERE/../cron-env-wrapper.sh" \
  && pass "same lock file as cron-env-wrapper" || fail "lock path differs from cron-env-wrapper"

# 7. Lock busy: refresh skipped, still re-probes, and the alert says why.
setup 2 2
rc=$(LOCK_BUSY=1 run_sut)
[ "$rc" = 2 ] && [ ! -f "$T/refresh_args" ] && [ "$(cat "$T/calls")" = 2 ] \
  && pass "lock busy: refresh skipped, re-probed" || fail "lock busy (rc=$rc)"
grep -q 'BC_REFRESH_NOTE=exit 75' "$T/env.2" && grep -q 'mint lock busy' "$T/env.2" \
  && pass "alert explains the busy lock" || fail "busy lock note"

# 8. Run the real probe JS with a stub DB and stub fetch. Only the token named "new" is accepted.
run_probe_js() {  # $1 = JSON list of tokens the DB returns, in order
  mkdir -p "$T/node_modules/mssql"
  cat > "$T/node_modules/mssql/index.js" <<'EOF'
const toks = JSON.parse(process.env.TOKENS); let n = 0;
module.exports = { connect: async () => {}, close: async () => {},
  Request: class { async query() { return { recordset: [{ AccessToken: toks[Math.min(n++, toks.length - 1)] }] }; } } };
EOF
  echo 'global.fetch = async (u, o) => ({ status: o.headers.Authorization === "Bearer new" ? 200 : 401, json: async () => ({ name: "Test", id: 1 }) });' > "$T/preload.js"
  (cd "$T" && TOKENS="$1" BC_ALERT=0 BC_CONFIRM_DELAY_MS=10 node -r ./preload.js probe.js > js.out 2>&1; echo $?)
}
rc=$(run_probe_js '["old","new"]')
[ "$rc" = 0 ] && grep -q 'CONFIRM HTTP 200' "$T/js.out" \
  && pass "token replaced mid-check: confirm uses the new token" || fail "confirm reused the stale token (rc=$rc)"
rc=$(run_probe_js '["old"]')
[ "$rc" = 2 ] && pass "token still dead at confirm -> unhealthy" || fail "dead token (rc=$rc)"

echo "---"
[ "$FAILS" -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "$FAILS FAILED"; exit 1; }
