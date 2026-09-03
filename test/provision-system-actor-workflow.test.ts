import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/provision-system-actor.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("system actor provisioning workflow", () => {
  it("exists and has only the guarded manual trigger", () => {
    expect(existsSync(workflowPath)).toBe(true);
    expect(workflow).toMatch(/^name: Provision KlimaGuy System Actor$/m);
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(workflow).toMatch(/confirmation:\n\s+description:.*PROVISION/);
    expect(workflow).toMatch(/required: true/);
    expect(workflow).toMatch(/type: string/);
    expect(workflow).toContain('if [[ "$CONFIRMATION" != "PROVISION" ]]');
    expect(workflow).toContain("Confirmation must equal PROVISION.");
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule|workflow_run|repository_dispatch|release|deployment):/m);
  });

  it("uses the constrained runner, token, concurrency and dependency contract", () => {
    expect(workflow).toMatch(/permissions:\n  contents: read/);
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).toContain("timeout-minutes: 10");
    expect(workflow).toContain("group: provision-klimaguy-system-actor");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("uses: actions/checkout@v4");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("uses: actions/setup-node@v4");
    expect(workflow).toMatch(/node-version: 22/);
    expect(workflow).toMatch(/run: npm ci$/m);
    expect(workflow).toMatch(/run: npm run provision:system-actor$/m);
  });

  it("binds exactly the three required secret names and excludes unsafe operations", () => {
    const secretReferences = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
    expect(new Set(secretReferences)).toEqual(new Set([
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SYSTEM_ACTOR_PROVISIONING_EMAIL",
    ]));
    expect(workflow).toContain("Missing required secret: NEXT_PUBLIC_SUPABASE_URL");
    expect(workflow).toContain("Missing required secret: SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("Missing required secret: SYSTEM_ACTOR_PROVISIONING_EMAIL");
    expect(workflow).not.toMatch(/SYSTEM_ACTOR_(?:ID|UUID)|KLIMAGUY_SYSTEM_ACTOR_UUID/);
    expect(workflow).not.toMatch(/\bcurl\b|\bpsql\b|insert\s+into|\bprintenv\b|\bset\s+-x\b/i);
    expect(workflow).not.toMatch(/actions\/upload-artifact|continue-on-error|\|\|\s*true/i);
  });
});
