#!/bin/sh
# send.sh: the only way mail leaves as Ali. Run ON THE PROD HOST (root@95.216.199.47).
#
#   scp x.json root@95.216.199.47:/tmp/ && ssh root@95.216.199.47 "/root/ali-signature/send.sh /tmp/x.json"
#
# $1 is a JSON file: { to, cc?, bcc?, subject, body, inReplyToMsgId?, attachments?: [{filename, path}], dry?: true }
# `path` on an attachment is a path INSIDE the backend container (docker cp it there first).
#
# Why a wrapper: the backend container's /tmp is wiped on every rebuild, so the signature kit is
# re-staged on every send rather than trusted to still be there. sendAsAli.js then applies the
# guards (no em/en dash in the body, no trailing sign-off or name, the real signature exactly once,
# Ali always BCC'd) and refuses the send if any fails. The kit lives at /root/ali-signature on the
# host; the canonical copies are .claude/skills/inbox-zero/{scripts/sendAsAli.js,assets/}. If the
# host copy is missing, scp those three files up first.
set -e
KIT=/root/ali-signature
docker exec accelerator-backend mkdir -p /tmp/ali-signature
docker cp "$KIT/ali_signature.html" accelerator-backend:/tmp/ali-signature/ali_signature.html
docker cp "$KIT/ali_signature_logo.png" accelerator-backend:/tmp/ali-signature/ali_signature_logo.png
docker exec -i -e SEND_JSON="$(cat "$1")" accelerator-backend node - < "$KIT/sendAsAli.js"
