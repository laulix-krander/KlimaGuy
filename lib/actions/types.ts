import type { Role } from "@/lib/domain/types";

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string; fieldErrors?: FieldErrors };

export type CurrentUser = {
  id: string;
  role: Role;
  displayName: string | null;
};

export function actionError(error: string, fieldErrors?: FieldErrors): ActionResult {
  return { success: false, error, fieldErrors };
}
