import { provisionSystemActor, systemActorProvisioningExitCode } from "../lib/server/system-actor-provisioning.ts";
import { createSystemActorSupabaseBoundary } from "../lib/server/system-actor-supabase-adapter.ts";

let result: Awaited<ReturnType<typeof provisionSystemActor>>;
try {
  result = await provisionSystemActor(process.env.SYSTEM_ACTOR_PROVISIONING_EMAIL, createSystemActorSupabaseBoundary());
} catch {
  result = { status: "provisioning_failed" };
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = systemActorProvisioningExitCode(result);
