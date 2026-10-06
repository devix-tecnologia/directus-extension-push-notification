import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  migrateM2oColumnsToUuid,
  relationFailuresMessage,
  uuidForeignKeyColumns,
  type RawKnex,
} from "../../src/db-configuration/migrate-m2o-uuid.js";
import type { Logger } from "../../src/db-configuration/migrate-languages.js";

const state = JSON.parse(
  readFileSync(new URL("../../directus-state.json", import.meta.url), "utf-8"),
);

const createLogger = (): Logger => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

/** knex.raw falso: responde information_schema a partir de um mapa e grava todo SQL. */
function createRawKnex(
  dataTypes: Record<string, string>,
  { failAlter = false } = {},
) {
  const sql: string[] = [];
  const knex: RawKnex = {
    raw: async (query, bindings = []) => {
      sql.push(query);
      if (/information_schema\.columns/.test(query)) {
        const [table, column] = bindings as string[];
        const dataType = dataTypes[`${table}.${column}`];
        return { rows: dataType ? [{ data_type: dataType }] : [] };
      }

      if (failAlter) throw new Error("invalid input syntax for type uuid");
      return { rows: [] };
    },
  };
  return { knex, sql };
}

describe("directus-state.json — chaves estrangeiras", () => {
  it("todo campo m2o que aponta para uma chave id é uuid, como a chave que referencia", () => {
    const m2o = state.fields.filter(
      (field: {
        schema?: {
          foreign_key_table?: string | null;
          foreign_key_column?: string | null;
        };
      }) =>
        field.schema?.foreign_key_table &&
        field.schema.foreign_key_column === "id",
    );
    expect(m2o.length).toBe(7);
    for (const field of m2o) {
      expect(
        { collection: field.collection, field: field.field, type: field.type },
        `${field.collection}.${field.field}`,
      ).toEqual({
        collection: field.collection,
        field: field.field,
        type: "uuid",
      });
      expect(field.schema.data_type, `${field.collection}.${field.field}`).toBe(
        "uuid",
      );
      expect(field.schema.max_length).toBeNull();
    }
  });

  it("languages_code aponta para language.code, que é texto, e continua string", () => {
    const languagesCode = state.fields.find(
      (field: { collection: string; field: string }) =>
        field.collection === "user_notification_translations" &&
        field.field === "languages_code",
    );
    expect(languagesCode.type).toBe("string");
    expect(uuidForeignKeyColumns(state)).not.toContainEqual({
      table: "user_notification_translations",
      column: "languages_code",
    });
  });

  it("uuidForeignKeyColumns lista as sete colunas m2o do estado", () => {
    expect(uuidForeignKeyColumns(state).sort(byTableColumn)).toEqual(
      [
        { table: "push_delivery", column: "notification" },
        { table: "push_delivery", column: "subscription" },
        { table: "push_subscription", column: "user" },
        { table: "user_notification", column: "icon" },
        { table: "user_notification", column: "user" },
        { table: "user_notification", column: "user_created" },
        {
          table: "user_notification_translations",
          column: "user_notification_id",
        },
      ].sort(byTableColumn),
    );
  });
});

const byTableColumn = (
  a: { table: string; column: string },
  b: { table: string; column: string },
) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`);

describe("migrateM2oColumnsToUuid", () => {
  const columns = [
    { table: "user_notification", column: "user" },
    { table: "user_notification", column: "icon" },
    { table: "push_delivery", column: "notification" },
  ];

  it("converte char e varchar para uuid, pula o que já é uuid e o que não existe", async () => {
    const { knex, sql } = createRawKnex({
      "user_notification.user": "character",
      "user_notification.icon": "uuid",
    });
    const result = await migrateM2oColumnsToUuid({
      knex,
      columns,
      logger: createLogger(),
    });
    expect(result).toEqual({
      converted: ["user_notification.user"],
      skipped: ["user_notification.icon", "push_delivery.notification"],
      failed: [],
    });
    const alters = sql.filter((query) => /ALTER TABLE/.test(query));
    expect(alters).toHaveLength(1);
    expect(alters[0]).toContain(
      'ALTER TABLE "user_notification" ALTER COLUMN "user" DROP DEFAULT, ALTER COLUMN "user" TYPE uuid USING',
    );
  });

  it("character varying também é convertido", async () => {
    const { knex, sql } = createRawKnex({
      "push_delivery.notification": "character varying",
    });
    const result = await migrateM2oColumnsToUuid({
      knex,
      columns,
      logger: createLogger(),
    });
    expect(result.converted).toEqual(["push_delivery.notification"]);
    expect(sql.some((query) => /ALTER TABLE "push_delivery"/.test(query))).toBe(
      true,
    );
  });

  it("é idempotente: na segunda passagem nada é alterado", async () => {
    const { knex, sql } = createRawKnex({
      "user_notification.user": "uuid",
      "user_notification.icon": "uuid",
      "push_delivery.notification": "uuid",
    });
    const result = await migrateM2oColumnsToUuid({
      knex,
      columns,
      logger: createLogger(),
    });
    expect(result.converted).toEqual([]);
    expect(sql.some((query) => /ALTER TABLE/.test(query))).toBe(false);
  });

  it("ALTER que falha é registrado como erro e não derruba as demais colunas", async () => {
    const { knex } = createRawKnex(
      {
        "user_notification.user": "character",
        "push_delivery.notification": "character",
      },
      { failAlter: true },
    );
    const logger = createLogger();
    const result = await migrateM2oColumnsToUuid({ knex, columns, logger });
    expect(result.failed).toEqual([
      "user_notification.user",
      "push_delivery.notification",
    ]);
    expect(result.converted).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("relationFailuresMessage", () => {
  it("nomeia cada relação que não pôde ser criada e diz o que isso quebra", () => {
    const message = relationFailuresMessage([
      "user_notification.user -> directus_users: foreign key cannot be implemented",
    ]);
    expect(message).toContain("user_notification.user -> directus_users");
    expect(message).toContain("foreign key cannot be implemented");
    expect(message).toMatch(/GET \/items\/user_notification/);
  });
});
