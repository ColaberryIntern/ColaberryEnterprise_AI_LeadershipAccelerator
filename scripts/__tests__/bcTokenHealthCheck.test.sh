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
  chmod +x "$T/bin/docker" "$T/refresh.sh"
}

run_sut() {
  PATH="$T/bin:$PATH" BC_REFRESH_SCRIPT="$T/refresh.sh" BC_HEALTH_LOG="$T/health.log" \
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

echo "---"
[ "$FAILS" -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "$FAILS FAILED"; exit 1; }
