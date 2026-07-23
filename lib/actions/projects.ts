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
import {
  type ActiveProjectReviewQuery,
  type ProjectReviewProfilesQuery,
  type ProjectReviewUpdate,
  type UpdateProjectReviewDataSource,
  type UpdatedProjectReview,
  formDataToUpdateProjectReviewInput,
  updateProjectReviewWithDataSource,
} from "./project-review-service";

import {
  type ActiveProjectForNoteQuery,
  type CreatedProjectNote,
  type CreateProjectNoteDataSource,
  type ProjectNoteActionResult,
  type ProjectNoteInsert,
  type ProjectNoteProfilesQuery,
  type ProjectNotesInsertQuery,
  createProjectNoteWithDataSource,
  formDataToCreateProjectNoteInput,
} from "./project-note-create-service";

import {
  type ActiveProjectForNoteUpdateQuery,
  type ProjectNoteMutationResult,
  type ProjectNoteUpdatePatch,
  type ProjectNoteUpdateProfilesQuery,
  type ProjectNoteUpdateQuery,
  type UpdateProjectNoteDataSource,
  type UpdatedProjectNote,
  formDataToUpdateProjectNoteInput,
  updateProjectNoteWithDataSource,
} from "./project-note-update-service";
import {
  type ActiveProjectForNoteDeleteQuery,
  type ProjectNoteDeletePatch,
  type ProjectNoteDeleteProfilesQuery,
  type ProjectNoteDeleteQuery,
  type SoftDeleteProjectNoteDataSource,
  type SoftDeletedProjectNote,
  formDataToDeleteProjectNoteInput,
  softDeleteProjectNoteWithDataSource,
} from "./project-note-delete-service";

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


