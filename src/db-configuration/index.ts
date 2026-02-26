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
            logger.debug(
              `[DB Configuration] Collection '${collection.collection}' already exists`,
            );
          } catch (e: unknown) {
            if (
              (e as { message?: string })?.message !==
              "You don't have permission to access this."
            ) {
              logger.error(
                `[DB Configuration] Error checking collection '${collection.collection}':`,
                e,
              );
              throw e;
            }

            // Get all fields for this collection
            const collectionFields = fields.filter(
              (f: Record<string, unknown>) =>
                f.collection === collection.collection,
            );

            logger.debug(
              `[DB Configuration] Creating collection '${collection.collection}' with ${collectionFields.length} field(s)`,
            );

            // Create collection WITH fields - prevents auto-creation of basic id field
            await collectionsService.createOne({
              collection: collection.collection,
              meta: collection.meta,
              schema: collection.schema || null,
              fields: collectionFields.map((field: Record<string, unknown>) => {
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
              }),
            });

            collectionsCreated++;
            fieldsCreated += collectionFields.length;

            logger.debug(
              `[DB Configuration] Collection '${collection.collection}' created successfully with ${collectionFields.length} field(s)`,
            );
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
            if (
              (e as { message?: string })?.message !==
              "You don't have permission to access this."
            ) {
              logger.error(
                `[DB Configuration] Error checking field '${field.field}' in '${field.collection}':`,
                e,
              );
              throw e;
            }

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
              `[DB Configuration] Creating relation '${relation.field}' in collection '${relation.collection}'`,
            );
            await relationsService.createOne(relation);
            relationsCreated++;
            logger.debug(
              `[DB Configuration] Relation '${relation.field}' created successfully`,
            );
          } catch (e: unknown) {
            const error = e as { message?: string };
            if (
              error?.message &&
              (error.message.includes("already exists") ||
                error.message.includes("duplicate"))
            ) {
              logger.debug(
                `[DB Configuration] Relation '${relation.field}' in '${relation.collection}' already exists`,
              );
            } else {
              logger.error(
                `[DB Configuration] Error creating relation '${relation.field}' in '${relation.collection}':`,
                e,
              );
              throw e;
            }
          }
        }

        if (relationsCreated > 0) {
          logger.info(
            `[DB Configuration] Created ${relationsCreated} relation(s)`,
          );
        }
      }

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
