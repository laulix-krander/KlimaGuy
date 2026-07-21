import { z } from "zod";
import { canSoftDeleteCustomer } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./customer-create-service";

export const deleteCustomerSchema = z.object({ customer_id: z.string().uuid() }).strip();

export type DeletedCustomer = { id: string };
export type CustomerSoftDeletePayload = { deleted_at: string };

type AuthUser = { id: string };
type ProfileRow = { role: string };
type CustomerRow = { id: string };
type ProjectRow = { id: string };

type QueryResult<T> = { data: T | null; error: unknown };

type AuthAdapter = {
  getUser(): Promise<{ data: { user: AuthUser | null }; error: unknown }>;
};

export type DeleteProfilesQuery = {
  select(columns: "role"): {
    eq(column: "id", value: string): {
      single(): Promise<QueryResult<ProfileRow>>;
    };
  };
};

export type CustomersDeleteQuery = {
  select(columns: "id"): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        single(): Promise<QueryResult<CustomerRow>>;
      };
    };
  };
  update(payload: CustomerSoftDeletePayload): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        select(columns: "id"): {
          single(): Promise<QueryResult<CustomerRow>>;
        };
      };
    };
  };
};

export type ProjectsForCustomerQuery = {
  select(columns: "id"): {
    eq(column: "customer_id", value: string): {
      is(column: "deleted_at", value: null): {
        limit(count: 1): Promise<QueryResult<ProjectRow[]>>;
      };
    };
  };
};

export type DeleteCustomerDataSource = {
  auth: AuthAdapter;
  from(table: "profiles"): DeleteProfilesQuery;
  from(table: "customers"): CustomersDeleteQuery;
  from(table: "projects"): ProjectsForCustomerQuery;
};

type DeleteCustomerOptions = {
  now?: () => string;
};

export function formDataToDeleteCustomerInput(formData: FormData): unknown {
  return {
    customer_id: formData.get("customer_id"),
  };
}

export async function softDeleteCustomerWithDataSource(
  dataSource: DeleteCustomerDataSource,
  input: unknown,
  options: DeleteCustomerOptions = {},
): Promise<ActionResult<DeletedCustomer>> {
  const {
    data: { user },
  } = await dataSource.auth.getUser();

  if (!user) {
    return { success: false, error: "Sie müssen angemeldet sein." };
  }

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) {
    return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  }

  const parsedRole = roleSchema.safeParse(profile.role);
  if (!parsedRole.success) {
    return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  }

  if (!canSoftDeleteCustomer(parsedRole.data)) {
    return { success: false, error: "Sie sind nicht berechtigt, Kunden zu löschen." };
  }

  const parsedInput = deleteCustomerSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Die Kunden-ID ist ungültig." };
  }

  const customerId = parsedInput.data.customer_id;
  const { data: activeCustomer } = await dataSource
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .is("deleted_at", null)
    .single();

  if (!activeCustomer) {
    return { success: false, error: "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar." };
  }

  const { data: activeProjects, error: projectError } = await dataSource
    .from("projects")
    .select("id")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .limit(1);

  if (projectError) {
    return { success: false, error: "Der Kunde konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." };
  }

  if (activeProjects && activeProjects.length > 0) {
    return { success: false, error: "Der Kunde kann nicht gelöscht werden, solange ihm Projekte zugeordnet sind." };
  }

  const payload: CustomerSoftDeletePayload = {
    deleted_at: options.now?.() ?? new Date().toISOString(),
  };

  const { data, error } = await dataSource
    .from("customers")
    .update(payload)
    .eq("id", customerId)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Der Kunde konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." };
  }

  return { success: true, data: { id: data.id } };
}
