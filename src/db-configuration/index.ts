import { defineHook } from "@directus/extensions-sdk";
import { readInnerFile } from "../utils/files.js";

export default defineHook(
  ({ init }, { services, database, getSchema, logger }) => {
    const { CollectionsService, FieldsService, RelationsService } = services;
    init("routes.custom.after", async () => {
      const startTime = Date.now();
      logger.info("[DB Configuration] Starting database configuration");

      const directusState = JSON.parse(
        readInnerFile("directus-state.json").toString(),
      );

      logger.debug("[DB Configuration] State file loaded successfully");

      let collectionsCreated = 0;
      let fieldsCreated = 0;
      let relationsCreated = 0;

      const collections = directusState.collections
        ? Array.isArray(directusState.collections)
          ? directusState.collections
          : [directusState.collections]
        : [];
      const fields = directusState.fields
        ? Array.isArray(directusState.fields)
          ? directusState.fields
          : [directusState.fields]
        : [];
      const relations = directusState.relations
        ? Array.isArray(directusState.relations)
          ? directusState.relations
          : [directusState.relations]
        : [];

      // STEP 1: Create collections WITH their fields in a single call
      // This prevents Directus from auto-creating a basic 'id' field
      if (collections.length > 0) {
        const collectionsService = new CollectionsService({
          knex: database,
          schema: await getSchema(),
        });

        for (const collection of collections) {
          try {
            await collectionsService.readOne(collection.collection);
            logger.info(
              `[DB Configuration] Collection '${collection.collection}' already exists, skipping`,
            );
          } catch (e: unknown) {
            // Get all fields for this collection
            const collectionFields = fields.filter(
              (f: Record<string, unknown>) =>
                f.collection === collection.collection,
            );

            logger.info(
              `[DB Configuration] Creating collection '${collection.collection}' with ${collectionFields.length} field(s)`,
            );

            // Create collection WITH fields - prevents auto-creation of basic id field
            try {
              await collectionsService.createOne({
                collection: collection.collection,
                meta: collection.meta,
                schema: collection.schema || null,
                fields: collectionFields.map(
                  (field: Record<string, unknown>) => {
                    const fieldData: Record<string, unknown> = {
                      field: field.field,
                      type: field.type,
                      meta: field.meta,
                    };

                    // Only add schema if not null (alias fields don't have schema)
                    if (field.schema !== null && field.schema !== undefined) {
                      fieldData.schema = field.schema;
                    }

                    return fieldData;
                  },
                ),
              });
              collectionsCreated++;
              fieldsCreated += collectionFields.length;

              logger.info(
                `[DB Configuration] Collection '${collection.collection}' created successfully with ${collectionFields.length} field(s)`,
              );
            } catch (createError: unknown) {
              const err = createError as { message?: string; code?: string };
              // Se já existe, ignorar (pode ter sido criada por outra extensão)
              if (
                err?.message?.includes("already exists") ||
                err?.code === "23505" || // Duplicate key
                err?.code === "42P07" || // Duplicate table
                err?.code === "42P16" // Multiple primary keys
              ) {
                logger.warn(
                  `[DB Configuration] Collection '${collection.collection}' already exists (created by another extension?), skipping`,
                );
              } else {
                logger.error(
                  `[DB Configuration] Error creating collection '${collection.collection}':`,
                  createError,
                );
                // Não fazer throw - continuar com outras coleções
              }
            }
          }
        }

        if (collectionsCreated > 0) {
          logger.info(
            `[DB Configuration] Created ${collectionsCreated} collection(s) with ${fieldsCreated} field(s)`,
          );
        }
      }

      // STEP 2: Add any missing fields to existing collections
      // This handles cases where collections existed but fields were added later
      if (fields.length > 0) {
        // Refresh schema after collections creation
        const updatedSchema = await getSchema({ database: database });

        const fieldsService = new FieldsService({
          knex: database,
          schema: updatedSchema,
        });

        let additionalFieldsCreated = 0;

        for (const field of fields) {
          try {
            await fieldsService.readOne(field.collection, field.field);
            logger.debug(
              `[DB Configuration] Field '${field.field}' in '${field.collection}' already exists`,
            );
          } catch (e: unknown) {
            logger.debug(
              `[DB Configuration] Creating field '${field.field}' in collection '${field.collection}'`,
            );

            const fieldData: Record<string, unknown> = {
              field: field.field,
              type: field.type,
              meta: field.meta,
            };

            if (field.schema !== null && field.schema !== undefined) {
              fieldData.schema = field.schema;
            }

            await fieldsService.createField(
              field.collection,
              fieldData as Parameters<typeof fieldsService.createField>[1],
            );
            additionalFieldsCreated++;

            logger.debug(
              `[DB Configuration] Field '${field.field}' created successfully`,
            );
          }
        }

        if (additionalFieldsCreated > 0) {
          logger.info(
            `[DB Configuration] Added ${additionalFieldsCreated} additional field(s)`,
          );
        }
      }

      // STEP 3: Create relations
      if (relations.length > 0) {
        // Refresh schema again before relations
        const updatedSchema = await getSchema({ database: database });

        const relationsService = new RelationsService({
          knex: database,
          schema: updatedSchema,
        });

        for (const relation of relations) {
          try {
            logger.debug(
              `[DB Configuration] Creating relation '${relation.collection}.${relation.field}' -> ${relation.related_collection}`,
            );
            await relationsService.createOne(relation);
            relationsCreated++;
            logger.info(
              `[DB Configuration] Relation '${relation.collection}.${relation.field}' created successfully`,
            );
          } catch (e: unknown) {
            const error = e as { message?: string };
            if (
              error?.message &&
              (error.message.includes("already exists") ||
                error.message.includes("duplicate"))
            ) {
              logger.debug(
                `[DB Configuration] Relation '${relation.collection}.${relation.field}' already exists`,
              );
            } else {
              logger.warn(
                `[DB Configuration] Could not create relation '${relation.collection}.${relation.field}': ${error?.message}`,
              );
              // Não fazer throw - continuar com outras relações
            }
          }
        }

        if (relationsCreated > 0) {
          logger.info(
            `[DB Configuration] Created ${relationsCreated} relation(s)`,
          );
        }
      }

      // STEP 4: Populate languages collection with default languages
      await setupDefaultLanguages({ services, database, getSchema, logger });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalChanges =
        collectionsCreated + fieldsCreated + relationsCreated;

      if (totalChanges > 0) {
        logger.info(
          `[DB Configuration] Completed: ${collectionsCreated} collections, ${fieldsCreated} fields, ${relationsCreated} relations (${elapsed}s)`,
        );
      } else {
        logger.debug(
          "[DB Configuration] No changes needed - schema up to date",
        );
      }

      // Force schema refresh
      try {
        await getSchema({ database: database });
        logger.debug("[DB Configuration] Schema refreshed");
      } catch (error: unknown) {
        logger.warn(
          `[DB Configuration] Error refreshing schema: ${(error as Error).message}`,
        );
      }
    });
  },
);

