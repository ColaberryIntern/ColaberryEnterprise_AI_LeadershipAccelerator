#!/bin/bash
# Provision Kes Delele on the prod VPS for Dev 2 work.
#
# Creates a non-root user `kes`, drops his ed25519 pubkey into
# /home/kes/.ssh/authorized_keys (NOT root's), and adds him to the
# docker group so he can run `docker compose` against the dev2 stack
# without sudo.
#
# Run from your local machine:
#   bash scripts/provision-kes-vps-access.sh
#
# Idempotent - safe to re-run.

set -euo pipefail

KES_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB92Ii5BDEKI5AUf33b2AXNVj5Nb6ZSMzMrzPx/M/gG4 keset@local"
VPS="root@95.216.199.47"

ssh "$VPS" bash <<EOF
set -e

# 1. Create user if not exists
if ! id kes >/dev/null 2>&1; then
  useradd -m -s /bin/bash kes
  echo "[provision] user kes created"
else
  echo "[provision] user kes already exists"
fi

# 2. Add to docker group (lets him run docker compose without sudo)
usermod -aG docker kes
echo "[provision] kes added to docker group"

# 3. SSH key setup (his key, his authorized_keys - NOT root's)
mkdir -p /home/kes/.ssh
chmod 700 /home/kes/.ssh
grep -qxF "$KES_PUBKEY" /home/kes/.ssh/authorized_keys 2>/dev/null || \
  echo "$KES_PUBKEY" >> /home/kes/.ssh/authorized_keys
chmod 600 /home/kes/.ssh/authorized_keys
chown -R kes:kes /home/kes/.ssh
echo "[provision] pubkey installed in /home/kes/.ssh/authorized_keys"

# 4. NO sudo. NO write access to /opt/colaberry-accelerator.
# He clones the repo into his own home dir and runs his own dev stack
# on a different port if needed. Shared dev2 deploys still gate on Ali.

# 5. Print connection info
echo ""
echo "==== kes provisioned ===="
echo "  ssh kes@95.216.199.47"
echo "  groups: \$(id -Gn kes)"
echo "  home:   /home/kes/"
echo "========================="
EOF

echo ""
echo "Done. Tell Kes to test with: ssh kes@95.216.199.47"
