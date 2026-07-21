import { z } from "zod";
import { canCreateCustomer } from "@/lib/domain/permissions";
import { createCustomerSchema, roleSchema } from "@/lib/domain/schemas";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type CreatedCustomer = { id: string };

type AuthUser = { id: string };
type ProfileRow = { role: string };
export type CustomerInsert = z.infer<typeof createCustomerSchema> & { created_by: string };
type InsertedCustomerRow = { id: string };

type QueryResult<T> = { data: T | null; error: unknown };

type AuthAdapter = {
  getUser(): Promise<{ data: { user: AuthUser | null }; error: unknown }>;
};

export type ProfilesQuery = {
  select(columns: "role"): {
    eq(column: "id", value: string): {
      single(): Promise<QueryResult<ProfileRow>>;
    };
  };
};

export type CustomersInsertQuery = {
  insert(payload: CustomerInsert): {
    select(columns: "id"): {
      single(): Promise<QueryResult<InsertedCustomerRow>>;
    };
  };
};

export type CreateCustomerDataSource = {
  auth: AuthAdapter;
  from(table: "profiles"): ProfilesQuery;
  from(table: "customers"): CustomersInsertQuery;
};

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors;
  return Object.fromEntries(
    Object.entries(flattened).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export function formDataToCreateCustomerInput(formData: FormData): unknown {
  return {
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  };
}

export async function createCustomerWithDataSource(
  dataSource: CreateCustomerDataSource,
  input: unknown,
): Promise<ActionResult<CreatedCustomer>> {
  const {
    data: { user },
  } = await dataSource.auth.getUser();

  if (!user) {
    return { success: false, error: "Bitte melden Sie sich erneut an." };
  }

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) {
    return { success: false, error: "Ihr Benutzerprofil konnte nicht geladen werden." };
  }

  const parsedRole = roleSchema.safeParse(profile.role);
  if (!parsedRole.success || !canCreateCustomer(parsedRole.data)) {
    return { success: false, error: "Sie dürfen keine Kunden anlegen." };
  }

  const parsedInput = createCustomerSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: "Bitte prüfen Sie die markierten Felder.",
      fieldErrors: fieldErrorsFromZod(parsedInput.error),
    };
  }

  const payload: CustomerInsert = {
    first_name: parsedInput.data.first_name,
    last_name: parsedInput.data.last_name,
    email: parsedInput.data.email,
    phone: parsedInput.data.phone,
    created_by: user.id,
  };

  const { data, error } = await dataSource.from("customers").insert(payload).select("id").single();
  if (error || !data) {
    return { success: false, error: "Der Kunde konnte nicht angelegt werden. Bitte versuchen Sie es erneut." };
  }

  return { success: true, data: { id: data.id } };
}
