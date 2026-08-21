import { roleSchema } from "@/lib/domain/schemas";
import {
  evidenceInterpretationRunDtoSchema, persistentObservationDtoSchema,
  recordPersistentObservationInputSchema, startEvidenceInterpretationInputSchema,
  type EvidenceInterpretationRunDto, type PersistentObservationDto,
} from "@/lib/domain/conversation-intelligence/persistent-evidence-interpretation";

type Result<T> = Promise<{ data: T | null; error: unknown }>;
export type InterpretationDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(id: string): Result<{ role: string | null }>;
  start(input: { project_id: string; evidence_id: string }): Result<unknown>;
  record(input: zRecordInput): Result<unknown>;
  listRuns(projectId: string, evidenceId?: string): Result<unknown[]>;
  listObservations(projectId: string, evidenceId?: string): Result<unknown[]>;
};
type zRecordInput = { interpretation_run_id: string; observation_id: string; observation_type: string; observation_value: { kind: "visibility"; value: "visible" | "not_visible" } | { kind: "evidence_condition"; value: null }; evidence_quality: string; interpretation_status: string };
type Failure = { success: false; code: "invalid_input" | "not_authenticated" | "not_authorized" | "unavailable" | "persistence_failed"; error: string };

async function admin(source: InterpretationDataSource): Promise<boolean | "anonymous"> {
  const { data } = await source.auth.getUser(); if (!data.user) return "anonymous";
  const profile = await source.getProfile(data.user.id); return roleSchema.safeParse(profile.data?.role).data === "admin";
}
const failure = (code: Failure["code"], error: string): Failure => ({ success: false, code, error });

export async function startEvidenceInterpretation(source: InterpretationDataSource, input: unknown): Promise<{ success: true; data: EvidenceInterpretationRunDto } | Failure> {
  const parsed = startEvidenceInterpretationInputSchema.safeParse(input); if (!parsed.success) return failure("invalid_input", "Ungültige Interpretation.");
  const allowed = await admin(source); if (allowed === "anonymous") return failure("not_authenticated", "Zugriff nicht erlaubt."); if (!allowed) return failure("not_authorized", "Zugriff nicht erlaubt.");
  const result = await source.start(parsed.data); if (result.error || !result.data) return failure("unavailable", "Evidence kann nicht interpretiert werden.");
  const dto = evidenceInterpretationRunDtoSchema.safeParse(result.data); return dto.success ? { success: true, data: dto.data } : failure("persistence_failed", "Interpretation konnte nicht gespeichert werden.");
}

export async function recordPersistentEvidenceObservation(source: InterpretationDataSource, input: unknown): Promise<{ success: true; data: { run: EvidenceInterpretationRunDto; observation: PersistentObservationDto } } | Failure> {
  const parsed = recordPersistentObservationInputSchema.safeParse(input); if (!parsed.success) return failure("invalid_input", "Ungültige Beobachtung.");
  const allowed = await admin(source); if (allowed === "anonymous") return failure("not_authenticated", "Zugriff nicht erlaubt."); if (!allowed) return failure("not_authorized", "Zugriff nicht erlaubt.");
  const result = await source.record(parsed.data); if (result.error || !result.data || typeof result.data !== "object") return failure("persistence_failed", "Beobachtung konnte nicht gespeichert werden.");
  const value = result.data as { run?: unknown; observation?: unknown };
  const run = evidenceInterpretationRunDtoSchema.safeParse(value.run), observation = persistentObservationDtoSchema.safeParse(value.observation);
  return run.success && observation.success ? { success: true, data: { run: run.data, observation: observation.data } } : failure("persistence_failed", "Ungültige gespeicherte Beobachtung.");
}

export async function readEvidenceInterpretations(source: InterpretationDataSource, projectId: string, evidenceId?: string): Promise<{ success: true; data: { runs: EvidenceInterpretationRunDto[]; observations: PersistentObservationDto[] } } | Failure> {
  const input = startEvidenceInterpretationInputSchema.shape.project_id.safeParse(projectId); if (!input.success) return failure("invalid_input", "Ungültiges Projekt.");
  const allowed = await admin(source); if (allowed === "anonymous") return failure("not_authenticated", "Zugriff nicht erlaubt."); if (!allowed) return failure("not_authorized", "Zugriff nicht erlaubt.");
  const [runs, observations] = await Promise.all([source.listRuns(input.data, evidenceId), source.listObservations(input.data, evidenceId)]);
  const parsedRuns = runs.data?.map((row) => evidenceInterpretationRunDtoSchema.safeParse(row)); const parsedObs = observations.data?.map((row) => persistentObservationDtoSchema.safeParse(row));
  if (runs.error || observations.error || !parsedRuns || !parsedObs || parsedRuns.some((x) => !x.success) || parsedObs.some((x) => !x.success)) return failure("persistence_failed", "Interpretationen konnten nicht geladen werden.");
  return { success: true, data: { runs: parsedRuns.flatMap((x) => x.success ? [x.data] : []), observations: parsedObs.flatMap((x) => x.success ? [x.data] : []) } };
}
