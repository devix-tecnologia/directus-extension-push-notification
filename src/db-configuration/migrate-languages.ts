/**
 * 🚨 BREAKING CHANGE 🚨 — migrate the `languages` collection to `language`.
 *
 * Until v0.x this extension created a collection named `languages` (plural).
 * The Devix Tecnologia convention — already used in production by
 * `directus-extension-inframe` — is the singular `language`. Installing both
 * extensions on the same Directus instance created two collections with the
 * very same purpose, differing only by plural/singular.
 *
 * From v1.0.0 on, this extension uses `language`. On boot this migration:
 *
 *   1. copies every row of the legacy `languages` table that is missing in
 *      `language` (matched by `code`) — existing rows are NEVER overwritten;
 *   2. repoints the relations this extension owns from `languages` to
 *      `language` through the `RelationsService`;
 *   3. confirms no other collection still references `languages` — if one does,
 *      the drop is skipped and a warning is logged;
 *   4. drops the legacy collection through the `CollectionsService`, so that
 *      Directus cleans up `directus_collections`, `directus_fields`,
 *      `directus_relations` and the physical table.
 *
 * The migration is idempotent and never throws: a failure is logged and the
 * extension boot carries on.
 */

export const LEGACY_LANGUAGES_COLLECTION = "languages";
export const LANGUAGE_COLLECTION = "language";

/** Relations owned by this extension, therefore safe to repoint. */
export const OWNED_LANGUAGE_RELATIONS = [
  "user_notification_translations.languages_code",
];

/** Columns copied from the legacy collection (same shape as inframe's). */
const LANGUAGE_COLUMNS = ["code", "name", "direction"] as const;

export type MigrationStatus = "skipped" | "partial" | "migrated";

export interface MigrationResult {
  /** `skipped`: nothing to do — `partial`: data moved but legacy kept — `migrated`: legacy dropped. */
  status: MigrationStatus;
  /** How many rows were copied from `languages` into `language`. */
  copied: number;
  /** How many owned relations were repointed to `language`. */
  relationsRepointed: number;
  /** Whether the legacy `languages` collection was dropped. */
  legacyDropped: boolean;
  /** `collection.field` of the relations that blocked the drop. */
  blockedBy: string[];
}

