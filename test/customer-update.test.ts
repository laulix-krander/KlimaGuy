import { describe, expect, it } from "vitest";
import {
  updateCustomerWithDataSource,
  type CustomerUpdate,
  type CustomersUpdateQuery,
  type UpdateCustomerDataSource,
  type UpdateProfilesQuery,
} from "@/lib/actions/customer-update-service";
import { optionalFormValue } from "@/lib/domain/display";
import { canEditCustomer } from "@/lib/domain/permissions";
import { updateCustomerSchema } from "@/lib/domain/schemas";

type MockOptions = {
  userId?: string | null;
  role?: string | null;
  updateError?: boolean;
  noRows?: boolean;
};

type UpdateCall = {
  payload: CustomerUpdate;
  customerId?: string;
  deletedAtFilter?: null;
};

function createMockDataSource(options: MockOptions = {}) {
  const updateCalls: UpdateCall[] = [];
  const userId = options.userId === undefined ? "11111111-1111-4111-8111-111111111111" : options.userId;
  const role = options.role === undefined ? "admin" : options.role;
  const dataSource: UpdateCustomerDataSource = {
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null }, error: null };
      },
    },
    from: createMockFrom(role, updateCalls, options),
  };
  return { dataSource, updateCalls };
}

function createMockFrom(role: string | null, updateCalls: UpdateCall[], options: MockOptions): UpdateCustomerDataSource["from"] {
  function from(table: "profiles"): UpdateProfilesQuery;
  function from(table: "customers"): CustomersUpdateQuery;
  function from(table: "profiles" | "customers"): UpdateProfilesQuery | CustomersUpdateQuery {
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

    return {
      update(payload) {
        const call: UpdateCall = { payload };
        updateCalls.push(call);
        return {
          eq(_column, customerId) {
            call.customerId = customerId;
            return {
              is(_column, value) {
                call.deletedAtFilter = value;
                return {
                  select() {
                    return {
                      async single() {
                        if (options.updateError) return { data: null, error: { message: "private db error" } };
                        if (options.noRows) return { data: null, error: null };
                        return { data: { id: customerId }, error: null };
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

describe("updateCustomerSchema", () => {
  it("akzeptiert einen gültigen Update-Datensatz mit allen Feldern", () => {
    expect(updateCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", phone: "+49 (30) 123-456" })).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "+49 (30) 123-456",
    });
  });

  it("akzeptiert einen gültigen Update-Datensatz ohne E-Mail und Telefon", () => {
    expect(updateCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace" })).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: null,
      phone: null,
    });
  });

  it("trimmt Vorname und Nachname", () => {
    const parsed = updateCustomerSchema.parse({ first_name: "  Ada ", last_name: " Lovelace  " });
    expect(parsed.first_name).toBe("Ada");
    expect(parsed.last_name).toBe("Lovelace");
  });

  it("weist leere oder nur aus Leerzeichen bestehende Namen ab", () => {
    expect(updateCustomerSchema.safeParse({ first_name: "", last_name: "Lovelace" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ first_name: "   ", last_name: "Lovelace" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ first_name: "Ada", last_name: "" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ first_name: "Ada", last_name: "   " }).success).toBe(false);
  });

  it("validiert E-Mail und wandelt leere E-Mail in null", () => {
    expect(updateCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", email: " ada@example.com " }).email).toBe("ada@example.com");
    expect(updateCustomerSchema.safeParse({ first_name: "Ada", last_name: "Lovelace", email: "ungueltig" }).success).toBe(false);
    expect(updateCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", email: "" }).email).toBeNull();
  });

  it("trimmt Telefonnummer außen und erhält interne Formatierung", () => {
    const parsed = updateCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", phone: "  +49 (30) 123-456  " });
    expect(parsed.phone).toBe("+49 (30) 123-456");
    expect(updateCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", phone: "" }).phone).toBeNull();
  });

  it("übernimmt fremde Felder nicht in das Patch-Payload", () => {
    const parsed = updateCustomerSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      first_name: "Ada",
      last_name: "Lovelace",
      role: "admin",
      created_by: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-07-21",
      updated_at: "2026-07-21",
      deleted_at: "2026-07-21",
      metadata: { unsafe: true },
    });
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("created_by");
    expect(parsed).not.toHaveProperty("created_at");
    expect(parsed).not.toHaveProperty("updated_at");
    expect(parsed).not.toHaveProperty("deleted_at");
    expect(parsed).not.toHaveProperty("metadata");
  });
});

describe("Kundenbearbeitung-Berechtigungen", () => {
  it("erlaubt Admins und verbietet Reviewern die Kundenbearbeitung", () => {
    expect(canEditCustomer("admin")).toBe(true);
    expect(canEditCustomer("reviewer")).toBe(false);
  });
});

describe("updateCustomerWithDataSource", () => {
  const validCustomerId = "33333333-3333-4333-8333-333333333333";

  it("weist nicht authentifizierte Aufrufe ab", async () => {
    const { dataSource, updateCalls } = createMockDataSource({ userId: null });
    const result = await updateCustomerWithDataSource(dataSource, validCustomerId, { first_name: "Ada", last_name: "Lovelace" });
    expect(result.success).toBe(false);
    expect(updateCalls).toEqual([]);
  });

  it("weist fehlende Profile, ungültige Rollen und Reviewer ab", async () => {
    for (const role of [null, "customer", "reviewer"] as const) {
      const { dataSource, updateCalls } = createMockDataSource({ role });
      const result = await updateCustomerWithDataSource(dataSource, validCustomerId, { first_name: "Ada", last_name: "Lovelace" });
      expect(result.success).toBe(false);
      expect(updateCalls).toEqual([]);
    }
  });

  it("weist ungültige Kunden-UUIDs ab", async () => {
    const { dataSource, updateCalls } = createMockDataSource();
    const result = await updateCustomerWithDataSource(dataSource, "ungueltig", { first_name: "Ada", last_name: "Lovelace" });
    expect(result.success).toBe(false);
    expect(updateCalls).toEqual([]);
  });

  it("gibt Feldfehler bei ungültigen Formulardaten zurück", async () => {
    const { dataSource } = createMockDataSource();
    const result = await updateCustomerWithDataSource(dataSource, validCustomerId, { first_name: "", last_name: "", email: "ungueltig" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.first_name).toBeDefined();
      expect(result.fieldErrors?.last_name).toBeDefined();
      expect(result.fieldErrors?.email).toBeDefined();
    }
  });

  it("nutzt nur erlaubte Update-Felder und filtert ID sowie deleted_at IS NULL", async () => {
    const { dataSource, updateCalls } = createMockDataSource();
    const result = await updateCustomerWithDataSource(dataSource, validCustomerId, {
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "+49 (30) 123-456",
      created_by: "99999999-9999-4999-8999-999999999999",
      deleted_at: "2026-07-21",
      unknown: "nicht erlaubt",
    });
    expect(result).toEqual({ success: true, data: { id: validCustomerId } });
    expect(updateCalls).toEqual([
      {
        payload: {
          first_name: "Ada",
          last_name: "Lovelace",
          email: "ada@example.com",
          phone: "+49 (30) 123-456",
        },
        customerId: validCustomerId,
        deletedAtFilter: null,
      },
    ]);
  });

  it("übersetzt nicht betroffene Datensätze und Datenbankfehler neutral", async () => {
    const noRows = await updateCustomerWithDataSource(createMockDataSource({ noRows: true }).dataSource, validCustomerId, { first_name: "Ada", last_name: "Lovelace" });
    const dbError = await updateCustomerWithDataSource(createMockDataSource({ updateError: true }).dataSource, validCustomerId, { first_name: "Ada", last_name: "Lovelace" });
    expect(noRows).toEqual({ success: false, error: "Der Kunde konnte nicht aktualisiert werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut." });
    expect(dbError).toEqual({ success: false, error: "Der Kunde konnte nicht aktualisiert werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut." });
  });
});

describe("Bearbeitungsformular-Darstellung", () => {
  it("stellt null als leeren Formularwert dar", () => {
    expect(optionalFormValue(null)).toBe("");
    expect(optionalFormValue(undefined)).toBe("");
    expect(optionalFormValue("ada@example.com")).toBe("ada@example.com");
  });
});
