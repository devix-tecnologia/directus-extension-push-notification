import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  migrateLegacyLanguageCollection,
  LEGACY_LANGUAGE_COLLECTION,
  LANGUAGE_COLLECTION,
  OWNED_LANGUAGE_RELATIONS,
  type DirectusKnex,
  type DirectusServices,
  type Logger,
  type QueryBuilder,
} from "../../src/db-configuration/migrate-languages.js";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const project = (row: Row, columns: string[]): Row =>
  Object.fromEntries(columns.map((column) => [column, row[column]]));

function createKnex(tables: Tables): DirectusKnex {
  return <TRow>(table: string): QueryBuilder<TRow> => {
    let rows = [...(tables[table] ?? [])];
    let columns: string[] | null = null;

    // A projeção só é aplicada ao resolver, para que `.select().where()` filtre
    // sobre a linha inteira, como o knex faz.
    const resolve = () =>
      (columns === null
        ? rows
        : rows.map((row) => project(row, columns!))) as TRow[];

    const builder: QueryBuilder<TRow> = {
      select(...selected) {
        columns = selected.length > 0 && selected[0] !== "*" ? selected : null;

        return builder;
      },
      where(column, value) {
        rows = rows.filter((row) => row[column] === value);

        return builder;
      },
      first: async () => resolve()[0],
      then: (onfulfilled, onrejected) =>
        Promise.resolve(resolve()).then(onfulfilled, onrejected),
    };

    return builder;
  };
}

const createLogger = (): Logger => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

type CollectionsService = InstanceType<DirectusServices["CollectionsService"]>;
type RelationsService = InstanceType<DirectusServices["RelationsService"]>;
type ItemsService = InstanceType<DirectusServices["ItemsService"]>;

interface ServiceCalls {
  dropCollection: Mock<CollectionsService["deleteOne"]>;
  deleteRelation: Mock<RelationsService["deleteOne"]>;
  createRelation: Mock<RelationsService["createOne"]>;
  createLanguage: Mock<ItemsService["createOne"]>;
  itemsServiceCollections: string[];
}

function createServices(overrides: Partial<ServiceCalls> = {}) {
  const calls: ServiceCalls = {
    dropCollection: vi
      .fn<CollectionsService["deleteOne"]>()
      .mockResolvedValue(undefined),
    deleteRelation: vi
      .fn<RelationsService["deleteOne"]>()
      .mockResolvedValue(undefined),
    createRelation: vi
      .fn<RelationsService["createOne"]>()
      .mockResolvedValue(undefined),
    createLanguage: vi
      .fn<ItemsService["createOne"]>()
      .mockResolvedValue(undefined),
    itemsServiceCollections: [],
    ...overrides,
  };

  const services: DirectusServices = {
    CollectionsService: class {
      deleteOne = calls.dropCollection;
    },
    RelationsService: class {
      deleteOne = calls.deleteRelation;
      createOne = calls.createRelation;
    },
    ItemsService: class {
      constructor(collection: string) {
        calls.itemsServiceCollections.push(collection);
      }
      createOne = calls.createLanguage;
    },
  };

  return { services, calls };
}

const TRANSLATIONS_RELATION = {
  many_collection: "user_notification_translations",
  many_field: "languages_code",
  one_collection: LEGACY_LANGUAGE_COLLECTION,
  one_field: null,
  junction_field: "user_notification_id",
  sort_field: null,
  one_deselect_action: "nullify",
};

const THIRD_PARTY_RELATION = {
  many_collection: "some_other_extension_translations",
  many_field: "languages_code",
  one_collection: LEGACY_LANGUAGE_COLLECTION,
  one_field: null,
  junction_field: null,
  sort_field: null,
  one_deselect_action: "nullify",
};

const bothCollectionsExist = [
  { collection: LEGACY_LANGUAGE_COLLECTION },
  { collection: LANGUAGE_COLLECTION },
];

function migrate(tables: Tables, overrides: Partial<ServiceCalls> = {}) {
  const logger = createLogger();
  const { services, calls } = createServices(overrides);

  return {
    logger,
    calls,
    result: migrateLegacyLanguageCollection({
      knex: createKnex(tables),
      services,
      schema: {},
      logger,
    }),
  };
}

