"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type ActionResult,
  type ActiveCustomersQuery,
  type CreateProjectDataSource,
  type CreatedProject,
  type ProjectInsert,
  type ProjectProfilesQuery,
  type ProjectsInsertQuery,
  createProjectWithDataSource,
  formDataToCreateProjectInput,
} from "./project-create-service";
import {
  type ProjectCoreUpdate,
  type ProjectUpdateProfilesQuery,
  type ProjectsUpdateQuery,
  type UpdateProjectDataSource,
  type UpdatedProject,
  formDataToUpdateProjectCoreInput,
  updateProjectCoreWithDataSource,
} from "./project-update-service";

export async function createProjectAction(
  _previousState: ActionResult<CreatedProject>,
  formData: FormData,
): Promise<ActionResult<CreatedProject>> {
  const supabase = await createClient();

  function from(table: "profiles"): ProjectProfilesQuery;
  function from(table: "customers"): ActiveCustomersQuery;
  function from(table: "projects"): ProjectsInsertQuery;
  function from(table: "profiles" | "customers" | "projects"): ProjectProfilesQuery | ActiveCustomersQuery | ProjectsInsertQuery {
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

    if (table === "customers") {
      return {
        select() {
          return {
            eq(_column: "id", customerId: string) {
              return {
                is(_deletedAtColumn: "deleted_at", value: null) {
                  return {
                    async single() {
                      const { data, error } = await supabase
                        .from("customers")
                        .select("id")
                        .eq("id", customerId)
                        .is("deleted_at", value)
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
    }

    return {
      insert(payload: ProjectInsert) {
        return {
          select() {
            return {
              async single() {
                const { data, error } = await supabase.from("projects").insert(payload).select("id,customer_id").single();
                return { data, error };
              },
            };
          },
        };
      },
    };
  }

  const dataSource: CreateProjectDataSource = {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
  const result = await createProjectWithDataSource(dataSource, formDataToCreateProjectInput(formData));

  if (!result.success) {
    return result;
  }

  revalidatePath("/projects");
  revalidatePath(`/customers/${result.data.customer_id}`);
  revalidatePath(`/projects/${result.data.id}`);
  redirect(`/projects/${result.data.id}?created=1`);
}


export async function updateProjectCoreAction(
  _previousState: ActionResult<UpdatedProject>,
  formData: FormData,
): Promise<ActionResult<UpdatedProject>> {
  const supabase = await createClient();

  function from(table: "profiles"): ProjectUpdateProfilesQuery;
  function from(table: "projects"): ProjectsUpdateQuery;
  function from(table: "profiles" | "projects"): ProjectUpdateProfilesQuery | ProjectsUpdateQuery {
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
      update(payload: ProjectCoreUpdate) {
        return {
          eq(_column: "id", projectId: string) {
            return {
              is(_deletedAtColumn: "deleted_at", value: null) {
                return {
                  select() {
                    return {
                      async single() {
                        const { data, error } = await supabase
                          .from("projects")
                          .update(payload)
                          .eq("id", projectId)
                          .is("deleted_at", value)
                          .select("id,customer_id")
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

  const dataSource: UpdateProjectDataSource = {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
  const { projectId, values } = formDataToUpdateProjectCoreInput(formData);
  const result = await updateProjectCoreWithDataSource(dataSource, projectId, values);

  if (!result.success) {
    return result;
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${result.data.id}`);
  revalidatePath(`/customers/${result.data.customer_id}`);
  redirect(`/projects/${result.data.id}?updated=1`);
}
