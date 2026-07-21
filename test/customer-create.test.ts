import { describe, expect, it } from "vitest";
import { createCustomerWithDataSource, type CreateCustomerDataSource, type CustomerInsert, type CustomersInsertQuery, type ProfilesQuery } from "@/lib/actions/customer-create-service";
import { optionalFieldDisplay } from "@/lib/domain/display";
import { canCreateCustomer } from "@/lib/domain/permissions";
import { createCustomerSchema } from "@/lib/domain/schemas";

type MockOptions = {
  userId?: string | null;
  role?: string | null;
  insertError?: boolean;
};

function createMockDataSource(options: MockOptions = {}) {
  const insertedPayloads: CustomerInsert[] = [];
  const userId = options.userId === undefined ? "11111111-1111-4111-8111-111111111111" : options.userId;
  const role = options.role === undefined ? "admin" : options.role;
  const dataSource: CreateCustomerDataSource = {
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null }, error: null };
      },
    },
    from: createMockFrom(role, insertedPayloads, options),
  };
  return { dataSource, insertedPayloads };
}

function createMockFrom(role: string | null, insertedPayloads: CustomerInsert[], options: MockOptions): CreateCustomerDataSource["from"] {
  function from(table: "profiles"): ProfilesQuery;
  function from(table: "customers"): CustomersInsertQuery;
  function from(table: "profiles" | "customers"): ProfilesQuery | CustomersInsertQuery {
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
      insert(payload) {
        insertedPayloads.push(payload);
        return {
          select() {
            return {
              async single() {
                if (options.insertError) return { data: null, error: { message: "duplicate private db message" } };
                return { data: { id: "33333333-3333-4333-8333-333333333333" }, error: null };
              },
            };
          },
        };
      },
    };
  }
  return from;
}

describe("createCustomerSchema", () => {
  it("akzeptiert einen gültigen Kunden mit allen Feldern", () => {
    expect(createCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", phone: "+49 (30) 123-456" })).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "+49 (30) 123-456",
    });
  });

  it("akzeptiert einen gültigen Kunden ohne E-Mail und Telefon", () => {
    expect(createCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace" })).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: null,
      phone: null,
    });
  });

  it("trimmt Vorname und Nachname", () => {
    const parsed = createCustomerSchema.parse({ first_name: "  Ada ", last_name: " Lovelace  " });
    expect(parsed.first_name).toBe("Ada");
    expect(parsed.last_name).toBe("Lovelace");
  });

  it("weist leere oder nur aus Leerzeichen bestehende Namen ab", () => {
    expect(createCustomerSchema.safeParse({ first_name: "", last_name: "Lovelace" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ first_name: "   ", last_name: "Lovelace" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ first_name: "Ada", last_name: "" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ first_name: "Ada", last_name: "   " }).success).toBe(false);
  });

  it("validiert E-Mail und wandelt leere E-Mail in null", () => {
    expect(createCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", email: " ada@example.com " }).email).toBe("ada@example.com");
    expect(createCustomerSchema.safeParse({ first_name: "Ada", last_name: "Lovelace", email: "ungueltig" }).success).toBe(false);
    expect(createCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", email: "" }).email).toBeNull();
  });

  it("trimmt Telefonnummer außen und erhält interne Formatzeichen", () => {
    const parsed = createCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", phone: "  +49 (30) 123-456  " });
    expect(parsed.phone).toBe("+49 (30) 123-456");
    expect(createCustomerSchema.parse({ first_name: "Ada", last_name: "Lovelace", phone: "" }).phone).toBeNull();
  });

  it("übernimmt fremde Felder nicht als schreibbare Kundendaten", () => {
    const parsed = createCustomerSchema.parse({
      first_name: "Ada",
      last_name: "Lovelace",
      role: "admin",
      deleted_at: "2026-07-21",
      created_by: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("deleted_at");
    expect(parsed).not.toHaveProperty("created_by");
  });
});

describe("Kundenanlage-Berechtigungen", () => {
  it("erlaubt Admins und verbietet Reviewern die Kundenanlage", () => {
    expect(canCreateCustomer("admin")).toBe(true);
    expect(canCreateCustomer("reviewer")).toBe(false);
  });
});

describe("createCustomerWithDataSource", () => {
  it("weist nicht authentifizierte Aufrufe ab", async () => {
    const { dataSource, insertedPayloads } = createMockDataSource({ userId: null });
    const result = await createCustomerWithDataSource(dataSource, { first_name: "Ada", last_name: "Lovelace" });
    expect(result.success).toBe(false);
    expect(insertedPayloads).toEqual([]);
  });

  it("weist fehlende Profile ab", async () => {
    const { dataSource, insertedPayloads } = createMockDataSource({ role: null });
    const result = await createCustomerWithDataSource(dataSource, { first_name: "Ada", last_name: "Lovelace" });
    expect(result.success).toBe(false);
    expect(insertedPayloads).toEqual([]);
  });

  it("weist Reviewer-Aufrufe ab", async () => {
    const { dataSource, insertedPayloads } = createMockDataSource({ role: "reviewer" });
    const result = await createCustomerWithDataSource(dataSource, { first_name: "Ada", last_name: "Lovelace" });
    expect(result.success).toBe(false);
    expect(insertedPayloads).toEqual([]);
  });

  it("gibt Feldfehler bei ungültigen Formulardaten zurück", async () => {
    const { dataSource } = createMockDataSource();
    const result = await createCustomerWithDataSource(dataSource, { first_name: "", last_name: "", email: "ungueltig" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.first_name).toBeDefined();
      expect(result.fieldErrors?.last_name).toBeDefined();
      expect(result.fieldErrors?.email).toBeDefined();
    }
  });

  it("setzt created_by serverseitig und fügt nur erlaubte Felder ein", async () => {
    const { dataSource, insertedPayloads } = createMockDataSource();
    const result = await createCustomerWithDataSource(dataSource, {
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "+49 (30) 123-456",
      created_by: "99999999-9999-4999-8999-999999999999",
      deleted_at: "2026-07-21",
    });
    expect(result).toEqual({ success: true, data: { id: "33333333-3333-4333-8333-333333333333" } });
    expect(insertedPayloads).toEqual([
      {
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        phone: "+49 (30) 123-456",
        created_by: "11111111-1111-4111-8111-111111111111",
      },
    ]);
  });

  it("übersetzt Datenbankfehler in eine neutrale deutsche Fehlermeldung", async () => {
    const { dataSource } = createMockDataSource({ insertError: true });
    const result = await createCustomerWithDataSource(dataSource, { first_name: "Ada", last_name: "Lovelace" });
    expect(result).toEqual({ success: false, error: "Der Kunde konnte nicht angelegt werden. Bitte versuchen Sie es erneut." });
  });
});

describe("Darstellungslogik", () => {
  it("zeigt sichere Platzhalter für optionale Felder", () => {
    expect(optionalFieldDisplay(null)).toBe("Nicht angegeben");
    expect(optionalFieldDisplay(undefined)).toBe("Nicht angegeben");
    expect(optionalFieldDisplay("  ")).toBe("Nicht angegeben");
    expect(optionalFieldDisplay(" ada@example.com ")).toBe("ada@example.com");
  });
});
