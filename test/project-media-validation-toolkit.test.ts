import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const sql = readFileSync("scripts/validate-project-media-production.sql", "utf8");
const repositoryScript = readFileSync("scripts/validate-project-media-repository.sh", "utf8");
const integrationScript = readFileSync("scripts/validate-project-media-upload.mjs", "utf8");
const runbook = readFileSync("docs/runbooks/project-media-production-validation.md", "utf8");

describe("AP-12-02-06 SQL-Verifikation", () => {
  it("besteht aus genau einer read-only WITH-Abfrage", () => {
    const withoutComments = sql.replace(/^\s*--.*$/gm, "").trim();
    expect(withoutComments.toLowerCase().startsWith("with\n")).toBe(true);
    expect(withoutComments.match(/;\s*$/g)).toHaveLength(1);
    expect(withoutComments).not.toMatch(/^\s*(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/im);
  });

  it("enthält alle 36 benannten Prüfungen und die drei Statuswerte", () => {
    for (let number = 1; number <= 36; number += 1) {
      expect(sql).toMatch(new RegExp(`select ${number},`));
    }
    for (const group of ["table_exists", "exact_17_columns", "rls_enabled", "foreign_keys_restrict", "named_check_constraints", "table_select_policies", "bucket_mime_allowlist", "storage_admin_insert_policy", "soft_delete_rpc_search_path", "migration_history"]) {
      expect(sql).toContain(`'${group}'`);
    }
    for (const status of ["PASS", "FAIL", "WARN"]) expect(sql).toContain(`'${status}'`);
  });
});

describe("AP-12-02-06 Skript-Gates", () => {
  it("führt alle Repository-Pflichtbefehle in Reihenfolge aus und stoppt beim ersten Fehler", () => {
    const commands = ["npm run build", "npm test", "npm run typecheck", "npm run lint", "git diff --check"];
    const offsets = commands.map((command) => repositoryScript.indexOf(`\"${command}\"`));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(repositoryScript).toContain("set -Eeuo pipefail");
    expect(repositoryScript).toContain("trap '");
  });

  it("ist standardmäßig gesperrt und lässt Production nicht zu", () => {
    const result = spawnSync(process.execPath, ["scripts/validate-project-media-upload.mjs"], { encoding: "utf8", env: { ...process.env, PROJECT_MEDIA_VALIDATION_ENABLED: "", PROJECT_MEDIA_VALIDATION_ENV: "" } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Validation gesperrt");
    expect(integrationScript).toContain('new Set(["local", "preview"])');
    expect(integrationScript).not.toContain("ALLOW_PRODUCTION");
  });

  it("enthält weder privilegierte Pfade, Secrets noch URL-Erzeugung", () => {
    const toolkit = [integrationScript, repositoryScript, runbook].join("\n");
    expect(toolkit).not.toMatch(/SUPABASE_[A-Z_]*KEY|service[_-]role|createSignedUrl|getPublicUrl|https:\/\//i);
    expect(integrationScript).not.toMatch(/console\.(?:log|error)\([^)]*(?:process\.env|path|filename|token|key)/i);
  });
});

describe("AP-12-02-06 Runbook", () => {
  it("enthält exakt zwei Browser-Smoke-Tests und keine manuelle Negativmatrix", () => {
    const browser = runbook.match(/## C\. Browser([\s\S]*?)## D\. Ergebnis/)?.[1] ?? "";
    expect(browser.match(/^\d+\./gm)).toHaveLength(2);
    expect(browser).toContain("Als Admin");
    expect(browser).toContain("Als Reviewer");
    expect(browser).toContain("automatisierten Tests");
    expect(browser).not.toMatch(/ablehnen|falsch|anon|Grenze|Teilfehler|direkter Versuch/i);
  });
});
