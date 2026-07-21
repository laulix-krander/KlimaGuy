import { describe, expect, it } from "vitest";
import {
  createProjectWithDataSource,
  formDataToCreateProjectInput,
  type ActiveCustomersQuery,
  type CreateProjectDataSource,
  type ProjectInsert,
  type ProjectProfilesQuery,
  type ProjectsInsertQuery,
} from "@/lib/actions/project-create-service";
import { canCreateProject } from "@/lib/domain/permissions";
import { createProjectSchema } from "@/lib/domain/schemas";
import { DEFAULT_REQUIRES_HUMAN_REVIEW, PROJECT_STATUSES } from "@/lib/domain/types";

const validCustomerId = "33333333-3333-4333-8333-333333333333";
const validProjectId = "44444444-4444-4444-8444-444444444444";
const userId = "11111111-1111-4111-8111-111111111111";

type MockOptions = {
  userId?: string | null;
  role?: string | null;
  activeCustomer?: boolean;
  insertError?: boolean;
  insertId?: string | null;
  insertedCustomerId?: string;
};

type CustomerCall = { customerId?: string; deletedAtFilter?: null };
type InsertCall = { payload: ProjectInsert };

function createMockDataSource(options: MockOptions = {}) {
  const customerCalls: CustomerCall[] = [];
  const insertCalls: InsertCall[] = [];
  const authUserId = options.userId === undefined ? userId : options.userId;
  const role = options.role === undefined ? "admin" : options.role;
  const dataSource: CreateProjectDataSource = {
    auth: {
      async getUser() {
        return { data: { user: authUserId ? { id: authUserId } : null } };
      },
    },
    from: createMockFrom(role, customerCalls, insertCalls, options),
  };
  return { dataSource, customerCalls, insertCalls };
}

