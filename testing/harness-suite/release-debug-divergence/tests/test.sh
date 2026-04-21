#!/usr/bin/env bash
set -euo pipefail

mkdir -p /logs/verifier

if python3 /tests/verify.py; then
  echo 1 > /logs/verifier/reward.txt
else
  status=$?
  echo 0 > /logs/verifier/reward.txt
  exit "$status"
fi
