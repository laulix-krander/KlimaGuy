import { describe, expect, it } from "vitest";
import {
  deleteCustomerSchema,
  softDeleteCustomerWithDataSource,
  type CustomerSoftDeletePayload,
  type CustomersDeleteQuery,
  type DeleteCustomerDataSource,
  type DeleteProfilesQuery,
  type ProjectsForCustomerQuery,
} from "@/lib/actions/customer-delete-service";
import { canSoftDeleteCustomer } from "@/lib/domain/permissions";

type MockOptions = {
  userId?: string | null;
  role?: string | null;
  activeCustomer?: boolean;
  activeProjectCount?: number;
  projectError?: boolean;
  updateError?: boolean;
  updateReturnsRow?: boolean;
};

type SelectCall = { customerId?: string; deletedAtFilter?: null };
type ProjectCall = { customerId?: string; deletedAtFilter?: null; limit?: number };
type UpdateCall = { payload: CustomerSoftDeletePayload; customerId?: string; deletedAtFilter?: null };

const validCustomerId = "33333333-3333-4333-8333-333333333333";
const fixedNow = "2026-07-21T12:00:00.000Z";

function createMockDataSource(options: MockOptions = {}) {
  const customerSelectCalls: SelectCall[] = [];
  const projectCalls: ProjectCall[] = [];
  const updateCalls: UpdateCall[] = [];
  const userId = options.userId === undefined ? "11111111-1111-4111-8111-111111111111" : options.userId;
  const role = options.role === undefined ? "admin" : options.role;
  const dataSource: DeleteCustomerDataSource = {
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null }, error: null };
      },
    },
    from: createMockFrom(role, customerSelectCalls, projectCalls, updateCalls, options),
  };
  return { dataSource, customerSelectCalls, projectCalls, updateCalls };
}

