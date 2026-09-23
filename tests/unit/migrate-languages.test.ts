import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  migrateLanguagesToLanguage,
  LEGACY_LANGUAGES_COLLECTION,
  LANGUAGE_COLLECTION,
  OWNED_LANGUAGE_RELATIONS,
} from "../../src/db-configuration/migrate-languages.js";

/* -------------------------------------------------------------------------- */
/* Fakes                                                                       */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Minimal knex fake supporting the read-only query shapes used by the
 * migration: knex(table).select(...).where(col, value).first()
 */
function createKnex(tables: Tables) {
  const missing = new Set<string>();

  const knex = (table: string) => {
    if (!(table in tables)) missing.add(table);

    let rows = [...(tables[table] ?? [])];
    let projection: string[] | null = null;

    // Projection is applied only when the query is resolved, so that
    // `.select(...).where(...)` filters on the full row like knex does.
    const resolveRows = () =>
      projection === null
        ? rows
        : rows.map((row) =>
            Object.fromEntries(projection!.map((c) => [c, row[c]])),
          );

    const builder = {
      select(...columns: string[]) {
        projection =
          columns.length > 0 && columns[0] !== "*" ? [...columns] : null;
        return builder;
      },
      where(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      whereIn(column: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      async first() {
        return resolveRows()[0];
      },
      then(
        resolve: (value: Row[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(resolveRows()).then(resolve, reject);
      },
    };

    return builder;
  };

  return Object.assign(knex, { __missingTables: missing });
}

function createLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

interface ServiceSpies {
  collectionsDeleteOne: ReturnType<typeof vi.fn>;
  relationsDeleteOne: ReturnType<typeof vi.fn>;
  relationsCreateOne: ReturnType<typeof vi.fn>;
  itemsCreateOne: ReturnType<typeof vi.fn>;
  itemsCollections: string[];
}

function createServices(overrides: Partial<ServiceSpies> = {}) {
  const spies: ServiceSpies = {
    collectionsDeleteOne: vi.fn().mockResolvedValue(undefined),
    relationsDeleteOne: vi.fn().mockResolvedValue(undefined),
    relationsCreateOne: vi.fn().mockResolvedValue(undefined),
    itemsCreateOne: vi.fn().mockResolvedValue(undefined),
    itemsCollections: [],
    ...overrides,
  };

  const services = {
    CollectionsService: class {
      deleteOne = spies.collectionsDeleteOne;
    },
    RelationsService: class {
      deleteOne = spies.relationsDeleteOne;
      createOne = spies.relationsCreateOne;
    },
    ItemsService: class {
      constructor(collection: string) {
        spies.itemsCollections.push(collection);
      }
      createOne = spies.itemsCreateOne;
    },
  };

  return { services, spies };
}

/** The relation this extension owns and is allowed to repoint. */
const ownedRelationRow = {
  many_collection: "user_notification_translations",
  many_field: "languages_code",
  one_collection: LEGACY_LANGUAGES_COLLECTION,
  one_field: null,
  junction_field: "user_notification_id",
  sort_field: null,
  one_deselect_action: "nullify",
};

function run(tables: Tables, servicesOverrides: Partial<ServiceSpies> = {}) {
  const knex = createKnex(tables);
  const logger = createLogger();
  const { services, spies } = createServices(servicesOverrides);

  return {
    knex,
    logger,
    spies,
    result: migrateLanguagesToLanguage({
      knex,
      services,
      schema: {},
      logger,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("migrateLanguagesToLanguage (BREAKING CHANGE: languages -> language)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes the collection names and the relations it owns", () => {
    expect(LEGACY_LANGUAGES_COLLECTION).toBe("languages");
    expect(LANGUAGE_COLLECTION).toBe("language");
    expect(OWNED_LANGUAGE_RELATIONS).toContain(
      "user_notification_translations.languages_code",
    );
  });

  describe("Environment 1: only the legacy `languages` collection has data", () => {
    it("copies every row, repoints the relation and drops the legacy collection", async () => {
      const { result, spies } = run({
        directus_collections: [
          { collection: LEGACY_LANGUAGES_COLLECTION },
          { collection: LANGUAGE_COLLECTION },
        ],
        directus_relations: [ownedRelationRow],
        languages: [
          { code: "en-US", name: "English", direction: "ltr" },
          { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
        ],
        language: [],
      });

      const migration = await result;

      expect(migration.status).toBe("migrated");
      expect(migration.copied).toBe(2);
      expect(migration.relationsRepointed).toBe(1);
      expect(migration.legacyDropped).toBe(true);
      expect(migration.blockedBy).toEqual([]);

      expect(spies.itemsCollections).toContain(LANGUAGE_COLLECTION);
      expect(spies.itemsCreateOne).toHaveBeenCalledTimes(2);
      expect(spies.itemsCreateOne).toHaveBeenCalledWith({
        code: "en-US",
        name: "English",
        direction: "ltr",
      });

      expect(spies.relationsDeleteOne).toHaveBeenCalledWith(
        "user_notification_translations",
        "languages_code",
      );
      expect(spies.relationsCreateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "user_notification_translations",
          field: "languages_code",
          related_collection: LANGUAGE_COLLECTION,
        }),
      );

      expect(spies.collectionsDeleteOne).toHaveBeenCalledWith(
        LEGACY_LANGUAGES_COLLECTION,
      );
    });

    it("recreates the foreign key pointing at language.code and keeps the junction metadata", async () => {
      const { result, spies } = run({
        directus_collections: [
          { collection: LEGACY_LANGUAGES_COLLECTION },
          { collection: LANGUAGE_COLLECTION },
        ],
        directus_relations: [ownedRelationRow],
        languages: [{ code: "en-US", name: "English", direction: "ltr" }],
        language: [],
      });

      await result;

      const payload = spies.relationsCreateOne.mock.calls[0]![0];
      expect(payload.schema).toMatchObject({
        table: "user_notification_translations",
        column: "languages_code",
        foreign_key_table: LANGUAGE_COLLECTION,
        foreign_key_column: "code",
        on_delete: "CASCADE",
      });
      expect(payload.meta).toMatchObject({
        many_collection: "user_notification_translations",
        many_field: "languages_code",
        one_collection: LANGUAGE_COLLECTION,
        junction_field: "user_notification_id",
      });
    });

    it("copies rows before recreating the foreign key", async () => {
      const order: string[] = [];
      const { result } = run(
        {
          directus_collections: [
            { collection: LEGACY_LANGUAGES_COLLECTION },
            { collection: LANGUAGE_COLLECTION },
          ],
          directus_relations: [ownedRelationRow],
          languages: [{ code: "en-US", name: "English", direction: "ltr" }],
          language: [],
        },
        {
          itemsCreateOne: vi.fn(async () => {
            order.push("copy");
          }),
          relationsCreateOne: vi.fn(async () => {
            order.push("relation");
          }),
          collectionsDeleteOne: vi.fn(async () => {
            order.push("drop");
          }),
        },
      );

      await result;

      expect(order).toEqual(["copy", "relation", "drop"]);
    });
  });

  describe("Environment 2: only `language` exists (inframe already installed)", () => {
    it("is a no-op and never touches the schema", async () => {
      const { result, spies, logger } = run({
        directus_collections: [{ collection: LANGUAGE_COLLECTION }],
        directus_relations: [],
        language: [{ code: "pt-BR", name: "Português", direction: "ltr" }],
      });

      const migration = await result;

      expect(migration.status).toBe("skipped");
      expect(migration.copied).toBe(0);
      expect(migration.legacyDropped).toBe(false);
      expect(spies.itemsCreateOne).not.toHaveBeenCalled();
      expect(spies.relationsDeleteOne).not.toHaveBeenCalled();
      expect(spies.collectionsDeleteOne).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("Environment 3: both collections exist with overlapping rows", () => {
    it("inserts only the missing codes and never overwrites existing ones", async () => {
      const { result, spies } = run({
        directus_collections: [
          { collection: LEGACY_LANGUAGES_COLLECTION },
          { collection: LANGUAGE_COLLECTION },
        ],
        directus_relations: [ownedRelationRow],
        languages: [
          { code: "en-US", name: "English", direction: "ltr" },
          { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
          { code: "es-ES", name: "Español", direction: "ltr" },
        ],
        language: [
          // inframe's own rows — different `name`, must be preserved
          { code: "pt-BR", name: "Português", direction: "ltr" },
        ],
      });

      const migration = await result;

      expect(migration.status).toBe("migrated");
      expect(migration.copied).toBe(2);

      const copiedCodes = spies.itemsCreateOne.mock.calls.map(
        (call) => (call[0] as { code: string }).code,
      );
      expect(copiedCodes.sort()).toEqual(["en-US", "es-ES"]);
      expect(copiedCodes).not.toContain("pt-BR");

      expect(spies.collectionsDeleteOne).toHaveBeenCalledWith(
        LEGACY_LANGUAGES_COLLECTION,
      );
    });
  });

  describe("Environment 4: neither collection exists (fresh install)", () => {
    it("is a no-op", async () => {
      const { result, spies, logger } = run({
        directus_collections: [],
        directus_relations: [],
      });

      const migration = await result;

      expect(migration.status).toBe("skipped");
      expect(migration.copied).toBe(0);
      expect(migration.legacyDropped).toBe(false);
      expect(spies.collectionsDeleteOne).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("Environment 5: `languages` is still referenced by a third-party collection", () => {
    it("migrates the data but refuses to drop the legacy collection", async () => {
      const { result, spies, logger } = run({
        directus_collections: [
          { collection: LEGACY_LANGUAGES_COLLECTION },
          { collection: LANGUAGE_COLLECTION },
        ],
        directus_relations: [
          ownedRelationRow,
          {
            many_collection: "some_other_extension_translations",
            many_field: "languages_code",
            one_collection: LEGACY_LANGUAGES_COLLECTION,
            one_field: null,
            junction_field: null,
            sort_field: null,
            one_deselect_action: "nullify",
          },
        ],
        languages: [{ code: "en-US", name: "English", direction: "ltr" }],
        language: [],
      });

      const migration = await result;

      expect(migration.status).toBe("partial");
      expect(migration.copied).toBe(1);
      expect(migration.legacyDropped).toBe(false);
      expect(migration.blockedBy).toEqual([
        "some_other_extension_translations.languages_code",
      ]);
      expect(spies.collectionsDeleteOne).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("Environment 6: failures never block the extension boot", () => {
    it("logs and returns when dropping the legacy collection throws", async () => {
      const { result, logger } = run(
        {
          directus_collections: [
            { collection: LEGACY_LANGUAGES_COLLECTION },
            { collection: LANGUAGE_COLLECTION },
          ],
          directus_relations: [ownedRelationRow],
          languages: [{ code: "en-US", name: "English", direction: "ltr" }],
          language: [],
        },
        {
          collectionsDeleteOne: vi
            .fn()
            .mockRejectedValue(new Error("permission denied")),
        },
      );

      const migration = await result;

      expect(migration.legacyDropped).toBe(false);
      expect(migration.status).toBe("partial");
      expect(logger.error).toHaveBeenCalled();
    });

    it("keeps copying the remaining rows when a single insert fails", async () => {
      const itemsCreateOne = vi
        .fn()
        .mockRejectedValueOnce(new Error("constraint violation"))
        .mockResolvedValue(undefined);

      const { result, logger } = run(
        {
          directus_collections: [
            { collection: LEGACY_LANGUAGES_COLLECTION },
            { collection: LANGUAGE_COLLECTION },
          ],
          directus_relations: [ownedRelationRow],
          languages: [
            { code: "en-US", name: "English", direction: "ltr" },
            { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
          ],
          language: [],
        },
        { itemsCreateOne },
      );

      const migration = await result;

      expect(itemsCreateOne).toHaveBeenCalledTimes(2);
      expect(migration.copied).toBe(1);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("aborts without dropping anything when the target collection is missing", async () => {
      const { result, spies, logger } = run({
        directus_collections: [{ collection: LEGACY_LANGUAGES_COLLECTION }],
        directus_relations: [ownedRelationRow],
        languages: [{ code: "en-US", name: "English", direction: "ltr" }],
      });

      const migration = await result;

      expect(migration.status).toBe("skipped");
      expect(spies.collectionsDeleteOne).not.toHaveBeenCalled();
      expect(spies.itemsCreateOne).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("Environment 7: idempotency", () => {
    it("is a clean no-op on the second boot", async () => {
      const tables: Tables = {
        directus_collections: [
          { collection: LEGACY_LANGUAGES_COLLECTION },
          { collection: LANGUAGE_COLLECTION },
        ],
        directus_relations: [ownedRelationRow],
        languages: [{ code: "en-US", name: "English", direction: "ltr" }],
        language: [],
      };

      const first = await run(tables).result;
      expect(first.status).toBe("migrated");

      // After the drop, Directus no longer knows about `languages`
      const secondRun = run({
        directus_collections: [{ collection: LANGUAGE_COLLECTION }],
        directus_relations: [
          { ...ownedRelationRow, one_collection: LANGUAGE_COLLECTION },
        ],
        language: [{ code: "en-US", name: "English", direction: "ltr" }],
      });

      const second = await secondRun.result;

      expect(second.status).toBe("skipped");
      expect(second.copied).toBe(0);
      expect(second.legacyDropped).toBe(false);
      expect(secondRun.spies.collectionsDeleteOne).not.toHaveBeenCalled();
      expect(secondRun.logger.error).not.toHaveBeenCalled();
    });
  });
});
