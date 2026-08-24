#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${1:-air-local}"
VISIBILITY="${2:---public}"

gh repo create "$REPO_NAME" "$VISIBILITY" --source=. --remote=origin --push
