import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AP-16-06-06D-5 discovery authorization migration", () => {
  it("fails unauthorized calls explicitly while preserving bounded side-effect-free discovery", async () => {
    const sql=await readFile("supabase/migrations/202609090003_recovery_discovery_authorization_failure.sql","utf8");
    expect(sql.match(/auth\.role\(\) is distinct from 'service_role'/g)).toHaveLength(2);
    expect(sql.match(/raise insufficient_privilege/g)).toHaveLength(2);
    expect(sql).toMatch(/grant execute[\s\S]*service_role/);
    expect(sql).toMatch(/revoke all[\s\S]*public,anon,authenticated/);
    expect(sql.match(/limit least\(greatest\(result_limit,1\),100\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/insert into|update public|delete from/i);
  });
});