const englishOnly = [{ code: "en-US", name: "English", direction: "ltr" }];

describe("migrateLegacyLanguageCollection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expõe os nomes das coleções e as relações que pode repontar", () => {
    expect(LEGACY_LANGUAGE_COLLECTION).toBe("languages");
    expect(LANGUAGE_COLLECTION).toBe("language");
    expect(OWNED_LANGUAGE_RELATIONS).toContain(
      "user_notification_translations.languages_code",
    );
  });

  describe("quando só a coleção legada tem dados", () => {
    const tables = (): Tables => ({
      directus_collections: bothCollectionsExist,
      directus_relations: [TRANSLATIONS_RELATION],
      languages: [
        { code: "en-US", name: "English", direction: "ltr" },
        { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
      ],
      language: [],
    });

    it("copia as linhas, repointa a relação e derruba a coleção legada", async () => {
      const { result, calls } = migrate(tables());

      await expect(result).resolves.toEqual({
        status: "migrated",
        copied: 2,
        relationsRepointed: 1,
        legacyDropped: true,
        blockedBy: [],
      });

      expect(calls.itemsServiceCollections).toContain(LANGUAGE_COLLECTION);
      expect(calls.createLanguage).toHaveBeenCalledWith({
        code: "en-US",
        name: "English",
        direction: "ltr",
      });
      expect(calls.deleteRelation).toHaveBeenCalledWith(
        "user_notification_translations",
        "languages_code",
      );
      expect(calls.dropCollection).toHaveBeenCalledWith(
        LEGACY_LANGUAGE_COLLECTION,
      );
    });

    it("recria a foreign key contra language.code preservando a junção", async () => {
      const { result, calls } = migrate(tables());
      await result;

      expect(calls.createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "user_notification_translations",
          field: "languages_code",
          related_collection: LANGUAGE_COLLECTION,
          schema: expect.objectContaining({
            foreign_key_table: LANGUAGE_COLLECTION,
            foreign_key_column: "code",
            on_delete: "CASCADE",
          }),
          meta: expect.objectContaining({
            one_collection: LANGUAGE_COLLECTION,
            junction_field: "user_notification_id",
          }),
        }),
      );
    });

    it("copia antes de recriar a foreign key e derruba por último", async () => {
      const order: string[] = [];
      const record = <TFn extends (...args: never[]) => Promise<unknown>>(
        step: string,
      ) => vi.fn<TFn>((async () => void order.push(step)) as TFn);

      const { result } = migrate(tables(), {
        createLanguage: record<ItemsService["createOne"]>("copy"),
        createRelation: record<RelationsService["createOne"]>("relation"),
        dropCollection: record<CollectionsService["deleteOne"]>("drop"),
      });
      await result;

      expect(order).toEqual(["copy", "copy", "relation", "drop"]);
    });
  });

  describe("quando só a coleção nova existe (inframe já instalado)", () => {
    it("não faz nada e não registra erro", async () => {
      const { result, calls, logger } = migrate({
        directus_collections: [{ collection: LANGUAGE_COLLECTION }],
        directus_relations: [],
        language: [{ code: "pt-BR", name: "Português", direction: "ltr" }],
      });

      await expect(result).resolves.toMatchObject({
        status: "skipped",
        copied: 0,
        legacyDropped: false,
      });
      expect(calls.createLanguage).not.toHaveBeenCalled();
      expect(calls.deleteRelation).not.toHaveBeenCalled();
      expect(calls.dropCollection).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("quando as duas existem com códigos sobrepostos", () => {
    it("insere só os códigos faltantes e não sobrescreve os existentes", async () => {
      const { result, calls } = migrate({
        directus_collections: bothCollectionsExist,
        directus_relations: [TRANSLATIONS_RELATION],
        languages: [
          { code: "en-US", name: "English", direction: "ltr" },
          { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
          { code: "es-ES", name: "Español", direction: "ltr" },
        ],
        language: [{ code: "pt-BR", name: "Português", direction: "ltr" }],
      });

      await expect(result).resolves.toMatchObject({
        status: "migrated",
        copied: 2,
      });

      const copiedCodes = calls.createLanguage.mock.calls.map(
        ([language]) => language.code,
      );
      expect(copiedCodes.sort()).toEqual(["en-US", "es-ES"]);
      expect(calls.dropCollection).toHaveBeenCalledWith(
        LEGACY_LANGUAGE_COLLECTION,
      );
    });
  });

  describe("quando nenhuma das duas existe (instalação nova)", () => {
    it("não faz nada e não registra erro", async () => {
      const { result, calls, logger } = migrate({
        directus_collections: [],
        directus_relations: [],
      });

      await expect(result).resolves.toMatchObject({
        status: "skipped",
        copied: 0,
        legacyDropped: false,
      });
      expect(calls.dropCollection).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("quando outra extensão ainda referencia a coleção legada", () => {
    it("migra os dados mas se recusa a derrubar a coleção", async () => {
      const { result, calls, logger } = migrate({
        directus_collections: bothCollectionsExist,
        directus_relations: [TRANSLATIONS_RELATION, THIRD_PARTY_RELATION],
        languages: englishOnly,
        language: [],
      });

      await expect(result).resolves.toEqual({
        status: "partial",
        copied: 1,
        relationsRepointed: 1,
        legacyDropped: false,
        blockedBy: ["some_other_extension_translations.languages_code"],
      });
      expect(calls.dropCollection).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("quando algo falha, o boot nunca é bloqueado", () => {
    it("registra e devolve parcial se derrubar a coleção lançar", async () => {
      const { result, logger } = migrate(
        {
          directus_collections: bothCollectionsExist,
          directus_relations: [TRANSLATIONS_RELATION],
          languages: englishOnly,
          language: [],
        },
        {
          dropCollection: vi
            .fn<CollectionsService["deleteOne"]>()
            .mockRejectedValue(new Error("permission denied")),
        },
      );

      await expect(result).resolves.toMatchObject({
        status: "partial",
        legacyDropped: false,
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it("segue copiando as demais linhas quando uma inserção falha", async () => {
      const createLanguage = vi
        .fn<ItemsService["createOne"]>()
        .mockRejectedValueOnce(new Error("constraint violation"))
        .mockResolvedValue(undefined);

      const { result, logger } = migrate(
        {
          directus_collections: bothCollectionsExist,
          directus_relations: [TRANSLATIONS_RELATION],
          languages: [
            { code: "en-US", name: "English", direction: "ltr" },
            { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
          ],
          language: [],
        },
        { createLanguage },
      );

      await expect(result).resolves.toMatchObject({ copied: 1 });
      expect(createLanguage).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("aborta sem derrubar nada quando a coleção nova não existe", async () => {
      const { result, calls, logger } = migrate({
        directus_collections: [{ collection: LEGACY_LANGUAGE_COLLECTION }],
        directus_relations: [TRANSLATIONS_RELATION],
        languages: englishOnly,
      });

      await expect(result).resolves.toMatchObject({ status: "skipped" });
      expect(calls.dropCollection).not.toHaveBeenCalled();
      expect(calls.createLanguage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("idempotência", () => {
    it("não faz nada no segundo boot", async () => {
      const first = await migrate({
        directus_collections: bothCollectionsExist,
        directus_relations: [TRANSLATIONS_RELATION],
        languages: englishOnly,
        language: [],
      }).result;
      expect(first.status).toBe("migrated");

      const second = migrate({
        directus_collections: [{ collection: LANGUAGE_COLLECTION }],
        directus_relations: [
          { ...TRANSLATIONS_RELATION, one_collection: LANGUAGE_COLLECTION },
        ],
        language: englishOnly,
      });

      await expect(second.result).resolves.toMatchObject({
        status: "skipped",
        copied: 0,
        legacyDropped: false,
      });
      expect(second.calls.dropCollection).not.toHaveBeenCalled();
      expect(second.logger.error).not.toHaveBeenCalled();
    });
  });
});
