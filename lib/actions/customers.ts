"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type ActionResult,
  type CreatedCustomer,
  type CreateCustomerDataSource,
  type CustomerInsert,
  type CustomersInsertQuery,
  type ProfilesQuery,
  createCustomerWithDataSource,
  formDataToCreateCustomerInput,
} from "./customer-create-service";

import {
  type CustomerUpdate,
  type CustomersUpdateQuery,
  type UpdateCustomerDataSource,
  type UpdateProfilesQuery,
  type UpdatedCustomer,
  formDataToUpdateCustomerInput,
  updateCustomerWithDataSource,
} from "./customer-update-service";

export async function createCustomerAction(
  _previousState: ActionResult<CreatedCustomer>,
  formData: FormData,
): Promise<ActionResult<CreatedCustomer>> {
  const supabase = await createClient();
  function from(table: "profiles"): ProfilesQuery;
  function from(table: "customers"): CustomersInsertQuery;
  function from(table: "profiles" | "customers"): ProfilesQuery | CustomersInsertQuery {
    if (table === "profiles") {
      return {
        select() {
          return {
            eq(_column: "id", value: string) {
              return {
                async single() {
                  const { data, error } = await supabase.from("profiles").select("role").eq("id", value).single();
                  return { data, error };
                },
              };
            },
          };
        },
      };
    }

    return {
      insert(payload: CustomerInsert) {
        return {
          select() {
            return {
              async single() {
                const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
                return { data, error };
              },
            };
          },
        };
      },
    };
  }

  const dataSource: CreateCustomerDataSource = {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
  const result = await createCustomerWithDataSource(dataSource, formDataToCreateCustomerInput(formData));

  if (!result.success) {
    return result;
  }

  revalidatePath("/customers");
  redirect(`/customers/${result.data.id}?created=1`);
}


export async function updateCustomerAction(
  _previousState: ActionResult<UpdatedCustomer>,
  formData: FormData,
): Promise<ActionResult<UpdatedCustomer>> {
  const supabase = await createClient();
  function from(table: "profiles"): UpdateProfilesQuery;
  function from(table: "customers"): CustomersUpdateQuery;
  function from(table: "profiles" | "customers"): UpdateProfilesQuery | CustomersUpdateQuery {
    if (table === "profiles") {
      return {
        select() {
          return {
            eq(_column: "id", value: string) {
              return {
                async single() {
                  const { data, error } = await supabase.from("profiles").select("role").eq("id", value).single();
                  return { data, error };
                },
              };
            },
          };
        },
      };
    }

    return {
      update(payload: CustomerUpdate) {
        return {
          eq(_column: "id", customerId: string) {
            return {
              is(_deletedAtColumn: "deleted_at", value: null) {
                return {
                  select() {
                    return {
                      async single() {
                        const { data, error } = await supabase
                          .from("customers")
                          .update(payload)
                          .eq("id", customerId)
                          .is("deleted_at", value)
                          .select("id")
                          .single();
                        return { data, error };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  const dataSource: UpdateCustomerDataSource = {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
  const { customerId, values } = formDataToUpdateCustomerInput(formData);
  const result = await updateCustomerWithDataSource(dataSource, customerId, values);

  if (!result.success) {
    return result;
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${result.data.id}`);
  redirect(`/customers/${result.data.id}?updated=1`);
}
