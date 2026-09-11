#!/usr/bin/env bash
# Add an 8GB swapfile to the production host. Approved by Ali, 2026-09-10.
#
# Idempotent by CLAUDE.md's non-negotiable rule: safe to run twice, and a second
# run makes no change and reports so. Every step checks its own end state first.
#
# The file lives on / (/dev/sda1, LOCAL disk) and deliberately NOT on
# /mnt/HC_Volume_105361916 (/dev/sdb, a Hetzner network-attached Cloud Volume) —
# swap on network storage stalls under exactly the memory pressure it exists to
# absorb.
set -euo pipefail

SWAPFILE=/swapfile
SIZE_GB=8
CHANGED=0

echo "--- step 1: is swap already active? ---"
if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAPFILE"; then
  echo "SKIP: $SWAPFILE is already active. No change."
else
  if [ -e "$SWAPFILE" ]; then
    echo "SKIP creation: $SWAPFILE exists but is not active; will try to enable it."
  else
    echo "creating ${SIZE_GB}G at $SWAPFILE on $(df -h --output=source / | tail -1)"
    avail_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
    if [ "$avail_gb" -lt $((SIZE_GB + 20)) ]; then
      echo "ABORT: only ${avail_gb}G free on /; refusing to leave under 20G headroom." >&2
      exit 1
    fi
    fallocate -l ${SIZE_GB}G "$SWAPFILE" 2>/dev/null \
      || dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SIZE_GB * 1024)) status=none
    CHANGED=1
  fi
  chmod 600 "$SWAPFILE"
  # mkswap refuses a file that already carries a signature, which is what we want
  # on a re-run; suppress only that case.
  if ! blkid "$SWAPFILE" 2>/dev/null | grep -q 'TYPE="swap"'; then
    mkswap "$SWAPFILE" >/dev/null
    CHANGED=1
  fi
  swapon "$SWAPFILE"
  CHANGED=1
  echo "swap enabled."
fi

echo
echo "--- step 2: persist across reboot ---"
if grep -qE "^[^#]*${SWAPFILE}[[:space:]]+none[[:space:]]+swap" /etc/fstab 2>/dev/null; then
  echo "SKIP: /etc/fstab already has the entry."
else
  cp /etc/fstab "/etc/fstab.bak.$(date +%Y%m%d%H%M%S)"
  printf '%s none swap sw 0 0\n' "$SWAPFILE" >> /etc/fstab
  echo "added to /etc/fstab (backup taken)."
  CHANGED=1
fi

echo
echo "--- step 3: swappiness ---"
# 60 is the desktop default and makes the kernel swap eagerly. On a host running
# five Postgres instances the swap is a safety net for bursts, not a place to put
# hot pages, so prefer reclaiming page cache first. 10 is the standard database
# setting; reversible instantly.
if [ -f /etc/sysctl.d/99-swappiness.conf ] && grep -q "vm.swappiness *= *10" /etc/sysctl.d/99-swappiness.conf; then
  echo "SKIP: already persisted at 10."
else
  echo "vm.swappiness = 10" > /etc/sysctl.d/99-swappiness.conf
  CHANGED=1
fi
sysctl -q -w vm.swappiness=10
echo "vm.swappiness now $(cat /proc/sys/vm/swappiness)"

echo
echo "--- VERIFY ---"
swapon --show
echo
free -m | head -3
echo
echo "fstab line: $(grep "$SWAPFILE" /etc/fstab)"
echo "CHANGED=$CHANGED"