/**
 * Setup default languages (pt-BR, en-US, es-ES)
 */
async function setupDefaultLanguages({
  services,
  database,
  getSchema,
  logger,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSchema: (options?: { database?: any }) => Promise<any>;
  logger: {
    info: (msg: string) => void;
    debug: (msg: string) => void;
    warn: (msg: string) => void;
  };
}) {
  logger.info("[DB Configuration] 🌍 Setting up default languages...");

  const { ItemsService } = services as {
    ItemsService: new (
      collection: string,
      context: unknown,
    ) => {
      createOne: (data: unknown) => Promise<unknown>;
    };
  };

  // All languages officially supported by Directus
  const defaultLanguages = [
    { code: "af-ZA", name: "Afrikaans", direction: "ltr" },
    { code: "ar-SA", name: "العربية", direction: "rtl" },
    { code: "bg-BG", name: "Български", direction: "ltr" },
    { code: "ca-ES", name: "Català", direction: "ltr" },
    { code: "cs-CZ", name: "Čeština", direction: "ltr" },
    { code: "da-DK", name: "Dansk", direction: "ltr" },
    { code: "de-DE", name: "Deutsch", direction: "ltr" },
    { code: "el-GR", name: "Ελληνικά", direction: "ltr" },
    { code: "en-US", name: "English", direction: "ltr" },
    { code: "es-ES", name: "Español", direction: "ltr" },
    { code: "et-EE", name: "Eesti", direction: "ltr" },
    { code: "eu-ES", name: "Euskara", direction: "ltr" },
    { code: "fa-IR", name: "فارسی", direction: "rtl" },
    { code: "fi-FI", name: "Suomi", direction: "ltr" },
    { code: "fr-FR", name: "Français", direction: "ltr" },
    { code: "he-IL", name: "עברית", direction: "rtl" },
    { code: "hi-IN", name: "हिन्दी", direction: "ltr" },
    { code: "hr-HR", name: "Hrvatski", direction: "ltr" },
    { code: "hu-HU", name: "Magyar", direction: "ltr" },
    { code: "id-ID", name: "Bahasa Indonesia", direction: "ltr" },
    { code: "is-IS", name: "Íslenska", direction: "ltr" },
    { code: "it-IT", name: "Italiano", direction: "ltr" },
    { code: "ja-JP", name: "日本語", direction: "ltr" },
    { code: "ko-KR", name: "한국어", direction: "ltr" },
    { code: "lt-LT", name: "Lietuvių", direction: "ltr" },
    { code: "lv-LV", name: "Latviešu", direction: "ltr" },
    { code: "mk-MK", name: "Македонски", direction: "ltr" },
    { code: "ms-MY", name: "Bahasa Melayu", direction: "ltr" },
    { code: "nb-NO", name: "Norsk Bokmål", direction: "ltr" },
    { code: "nl-NL", name: "Nederlands", direction: "ltr" },
    { code: "nn-NO", name: "Norsk Nynorsk", direction: "ltr" },
    { code: "pl-PL", name: "Polski", direction: "ltr" },
    { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
    { code: "pt-PT", name: "Português (Portugal)", direction: "ltr" },
    { code: "ro-RO", name: "Română", direction: "ltr" },
    { code: "ru-RU", name: "Русский", direction: "ltr" },
    { code: "sk-SK", name: "Slovenčina", direction: "ltr" },
    { code: "sl-SI", name: "Slovenščina", direction: "ltr" },
    { code: "sr-RS", name: "Српски", direction: "ltr" },
    { code: "sv-SE", name: "Svenska", direction: "ltr" },
    { code: "th-TH", name: "ไทย", direction: "ltr" },
    { code: "tr-TR", name: "Türkçe", direction: "ltr" },
    { code: "uk-UA", name: "Українська", direction: "ltr" },
    { code: "vi-VN", name: "Tiếng Việt", direction: "ltr" },
    { code: "zh-CN", name: "简体中文", direction: "ltr" },
    { code: "zh-TW", name: "繁體中文", direction: "ltr" },
  ];

  try {
    // Check if language collection exists
    const knex = database as {
      select: (columns: string | string[]) => {
        from: (table: string) => {
          where: (
            column: string,
            value: string,
          ) => { first: () => Promise<unknown> };
        };
      };
    };

    const collectionExists = await knex
      .select("collection")
      .from("directus_collections")
      .where("collection", "languages")
      .first();

    if (!collectionExists) {
      logger.warn(
        "[DB Configuration] ⚠️  Languages collection does not exist, skipping language setup",
      );
      return;
    }

    // Get current schema
    const currentSchema = await getSchema({ database });

    // Create ItemsService for languages collection
    const languagesService = new ItemsService("languages", {
      schema: currentSchema,
      knex: database,
    });

    let languagesCreated = 0;

    for (const language of defaultLanguages) {
      try {
        // Check if language already exists
        const existingLanguage = await knex
          .select("*")
          .from("languages")
          .where("code", language.code)
          .first();

        if (existingLanguage) {
          logger.debug(
            `[DB Configuration] ⏭️  Language ${language.code} (${language.name}) already exists`,
          );
          continue;
        }

        // Create language
        await languagesService.createOne(language);
        languagesCreated++;
        logger.info(
          `[DB Configuration] ✅ Language ${language.code} (${language.name}) created`,
        );
      } catch (error: unknown) {
        logger.warn(
          `[DB Configuration] ❌ Error creating language ${language.code}: ${(error as Error).message}`,
        );
      }
    }

    if (languagesCreated > 0) {
      logger.info(
        `[DB Configuration] ✅ Created ${languagesCreated} default language(s)`,
      );
    } else {
      logger.info("[DB Configuration] ℹ️  All default languages already exist");
    }
  } catch (error: unknown) {
    logger.warn(
      `[DB Configuration] ❌ Error setting up languages: ${(error as Error).message}`,
    );
  }
}
