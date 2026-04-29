#!/usr/bin/env bash
# set-status.sh -- transition a ticket's status:* label.
#
# Usage:
#   scripts/set-status.sh <ticket> <new-status>
#
# Where <new-status> is one of:
#   in-progress, ready-for-qa, in-qa, qa-approved,
#   prod-release-blocked, released, needs-human
#
# Removes any other status:* label currently on the issue, then adds
# status:<new-status>. Idempotent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <ticket> <new-status>" >&2
  exit 2
fi

pl_set_status "$1" "$2"
