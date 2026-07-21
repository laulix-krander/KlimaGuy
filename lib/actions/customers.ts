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
