#!/usr/bin/env bash
set -Eeuo pipefail

commands=(
  "npm run build"
  "npm test"
  "npm run typecheck"
  "npm run lint"
  "git diff --check"
)

trap 'printf "\nFAIL: Repository-Prüfung abgebrochen.\n" >&2' ERR
for command in "${commands[@]}"; do
  printf '\n==> %s\n' "$command"
  eval "$command"
done
trap - ERR
printf '\nPASS: Alle %d Repository-Prüfungen waren erfolgreich.\n' "${#commands[@]}"