export async function updateProjectReviewAction(
  _previousState: ActionResult<UpdatedProjectReview>,
  formData: FormData,
): Promise<ActionResult<UpdatedProjectReview>> {
  const supabase = await createClient();

  function from(table: "profiles"): ProjectReviewProfilesQuery;
  function from(table: "projects"): ActiveProjectReviewQuery;
  function from(table: "profiles" | "projects"): ProjectReviewProfilesQuery | ActiveProjectReviewQuery {
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
      select() {
        return {
          eq(_column: "id", projectId: string) {
            return {
              is(_deletedAtColumn: "deleted_at", value: null) {
                return {
                  async single() {
                    const { data, error } = await supabase
                      .from("projects")
                      .select("id,customer_id,status")
                      .eq("id", projectId)
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
      update(payload: ProjectReviewUpdate) {
        return {
          eq(_idColumn: "id", projectId: string) {
            return {
              eq(_statusColumn: "status", currentStatus: import("@/lib/domain/types").ProjectStatus) {
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
                              .eq("status", currentStatus)
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
      },
    };
  }

  const dataSource: UpdateProjectReviewDataSource = {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
  const { projectId, values } = formDataToUpdateProjectReviewInput(formData);
  const result = await updateProjectReviewWithDataSource(dataSource, projectId, values);

  if (!result.success) {
    return result;
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${result.data.id}`);
  revalidatePath(`/customers/${result.data.customer_id}`);
  redirect(`/projects/${result.data.id}?review_updated=1`);
}


export async function createProjectNoteAction(
  _previousState: ProjectNoteActionResult<CreatedProjectNote>,
  formData: FormData,
): Promise<ProjectNoteActionResult<CreatedProjectNote>> {
  const supabase = await createClient();

  function from(table: "profiles"): ProjectNoteProfilesQuery;
  function from(table: "projects"): ActiveProjectForNoteQuery;
  function from(table: "project_notes"): ProjectNotesInsertQuery;
  function from(table: "profiles" | "projects" | "project_notes"): ProjectNoteProfilesQuery | ActiveProjectForNoteQuery | ProjectNotesInsertQuery {
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

    if (table === "projects") {
      return {
        select() {
          return {
            eq(_column: "id", projectId: string) {
              return {
                is(_deletedAtColumn: "deleted_at", value: null) {
                  return {
                    async single() {
                      const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", value).single();
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
      insert(payload: ProjectNoteInsert) {
        return {
          select() {
            return {
              async single() {
                const { data, error } = await supabase.from("project_notes").insert(payload).select("id,project_id").single();
                return { data, error };
              },
            };
          },
        };
      },
    };
  }

  const dataSource: CreateProjectNoteDataSource = {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
  const result = await createProjectNoteWithDataSource(dataSource, formDataToCreateProjectNoteInput(formData));

  if (!result.success) return result;

  revalidatePath(`/projects/${result.data.project_id}`);
  redirect(`/projects/${result.data.project_id}?note_created=1`);
}


function buildProjectNoteMutationDataSource(supabase: Awaited<ReturnType<typeof createClient>>): UpdateProjectNoteDataSource & SoftDeleteProjectNoteDataSource {
  function from(table: "profiles"): ProjectNoteUpdateProfilesQuery & ProjectNoteDeleteProfilesQuery;
  function from(table: "projects"): ActiveProjectForNoteUpdateQuery & ActiveProjectForNoteDeleteQuery;
  function from(table: "project_notes"): ProjectNoteUpdateQuery & ProjectNoteDeleteQuery;
  function from(table: "profiles" | "projects" | "project_notes"): (ProjectNoteUpdateProfilesQuery & ProjectNoteDeleteProfilesQuery) | (ActiveProjectForNoteUpdateQuery & ActiveProjectForNoteDeleteQuery) | (ProjectNoteUpdateQuery & ProjectNoteDeleteQuery) {
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

    if (table === "projects") {
      return {
        select() {
          return {
            eq(_column: "id", projectId: string) {
              return {
                is(_deletedAtColumn: "deleted_at", value: null) {
                  return {
                    async single() {
                      const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", value).single();
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
      select() {
        return {
          eq(_idColumn: "id", noteId: string) {
            return {
              eq(_projectIdColumn: "project_id", projectId: string) {
                return {
                  is(_deletedAtColumn: "deleted_at", value: null) {
                    return {
                      async single() {
                        const { data, error } = await supabase
                          .from("project_notes")
                          .select("id,project_id,created_by")
                          .eq("id", noteId)
                          .eq("project_id", projectId)
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
      },
      update: ((payload: ProjectNoteUpdatePatch | ProjectNoteDeletePatch, options?: { count: "exact" }) => {
        return {
          eq(_idColumn: "id", noteId: string) {
            return {
              eq(_projectIdColumn: "project_id", projectId: string) {
                return {
                  is(_deletedAtColumn: "deleted_at", value: null) {
                    if (options) {
                      return supabase.from("project_notes").update(payload, options).eq("id", noteId).eq("project_id", projectId).is("deleted_at", value);
                    }
                    return {
                      select() {
                        return {
                          async single() {
                            const { data, error } = await supabase
                              .from("project_notes")
                              .update(payload)
                              .eq("id", noteId)
                              .eq("project_id", projectId)
                              .is("deleted_at", value)
                              .select("id,project_id")
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
      }) as unknown as ProjectNoteUpdateQuery["update"] & ProjectNoteDeleteQuery["update"],
    };
  }

  return {
    auth: {
      async getUser() {
        return supabase.auth.getUser();
      },
    },
    from,
  };
}

export async function updateProjectNoteAction(
  _previousState: ProjectNoteMutationResult<UpdatedProjectNote>,
  formData: FormData,
): Promise<ProjectNoteMutationResult<UpdatedProjectNote>> {
  const supabase = await createClient();
  const result = await updateProjectNoteWithDataSource(buildProjectNoteMutationDataSource(supabase), formDataToUpdateProjectNoteInput(formData));

  if (!result.success) return result;

  revalidatePath(`/projects/${result.data.project_id}`);
  redirect(`/projects/${result.data.project_id}?note_updated=1`);
}

export async function softDeleteProjectNoteAction(
  _previousState: ProjectNoteMutationResult<SoftDeletedProjectNote>,
  formData: FormData,
): Promise<ProjectNoteMutationResult<SoftDeletedProjectNote>> {
  const supabase = await createClient();
  const result = await softDeleteProjectNoteWithDataSource(buildProjectNoteMutationDataSource(supabase), formDataToDeleteProjectNoteInput(formData));

  if (!result.success) return result;

  revalidatePath(`/projects/${result.data.project_id}`);
  redirect(`/projects/${result.data.project_id}?note_deleted=1`);
}
