#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export CAPTURE_READY_SELECTOR="${CAPTURE_READY_SELECTOR:-body[data-ready=\"1\"]}"
/usr/bin/time -p node "${RUNTIME_DIR:?}/scripts/default-capture.mjs"
