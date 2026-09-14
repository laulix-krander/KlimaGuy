#!/usr/bin/env bash
set -euo pipefail

: "${MVP_RELEASE_GATE_DATABASE_URL:?MVP_RELEASE_GATE_DATABASE_URL must point to a disposable PostgreSQL release-gate database}"

echo "[1/2] Running the focused MVP lifecycle contract gate"
npx vitest run \
  test/test-customer-reset-operator.test.ts \
  test/close-delivery-dispatch-fence.test.ts \
  test/conversation-engine-routing.test.ts \
  test/conversation-engine-routing-migration.test.ts \
  test/mvp-project-facts-persistence.test.ts \
  test/mvp-conversation-turn.test.ts \
  test/mvp-openai-turn-provider.test.ts \
  test/productive-whatsapp-image-ingestion.test.ts \
  test/productive-whatsapp-image-ingestion-migration.test.ts \
  test/mvp-current-project-vision-migration.test.ts \
  test/mvp-qualification-readiness.test.ts \
  test/mvp-qualification-offer-handoff-migration.test.ts \
  test/project-offer.test.ts

echo "[2/2] Proving close/new-event/replay lifecycle behavior in fresh PostgreSQL"
DATABASE_URL="$MVP_RELEASE_GATE_DATABASE_URL" ./test/postgres/run-lifecycle-proof.sh

echo "Repository release-gate checks passed. Complete and record three live cycles using docs/runbooks/mvp-three-cycle-release-gate.md."