function createMockFrom(
  role: string | null,
  customerCalls: CustomerCall[],
  insertCalls: InsertCall[],
  options: MockOptions,
): CreateProjectDataSource["from"] {
  function from(table: "profiles"): ProjectProfilesQuery;
  function from(table: "customers"): ActiveCustomersQuery;
  function from(table: "projects"): ProjectsInsertQuery;
  function from(table: "profiles" | "customers" | "projects"): ProjectProfilesQuery | ActiveCustomersQuery | ProjectsInsertQuery {
    if (table === "profiles") {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return { data: role ? { role } : null, error: null };
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
              const call: CustomerCall = { customerId };
              customerCalls.push(call);
              return {
                is(_column: "deleted_at", value: null) {
                  call.deletedAtFilter = value;
                  return {
                    async single() {
                      const activeCustomer = options.activeCustomer ?? true;
                      return { data: activeCustomer ? { id: customerId } : null, error: null };
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
        insertCalls.push({ payload });
        return {
          select() {
            return {
              async single() {
                if (options.insertError) return { data: null, error: { message: "private insert db error" } };
                return {
                  data: options.insertId === null ? null : { id: options.insertId ?? validProjectId, customer_id: options.insertedCustomerId ?? payload.customer_id },
                  error: null,
                };
              },
            };
          },
        };
      },
    };
  }
  return from;
}

describe("createProjectSchema", () => {
  it("validiert Projektanlagefelder, trimmt Texte und setzt leere Zusammenfassung auf null", () => {
    expect(createProjectSchema.parse({ customer_id: validCustomerId, title: "  Wartung  ", summary: "  Erste interne Zusammenfassung  " })).toEqual({
      customer_id: validCustomerId,
      title: "Wartung",
      summary: "Erste interne Zusammenfassung",
    });
    expect(createProjectSchema.parse({ customer_id: validCustomerId, title: "Montage" })).toEqual({ customer_id: validCustomerId, title: "Montage", summary: null });
    expect(createProjectSchema.parse({ customer_id: validCustomerId, title: "Montage", summary: "" }).summary).toBeNull();
  });

  it("weist leere Bezeichnungen und ungültige oder leere Kunden-UUIDs ab", () => {
    expect(createProjectSchema.safeParse({ customer_id: validCustomerId, title: "" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ customer_id: validCustomerId, title: "   " }).success).toBe(false);
    expect(createProjectSchema.safeParse({ customer_id: "ungueltig", title: "Montage" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ customer_id: "", title: "Montage" }).success).toBe(false);
  });

  it("übernimmt keine unbekannten oder clientseitig kontrollierten Systemfelder", () => {
    const parsed = createProjectSchema.parse({
      customer_id: validCustomerId,
      title: "Projekt",
      summary: " Info ",
      id: validProjectId,
      status: "accepted",
      project_class: "A",
      requires_human_review: false,
      created_by: "22222222-2222-4222-8222-222222222222",
      deleted_at: "2026-07-21T00:00:00.000Z",
      role: "admin",
    });
    expect(parsed).toEqual({ customer_id: validCustomerId, title: "Projekt", summary: "Info" });
  });
});

describe("Projektanlage-Berechtigungen und Defaults", () => {
  it("erlaubt Admins und verbietet Reviewern die Projektanlage", () => {
    expect(canCreateProject("admin")).toBe(true);
    expect(canCreateProject("reviewer")).toBe(false);
  });

  it("behält die AP-01-Standardwerte für neue Projekte bei", () => {
    expect(DEFAULT_REQUIRES_HUMAN_REVIEW).toBe(true);
    expect(PROJECT_STATUSES[0]).toBe("new");
  });
});

describe("createProjectWithDataSource", () => {
  it("weist nicht authentifizierte Aufrufe, fehlende Profile, ungültige Rollen und Reviewer ab", async () => {
    for (const options of [{ userId: null }, { role: null }, { role: "customer" }, { role: "reviewer" }] satisfies MockOptions[]) {
      const { dataSource, insertCalls } = createMockDataSource(options);
      const result = await createProjectWithDataSource(dataSource, { customer_id: validCustomerId, title: "Projekt" });
      expect(result.success).toBe(false);
      expect(insertCalls).toEqual([]);
    }
  });

  it("führt bei ungültigen Formulardaten oder ungültiger Kunden-UUID keinen Projekt-Insert aus", async () => {
    const { dataSource, insertCalls } = createMockDataSource();
    const result = await createProjectWithDataSource(dataSource, { customer_id: "ungueltig", title: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Die Kunden-ID ist ungültig.");
    expect(insertCalls).toEqual([]);
  });

  it("weist unbekannte oder soft gelöschte Kunden ab und filtert deleted_at IS NULL", async () => {
    const { dataSource, customerCalls, insertCalls } = createMockDataSource({ activeCustomer: false });
    const result = await createProjectWithDataSource(dataSource, { customer_id: validCustomerId, title: "Projekt" });
    expect(result).toEqual({ success: false, error: "Der ausgewählte Kunde wurde nicht gefunden oder ist nicht mehr verfügbar." });
    expect(customerCalls).toEqual([{ customerId: validCustomerId, deletedAtFilter: null }]);
    expect(insertCalls).toEqual([]);
  });

  it("erzeugt ein explizites Insert-Payload mit validierten Werten und serverseitigen Standards", async () => {
    const { dataSource, customerCalls, insertCalls } = createMockDataSource();
    const result = await createProjectWithDataSource(dataSource, {
      customer_id: validCustomerId,
      title: "  Projekt  ",
      summary: "  Zusammenfassung  ",
      status: "accepted",
      project_class: "A",
      requires_human_review: false,
      created_by: "22222222-2222-4222-8222-222222222222",
      deleted_at: "2026-07-21T00:00:00.000Z",
      unknown: "nicht erlaubt",
    });

    expect(result).toEqual({ success: true, data: { id: validProjectId, customer_id: validCustomerId } });
    expect(customerCalls).toEqual([{ customerId: validCustomerId, deletedAtFilter: null }]);
    expect(insertCalls).toEqual([{ payload: {
      customer_id: validCustomerId,
      title: "Projekt",
      summary: "Zusammenfassung",
      status: "new",
      project_class: null,
      requires_human_review: true,
      created_by: userId,
    } }]);
    expect(Object.keys(insertCalls[0].payload).sort()).toEqual(["created_by", "customer_id", "project_class", "requires_human_review", "status", "summary", "title"]);
  });

  it("setzt optionale leere Zusammenfassung als null und verwendet die validierte Kunden-ID", async () => {
    const { dataSource, insertCalls } = createMockDataSource();
    const result = await createProjectWithDataSource(dataSource, { customer_id: validCustomerId, title: "Projekt", summary: "" });
    expect(result.success).toBe(true);
    expect(insertCalls[0].payload.customer_id).toBe(validCustomerId);
    expect(insertCalls[0].payload.summary).toBeNull();
  });

  it("gibt bei Datenbankfehlern, fehlender Insert-ID oder inkonsistenter Projekt-ID neutrale Meldungen zurück", async () => {
    const insertError = await createProjectWithDataSource(createMockDataSource({ insertError: true }).dataSource, { customer_id: validCustomerId, title: "Projekt" });
    const missingId = await createProjectWithDataSource(createMockDataSource({ insertId: null }).dataSource, { customer_id: validCustomerId, title: "Projekt" });
    const wrongCustomer = await createProjectWithDataSource(createMockDataSource({ insertedCustomerId: "55555555-5555-4555-8555-555555555555" }).dataSource, { customer_id: validCustomerId, title: "Projekt" });
    expect(insertError).toEqual({ success: false, error: "Das Projekt konnte nicht angelegt werden. Bitte versuchen Sie es erneut." });
    expect(missingId).toEqual({ success: false, error: "Das Projekt konnte nicht angelegt werden. Bitte versuchen Sie es erneut." });
    expect(wrongCustomer).toEqual({ success: false, error: "Das Projekt konnte nicht angelegt werden. Bitte versuchen Sie es erneut." });
  });

  it("bildet FormData explizit auf erlaubte Anlagefelder ab", () => {
    const formData = new FormData();
    formData.set("customer_id", validCustomerId);
    formData.set("title", "Projekt");
    formData.set("summary", "Info");
    formData.set("created_by", userId);
    formData.set("status", "accepted");
    formData.set("deleted_at", "2026-07-21T00:00:00.000Z");
    expect(formDataToCreateProjectInput(formData)).toEqual({ customer_id: validCustomerId, title: "Projekt", summary: "Info" });
  });
});
