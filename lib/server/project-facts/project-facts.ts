import { z } from "zod";
import {
  MVP_PROJECT_FACT_KEYS,
  mvpProjectFactSchema,
  type MvpProjectFact,
} from "@/lib/domain/mvp-project-facts";

const projectIdSchema = z.string().uuid();

const projectFactPatchSchema = z.array(mvpProjectFactSchema)
  .max(MVP_PROJECT_FACT_KEYS.length)
  .superRefine((facts, context) => {
    if (new Set(facts.map(({ key }) => key)).size !== facts.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate_fact_key" });
    }
  });

const persistedFactsSchema = z.array(mvpProjectFactSchema)
  .max(MVP_PROJECT_FACT_KEYS.length)
  .superRefine((facts, context) => {
    if (new Set(facts.map(({ key }) => key)).size !== facts.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate_persisted_fact_key" });
    }
  });

export type ProjectFactsRpc = {
  rpc(
    name: "apply_mvp_project_fact_patch" | "get_mvp_project_facts",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export class ProjectFactsPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectFactsPersistenceError";
  }
}

/** The only application write boundary for the current MVP Project facts. */
export async function applyProjectFactPatch(
  source: ProjectFactsRpc,
  projectId: string,
  patch: unknown,
): Promise<readonly MvpProjectFact[]> {
  const parsedProjectId = projectIdSchema.parse(projectId);
  const parsedPatch = projectFactPatchSchema.parse(patch);
  const { data, error } = await source.rpc("apply_mvp_project_fact_patch", {
    target_project_id: parsedProjectId,
    fact_patch: parsedPatch,
  });

  if (error) {
    throw new ProjectFactsPersistenceError(error.message ?? "project_fact_write_failed");
  }

  return persistedFactsSchema.parse(data);
}

/** Loads a validated Step-5 `persisted_facts` value, never arbitrary JSON. */
export async function getProjectFacts(
  source: ProjectFactsRpc,
  projectId: string,
): Promise<readonly MvpProjectFact[]> {
  const parsedProjectId = projectIdSchema.parse(projectId);
  const { data, error } = await source.rpc("get_mvp_project_facts", {
    target_project_id: parsedProjectId,
  });

  if (error) {
    throw new ProjectFactsPersistenceError(error.message ?? "project_fact_read_failed");
  }

  return persistedFactsSchema.parse(data);
}