interface QueryBuilder {
  select: (...columns: string[]) => QueryBuilder;
  where: (column: string, value: unknown) => QueryBuilder;
  first: () => Promise<Record<string, unknown> | undefined>;
  then: (
    resolve: (value: Record<string, unknown>[]) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => unknown;
}

type Knex = (table: string) => QueryBuilder;

interface Logger {
  info: (msg: string) => void;
  debug: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

interface Services {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CollectionsService: new (context: any) => {
    deleteOne: (collection: string) => Promise<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RelationsService: new (context: any) => {
    deleteOne: (collection: string, field: string) => Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createOne: (relation: any) => Promise<unknown>;
  };
  ItemsService: new (
    collection: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createOne: (data: any) => Promise<unknown>;
  };
}

export interface MigrateLanguagesContext {
  knex: Knex;
  services: Services;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  logger: Logger;
}

interface RelationRow {
  many_collection: string;
  many_field: string;
  one_field: string | null;
  junction_field: string | null;
  sort_field: string | null;
  one_deselect_action: string | null;
}

async function collectionExists(knex: Knex, collection: string) {
  const row = await knex("directus_collections")
    .select("collection")
    .where("collection", collection)
    .first();

  return Boolean(row);
}

/** Relation payload recreating the FK against `language.code`. */
function buildRepointedRelation(relation: RelationRow) {
  return {
    collection: relation.many_collection,
    field: relation.many_field,
    related_collection: LANGUAGE_COLLECTION,
    schema: {
      table: relation.many_collection,
      column: relation.many_field,
      foreign_key_table: LANGUAGE_COLLECTION,
      foreign_key_column: "code",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: relation.many_collection,
      many_field: relation.many_field,
      one_collection: LANGUAGE_COLLECTION,
      one_field: relation.one_field ?? null,
      one_collection_field: null,
      one_allowed_collections: null,
      junction_field: relation.junction_field ?? null,
      sort_field: relation.sort_field ?? null,
      one_deselect_action: relation.one_deselect_action ?? "nullify",
    },
  };
}

export async function migrateLanguagesToLanguage({
  knex,
  services,
  schema,
  logger,
}: MigrateLanguagesContext): Promise<MigrationResult> {
  const result: MigrationResult = {
    status: "skipped",
    copied: 0,
    relationsRepointed: 0,
    legacyDropped: false,
    blockedBy: [],
  };

  try {
    const legacyExists = await collectionExists(
      knex,
      LEGACY_LANGUAGES_COLLECTION,
    );

    if (!legacyExists) {
      logger.debug(
        `[DB Configuration] No legacy '${LEGACY_LANGUAGES_COLLECTION}' collection found, nothing to migrate`,
      );

      return result;
    }

    logger.info(
      `[DB Configuration] 🚨 BREAKING CHANGE: migrating '${LEGACY_LANGUAGES_COLLECTION}' to '${LANGUAGE_COLLECTION}'`,
    );

    const targetExists = await collectionExists(knex, LANGUAGE_COLLECTION);

    if (!targetExists) {
      logger.warn(
        `[DB Configuration] ⚠️  Target collection '${LANGUAGE_COLLECTION}' does not exist, aborting migration (legacy data kept intact)`,
      );

      return result;
    }

    // STEP 1: copy the rows missing in `language` (never overwrite).
    result.copied = await copyMissingLanguages({
      knex,
      services,
      schema,
      logger,
    });

    // STEP 2: repoint the relations owned by this extension.
    const relations = (await knex("directus_relations")
      .select(
        "many_collection",
        "many_field",
        "one_field",
        "junction_field",
        "sort_field",
        "one_deselect_action",
      )
      .where(
        "one_collection",
        LEGACY_LANGUAGES_COLLECTION,
      )) as unknown as RelationRow[];

    const owned = relations.filter((relation) =>
      OWNED_LANGUAGE_RELATIONS.includes(
        `${relation.many_collection}.${relation.many_field}`,
      ),
    );
    const foreign = relations.filter(
      (relation) =>
        !OWNED_LANGUAGE_RELATIONS.includes(
          `${relation.many_collection}.${relation.many_field}`,
        ),
    );

    const relationsService = new services.RelationsService({ knex, schema });

    for (const relation of owned) {
      const label = `${relation.many_collection}.${relation.many_field}`;

      try {
        await relationsService.deleteOne(
          relation.many_collection,
          relation.many_field,
        );
        await relationsService.createOne(buildRepointedRelation(relation));
        result.relationsRepointed++;

        logger.info(
          `[DB Configuration] ✅ Relation '${label}' repointed to '${LANGUAGE_COLLECTION}'`,
        );
      } catch (error: unknown) {
        result.blockedBy.push(label);
        logger.error(
          `[DB Configuration] ❌ Failed to repoint relation '${label}': ${(error as Error).message}`,
        );
      }
    }

    // STEP 3: confirm nothing else still references the legacy collection.
    for (const relation of foreign) {
      const label = `${relation.many_collection}.${relation.many_field}`;
      result.blockedBy.push(label);

      logger.warn(
        `[DB Configuration] ⚠️  Collection '${LEGACY_LANGUAGES_COLLECTION}' is still referenced by '${label}' (another extension?)`,
      );
    }

    if (result.blockedBy.length > 0) {
      logger.warn(
        `[DB Configuration] ⚠️  Skipping the drop of '${LEGACY_LANGUAGES_COLLECTION}': repoint ${result.blockedBy.join(", ")} and restart Directus to finish the migration`,
      );
      result.status = "partial";

      return result;
    }

    // STEP 4: drop the legacy collection through the CollectionsService.
    const collectionsService = new services.CollectionsService({
      knex,
      schema,
    });

    try {
      await collectionsService.deleteOne(LEGACY_LANGUAGES_COLLECTION);
      result.legacyDropped = true;
      result.status = "migrated";

      logger.info(
        `[DB Configuration] ✅ Legacy collection '${LEGACY_LANGUAGES_COLLECTION}' dropped — '${LANGUAGE_COLLECTION}' is now the single source of truth`,
      );
    } catch (error: unknown) {
      result.status = "partial";
      logger.error(
        `[DB Configuration] ❌ Failed to drop '${LEGACY_LANGUAGES_COLLECTION}': ${(error as Error).message}`,
      );
    }

    return result;
  } catch (error: unknown) {
    logger.error(
      `[DB Configuration] ❌ Error migrating '${LEGACY_LANGUAGES_COLLECTION}' to '${LANGUAGE_COLLECTION}': ${(error as Error).message}`,
    );

    return result;
  }
}

async function copyMissingLanguages({
  knex,
  services,
  schema,
  logger,
}: MigrateLanguagesContext): Promise<number> {
  const legacyRows = (await knex(LEGACY_LANGUAGES_COLLECTION).select(
    ...LANGUAGE_COLUMNS,
  )) as Array<Record<string, unknown>>;

  if (legacyRows.length === 0) {
    logger.debug(
      `[DB Configuration] Legacy '${LEGACY_LANGUAGES_COLLECTION}' collection is empty, nothing to copy`,
    );

    return 0;
  }

  const existingRows = (await knex(LANGUAGE_COLLECTION).select(
    "code",
  )) as Array<Record<string, unknown>>;
  const existingCodes = new Set(existingRows.map((row) => row.code));

  const languageService = new services.ItemsService(LANGUAGE_COLLECTION, {
    knex,
    schema,
  });

  let copied = 0;

  for (const row of legacyRows) {
    if (existingCodes.has(row.code)) {
      logger.debug(
        `[DB Configuration] ⏭️  Language ${String(row.code)} already exists in '${LANGUAGE_COLLECTION}', keeping the existing row`,
      );
      continue;
    }

    try {
      await languageService.createOne({
        code: row.code,
        name: row.name,
        direction: row.direction,
      });
      copied++;
    } catch (error: unknown) {
      logger.warn(
        `[DB Configuration] ⚠️  Could not copy language ${String(row.code)}: ${(error as Error).message}`,
      );
    }
  }

  if (copied > 0) {
    logger.info(
      `[DB Configuration] ✅ Copied ${copied} language(s) from '${LEGACY_LANGUAGES_COLLECTION}' to '${LANGUAGE_COLLECTION}'`,
    );
  }

  return copied;
}
