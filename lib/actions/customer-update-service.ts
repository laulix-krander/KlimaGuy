import { z } from "zod";
import { canEditCustomer } from "@/lib/domain/permissions";
import { roleSchema, updateCustomerSchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./customer-create-service";

export type UpdatedCustomer = { id: string };

type AuthUser = { id: string };
type ProfileRow = { role: string };
export type CustomerUpdate = z.infer<typeof updateCustomerSchema>;
type UpdatedCustomerRow = { id: string };

type QueryResult<T> = { data: T | null; error: unknown };

type AuthAdapter = {
  getUser(): Promise<{ data: { user: AuthUser | null }; error: unknown }>;
};

export type UpdateProfilesQuery = {
  select(columns: "role"): {
    eq(column: "id", value: string): {
      single(): Promise<QueryResult<ProfileRow>>;
    };
  };
};

export type CustomersUpdateQuery = {
  update(payload: CustomerUpdate): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        select(columns: "id"): {
          single(): Promise<QueryResult<UpdatedCustomerRow>>;
        };
      };
    };
  };
};

export type UpdateCustomerDataSource = {
  auth: AuthAdapter;
  from(table: "profiles"): UpdateProfilesQuery;
  from(table: "customers"): CustomersUpdateQuery;
};

const customerIdSchema = z.string().uuid();

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors;
  return Object.fromEntries(
    Object.entries(flattened).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export function formDataToUpdateCustomerInput(formData: FormData): { customerId: unknown; values: unknown } {
  return {
    customerId: formData.get("customer_id"),
    values: {
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    },
  };
}

export async function updateCustomerWithDataSource(
  dataSource: UpdateCustomerDataSource,
  customerId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedCustomer>> {
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
  if (!parsedRole.success || !canEditCustomer(parsedRole.data)) {
    return { success: false, error: "Sie dürfen diesen Kunden nicht bearbeiten." };
  }

  const parsedId = customerIdSchema.safeParse(customerId);
  if (!parsedId.success) {
    return { success: false, error: "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar." };
  }

  const parsedInput = updateCustomerSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: "Bitte prüfen Sie die markierten Felder.",
      fieldErrors: fieldErrorsFromZod(parsedInput.error),
    };
  }

  const payload: CustomerUpdate = {
    first_name: parsedInput.data.first_name,
    last_name: parsedInput.data.last_name,
    email: parsedInput.data.email,
    phone: parsedInput.data.phone,
  };

  const { data, error } = await dataSource
    .from("customers")
    .update(payload)
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Der Kunde konnte nicht aktualisiert werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut." };
  }

  return { success: true, data: { id: data.id } };
}