function createMockFrom(
  role: string | null,
  customerSelectCalls: SelectCall[],
  projectCalls: ProjectCall[],
  updateCalls: UpdateCall[],
  options: MockOptions,
): DeleteCustomerDataSource["from"] {
  function from(table: "profiles"): DeleteProfilesQuery;
  function from(table: "customers"): CustomersDeleteQuery;
  function from(table: "projects"): ProjectsForCustomerQuery;
  function from(table: "profiles" | "customers" | "projects"): DeleteProfilesQuery | CustomersDeleteQuery | ProjectsForCustomerQuery {
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

    if (table === "projects") {
      return {
        select() {
          return {
            eq(_column: "customer_id", customerId: string) {
              const call: ProjectCall = { customerId };
              projectCalls.push(call);
              return {
                is(_column: "deleted_at", value: null) {
                  call.deletedAtFilter = value;
                  return {
                    async limit(count: 1) {
                      call.limit = count;
                      if (options.projectError) return { data: null, error: { message: "private project db error" } };
                      const activeProjectCount = options.activeProjectCount ?? 0;
                      return { data: Array.from({ length: activeProjectCount }, (_, index) => ({ id: `project-${index}` })), error: null };
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
          eq(_column: "id", customerId: string) {
            const call: SelectCall = { customerId };
            customerSelectCalls.push(call);
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
      update(payload) {
        const call: UpdateCall = { payload };
        updateCalls.push(call);
        return {
          eq(_column: "id", customerId: string) {
            call.customerId = customerId;
            return {
              is(_column: "deleted_at", value: null) {
                call.deletedAtFilter = value;
                return {
                  select() {
                    return {
                      async single() {
                        if (options.updateError) return { data: null, error: { message: "private update db error" } };
                        const updateReturnsRow = options.updateReturnsRow ?? true;
                        return { data: updateReturnsRow ? { id: customerId } : null, error: null };
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
  return from;
}

describe("deleteCustomerSchema", () => {
  it("akzeptiert gültige UUIDs und weist ungültige oder leere Werte ab", () => {
    expect(deleteCustomerSchema.parse({ customer_id: validCustomerId })).toEqual({ customer_id: validCustomerId });
    expect(deleteCustomerSchema.safeParse({ customer_id: "ungueltig" }).success).toBe(false);
    expect(deleteCustomerSchema.safeParse({ customer_id: "" }).success).toBe(false);
  });

  it("übernimmt keine unbekannten oder clientseitigen Patch-Felder", () => {
    const parsed = deleteCustomerSchema.parse({
      customer_id: validCustomerId,
      deleted_at: "1999-01-01T00:00:00.000Z",
      created_by: "22222222-2222-4222-8222-222222222222",
      role: "admin",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "+49 30 123",
    });
    expect(parsed).toEqual({ customer_id: validCustomerId });
  });
});

describe("Kunden-Soft-Delete-Berechtigungen", () => {
  it("erlaubt Admins und verbietet Reviewern den Kunden-Soft-Delete", () => {
    expect(canSoftDeleteCustomer("admin")).toBe(true);
    expect(canSoftDeleteCustomer("reviewer")).toBe(false);
  });
});

describe("softDeleteCustomerWithDataSource", () => {
  it("weist nicht authentifizierte Aufrufe, fehlende Profile, ungültige Rollen und Reviewer ab", async () => {
    for (const options of [{ userId: null }, { role: null }, { role: "customer" }, { role: "reviewer" }] satisfies MockOptions[]) {
      const { dataSource, updateCalls } = createMockDataSource(options);
      const result = await softDeleteCustomerWithDataSource(dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
      expect(result.success).toBe(false);
      expect(updateCalls).toEqual([]);
    }
  });

  it("führt bei ungültiger Kunden-UUID kein Datenbank-Update aus", async () => {
    const { dataSource, updateCalls } = createMockDataSource();
    const result = await softDeleteCustomerWithDataSource(dataSource, { customer_id: "ungueltig" }, { now: () => fixedNow });
    expect(result).toEqual({ success: false, error: "Die Kunden-ID ist ungültig." });
    expect(updateCalls).toEqual([]);
  });

  it("weist nicht vorhandene oder bereits soft gelöschte Kunden ab und prüft deleted_at IS NULL", async () => {
    const { dataSource, customerSelectCalls, updateCalls } = createMockDataSource({ activeCustomer: false });
    const result = await softDeleteCustomerWithDataSource(dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
    expect(result).toEqual({ success: false, error: "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar." });
    expect(customerSelectCalls).toEqual([{ customerId: validCustomerId, deletedAtFilter: null }]);
    expect(updateCalls).toEqual([]);
  });

  it("erlaubt Soft Delete ohne verknüpfte Projekte und erzeugt ausschließlich deleted_at serverseitig", async () => {
    const { dataSource, projectCalls, updateCalls } = createMockDataSource({ activeProjectCount: 0 });
    const result = await softDeleteCustomerWithDataSource(dataSource, {
      customer_id: validCustomerId,
      deleted_at: "1999-01-01T00:00:00.000Z",
      created_by: "22222222-2222-4222-8222-222222222222",
      first_name: "Manipuliert",
      unknown: "nicht erlaubt",
    }, { now: () => fixedNow });
    expect(result).toEqual({ success: true, data: { id: validCustomerId } });
    expect(projectCalls).toEqual([{ customerId: validCustomerId, deletedAtFilter: null, limit: 1 }]);
    expect(updateCalls).toEqual([{ payload: { deleted_at: fixedNow }, customerId: validCustomerId, deletedAtFilter: null }]);
  });

  it("blockiert ein oder mehrere aktive Projekte unabhängig vom Status und führt kein Customer-Update aus", async () => {
    for (const activeProjectCount of [1, 2]) {
      const { dataSource, updateCalls } = createMockDataSource({ activeProjectCount });
      const result = await softDeleteCustomerWithDataSource(dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
      expect(result).toEqual({ success: false, error: "Der Kunde kann nicht gelöscht werden, solange ihm Projekte zugeordnet sind." });
      expect(updateCalls).toEqual([]);
    }
  });

  it("behandelt soft gelöschte Projekte als nicht blockierend", async () => {
    const { dataSource, updateCalls } = createMockDataSource({ activeProjectCount: 0 });
    const result = await softDeleteCustomerWithDataSource(dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
    expect(result.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
  });

  it("gibt bei Projektabfrage-, Update- und Kein-Datensatz-Fehlern neutrale Meldungen zurück", async () => {
    const projectError = await softDeleteCustomerWithDataSource(createMockDataSource({ projectError: true }).dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
    const updateError = await softDeleteCustomerWithDataSource(createMockDataSource({ updateError: true }).dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
    const noUpdatedRow = await softDeleteCustomerWithDataSource(createMockDataSource({ updateReturnsRow: false }).dataSource, { customer_id: validCustomerId }, { now: () => fixedNow });
    expect(projectError).toEqual({ success: false, error: "Der Kunde konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." });
    expect(updateError).toEqual({ success: false, error: "Der Kunde konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." });
    expect(noUpdatedRow).toEqual({ success: false, error: "Der Kunde konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." });
  });
});
