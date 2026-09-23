/**
 * BREAKING CHANGE — `languages` (plural) deu lugar a `language` (singular), a
 * convenção da Devix já usada pelo directus-extension-inframe. Instalar as duas
 * extensões na mesma instância criava duas coleções com o mesmo propósito.
 *
 * A migração roda no boot, é idempotente e nunca lança: falha é registrada e o
 * boot segue. Ela só derruba a coleção legada se mais nada apontar para ela.
 */

export const LEGACY_LANGUAGE_COLLECTION = "languages";
export const LANGUAGE_COLLECTION = "language";

export const OWNED_LANGUAGE_RELATIONS: readonly string[] = [
  "user_notification_translations.languages_code",
];

export type MigrationStatus = "skipped" | "partial" | "migrated";

export interface MigrationResult {
  status: MigrationStatus;
  copied: number;
  relationsRepointed: number;
  legacyDropped: boolean;
  blockedBy: string[];
}

export interface QueryBuilder<TRow> extends PromiseLike<TRow[]> {
  select: (...columns: string[]) => QueryBuilder<TRow>;
  where: (column: string, value: unknown) => QueryBuilder<TRow>;
  first: () => Promise<TRow | undefined>;
}

export type DirectusKnex = <TRow>(table: string) => QueryBuilder<TRow>;

export interface ServiceContext {
  knex: DirectusKnex;
  schema: unknown;
}

export interface Logger {
  info: (message: string) => void;
  debug: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

interface LanguageRow {
  code: string;
  name: string;
  direction: string;
}

interface LegacyRelationRow {
  many_collection: string;
  many_field: string;
  one_field: string | null;
  junction_field: string | null;
  sort_field: string | null;
  one_deselect_action: string | null;
}

interface RepointedRelation {
  collection: string;
  field: string;
  related_collection: string;
  schema: Record<string, string>;
  meta: Record<string, string | null>;
}

export interface DirectusServices {
  CollectionsService: new (context: ServiceContext) => {
    deleteOne: (collection: string) => Promise<unknown>;
  };
  RelationsService: new (context: ServiceContext) => {
    deleteOne: (collection: string, field: string) => Promise<unknown>;
    createOne: (relation: RepointedRelation) => Promise<unknown>;
  };
  ItemsService: new (
    collection: string,
    context: ServiceContext,
  ) => {
    createOne: (item: LanguageRow) => Promise<unknown>;
  };
}

export interface MigrationContext extends ServiceContext {
  services: DirectusServices;
  logger: Logger;
}

const LOG_PREFIX = "[DB Configuration]";

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const relationLabel = (relation: LegacyRelationRow) =>
  `${relation.many_collection}.${relation.many_field}`;

const isOwnedRelation = (relation: LegacyRelationRow) =>
  OWNED_LANGUAGE_RELATIONS.includes(relationLabel(relation));

async function collectionExists(knex: DirectusKnex, collection: string) {
  const row = await knex<{ collection: string }>("directus_collections")
    .select("collection")
    .where("collection", collection)
    .first();

  return Boolean(row);
}

function toRepointedRelation(relation: LegacyRelationRow): RepointedRelation {
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
      one_field: relation.one_field,
      one_collection_field: null,
      one_allowed_collections: null,
      junction_field: relation.junction_field,
      sort_field: relation.sort_field,
      one_deselect_action: relation.one_deselect_action ?? "nullify",
    },
  };
}

async function copyMissingLanguages({
  knex,
  services,
  schema,
  logger,
}: MigrationContext): Promise<number> {
  const legacyRows = await knex<LanguageRow>(LEGACY_LANGUAGE_COLLECTION).select(
    "code",
    "name",
    "direction",
  );

  if (legacyRows.length === 0) return 0;

  const existingRows =
    await knex<Pick<LanguageRow, "code">>(LANGUAGE_COLLECTION).select("code");
  const existingCodes = new Set(existingRows.map((row) => row.code));

  const languages = new services.ItemsService(LANGUAGE_COLLECTION, {
    knex,
    schema,
  });

  let copied = 0;

  for (const row of legacyRows.filter(({ code }) => !existingCodes.has(code))) {
    try {
      await languages.createOne(row);
      copied++;
    } catch (error) {
      logger.warn(
        `${LOG_PREFIX} ⚠️  Could not copy language ${row.code}: ${describeError(error)}`,
      );
    }
  }

  if (copied > 0) {
    logger.info(
      `${LOG_PREFIX} ✅ Copied ${copied} language(s) from '${LEGACY_LANGUAGE_COLLECTION}' to '${LANGUAGE_COLLECTION}'`,
    );
  }

  return copied;
}

