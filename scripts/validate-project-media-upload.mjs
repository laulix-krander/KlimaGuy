#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const enabled = process.env.PROJECT_MEDIA_VALIDATION_ENABLED === "true";
const environment = process.env.PROJECT_MEDIA_VALIDATION_ENV;
const allowedEnvironments = new Set(["local", "preview"]);

if (!enabled) {
  console.error("Validation gesperrt: PROJECT_MEDIA_VALIDATION_ENABLED=true fehlt.");
  process.exit(2);
}
if (!allowedEnvironments.has(environment)) {
  console.error("Validation gesperrt: PROJECT_MEDIA_VALIDATION_ENV muss local oder preview sein.");
  process.exit(2);
}

console.log(`Starte sichere Adapter-Validierung (${environment}).`);
const result = spawnSync(
  "npm",
  ["test", "--", "test/project-media-upload-integration.test.ts"],
  { stdio: "inherit", env: { ...process.env, PROJECT_MEDIA_VALIDATION_ENV: environment } },
);

if (result.error) {
  console.error("Adapter-Validierung konnte nicht gestartet werden.");
  process.exit(1);
}
process.exit(result.status ?? 1);
