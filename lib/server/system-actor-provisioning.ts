import { z } from "zod";

export const SYSTEM_ACTOR_KEY = "klimaguy_system" as const;

const uuidSchema = z.string().uuid();
const authorityResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_provisioned") }).strict(),
  z.object({ status: z.literal("provisioned"), auth_user_id: uuidSchema }).strict(),
  z.object({ status: z.literal("verified"), auth_user_id: uuidSchema }).strict(),
  z.object({ status: z.enum(["conflict", "invalid_actor", "not_authorized"]) }).strict(),
]);

export type SystemActorAuthorityResult = z.infer<typeof authorityResultSchema>;
export type SystemActorProvisioningResult =
  | { status: "provisioned" | "already_provisioned" | "verified"; auth_user_id: string }
  | { status: "conflict" | "invalid_actor" | "provisioning_failed" };

export type SystemActorProvisioningBoundary = {
  verify(): Promise<unknown>;
  findRecoverableAuthUser(email: string): Promise<{ id: string; systemActorKey: string | null } | null>;
  createAuthUser(input: { email: string; password: string; systemActorKey: typeof SYSTEM_ACTOR_KEY }): Promise<{ id: string }>;
  register(authUserId: string): Promise<unknown>;
  randomPassword(): string;
};

const emailSchema = z.string().trim().max(254).email();

/** Two-phase, retry-safe provisioning. The configured technical email is the recovery key. */
export async function provisionSystemActor(
  rawEmail: unknown,
  boundary: SystemActorProvisioningBoundary,
): Promise<SystemActorProvisioningResult> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return { status: "provisioning_failed" };
  try {
    const verification = authorityResultSchema.parse(await boundary.verify());
    if (verification.status === "verified") return { status: "already_provisioned", auth_user_id: verification.auth_user_id };
    if (verification.status !== "not_provisioned") return { status: verification.status === "conflict" ? "conflict" : "invalid_actor" };

    const recovered = await boundary.findRecoverableAuthUser(email.data);
    let authUserId: string;
    if (recovered) {
      if (recovered.systemActorKey !== SYSTEM_ACTOR_KEY) return { status: "conflict" };
      authUserId = uuidSchema.parse(recovered.id);
    } else {
      const password = boundary.randomPassword();
      if (password.length < 32) return { status: "provisioning_failed" };
      authUserId = uuidSchema.parse((await boundary.createAuthUser({ email: email.data, password, systemActorKey: SYSTEM_ACTOR_KEY })).id);
    }

    const registration = authorityResultSchema.parse(await boundary.register(authUserId));
    if (registration.status === "provisioned") return registration;
    if (registration.status === "verified" && registration.auth_user_id === authUserId) return { status: "verified", auth_user_id: authUserId };
    return { status: registration.status === "conflict" ? "conflict" : "invalid_actor" };
  } catch {
    return { status: "provisioning_failed" };
  }
}