function readRelationsPointingAtLegacy(knex: DirectusKnex) {
  return knex<LegacyRelationRow>("directus_relations")
    .select(
      "many_collection",
      "many_field",
      "one_field",
      "junction_field",
      "sort_field",
      "one_deselect_action",
    )
    .where("one_collection", LEGACY_LANGUAGE_COLLECTION);
}

async function repointOwnedRelations(
  relations: LegacyRelationRow[],
  { knex, services, schema, logger }: MigrationContext,
) {
  const service = new services.RelationsService({ knex, schema });
  const repointed: string[] = [];
  const failed: string[] = [];

  for (const relation of relations) {
    const label = relationLabel(relation);

    try {
      await service.deleteOne(relation.many_collection, relation.many_field);
      await service.createOne(toRepointedRelation(relation));
      repointed.push(label);

      logger.info(
        `${LOG_PREFIX} ✅ Relation '${label}' repointed to '${LANGUAGE_COLLECTION}'`,
      );
    } catch (error) {
      failed.push(label);
      logger.error(
        `${LOG_PREFIX} ❌ Failed to repoint relation '${label}': ${describeError(error)}`,
      );
    }
  }

  return { repointed, failed };
}

async function dropLegacyCollection({
  knex,
  services,
  schema,
  logger,
}: MigrationContext) {
  const collections = new services.CollectionsService({ knex, schema });

  try {
    await collections.deleteOne(LEGACY_LANGUAGE_COLLECTION);
    logger.info(
      `${LOG_PREFIX} ✅ Legacy collection '${LEGACY_LANGUAGE_COLLECTION}' dropped — '${LANGUAGE_COLLECTION}' is now the single source of truth`,
    );

    return true;
  } catch (error) {
    logger.error(
      `${LOG_PREFIX} ❌ Failed to drop '${LEGACY_LANGUAGE_COLLECTION}': ${describeError(error)}`,
    );

    return false;
  }
}

const nothingToMigrate: MigrationResult = {
  status: "skipped",
  copied: 0,
  relationsRepointed: 0,
  legacyDropped: false,
  blockedBy: [],
};

export async function migrateLegacyLanguageCollection(
  context: MigrationContext,
): Promise<MigrationResult> {
  const { knex, logger } = context;

  try {
    if (!(await collectionExists(knex, LEGACY_LANGUAGE_COLLECTION))) {
      logger.debug(
        `${LOG_PREFIX} No legacy '${LEGACY_LANGUAGE_COLLECTION}' collection found, nothing to migrate`,
      );

      return nothingToMigrate;
    }

    logger.info(
      `${LOG_PREFIX} 🚨 BREAKING CHANGE: migrating '${LEGACY_LANGUAGE_COLLECTION}' to '${LANGUAGE_COLLECTION}'`,
    );

    if (!(await collectionExists(knex, LANGUAGE_COLLECTION))) {
      logger.warn(
        `${LOG_PREFIX} ⚠️  Target collection '${LANGUAGE_COLLECTION}' does not exist, aborting migration (legacy data kept intact)`,
      );

      return nothingToMigrate;
    }

    // Copiar antes de recriar a foreign key: códigos que só existem na coleção
    // legada quebrariam a FK nova contra `language.code`.
    const copied = await copyMissingLanguages(context);

    const relations = await readRelationsPointingAtLegacy(knex);
    const { repointed, failed } = await repointOwnedRelations(
      relations.filter(isOwnedRelation),
      context,
    );

    const foreign = relations.filter((relation) => !isOwnedRelation(relation));

    for (const relation of foreign) {
      logger.warn(
        `${LOG_PREFIX} ⚠️  Collection '${LEGACY_LANGUAGE_COLLECTION}' is still referenced by '${relationLabel(relation)}' (another extension?)`,
      );
    }

    const blockedBy = [...failed, ...foreign.map(relationLabel)];

    if (blockedBy.length > 0) {
      logger.warn(
        `${LOG_PREFIX} ⚠️  Skipping the drop of '${LEGACY_LANGUAGE_COLLECTION}': repoint ${blockedBy.join(", ")} and restart Directus to finish the migration`,
      );

      return {
        status: "partial",
        copied,
        relationsRepointed: repointed.length,
        legacyDropped: false,
        blockedBy,
      };
    }

    const legacyDropped = await dropLegacyCollection(context);

    return {
      status: legacyDropped ? "migrated" : "partial",
      copied,
      relationsRepointed: repointed.length,
      legacyDropped,
      blockedBy,
    };
  } catch (error) {
    logger.error(
      `${LOG_PREFIX} ❌ Error migrating '${LEGACY_LANGUAGE_COLLECTION}' to '${LANGUAGE_COLLECTION}': ${describeError(error)}`,
    );

    return nothingToMigrate;
  }
}
