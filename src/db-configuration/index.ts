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

      if (directusState.collections) {

        const collectionsService = new CollectionsService({
          knex: database,
          schema: await getSchema(),
        });
        const collections = (
          Array.isArray(directusState.collections)
            ? directusState.collections
            : [directusState.collections]
        ) as Array<{ collection: string }>;
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

            logger.debug(
              `[DB Configuration] Creating collection '${collection.collection}'`,
            );
            await collectionsService.createOne(collection);
            collectionsCreated++;
            logger.debug(
              `[DB Configuration] Collection '${collection.collection}' created successfully`,
            );
          }
        }

        if (collectionsCreated > 0) {
          logger.info(
            `[DB Configuration] Created ${collectionsCreated} collection(s)`,
          );
        }
      }

      if (directusState.fields) {

        const fieldsService = new FieldsService({
          knex: database,
          schema: await getSchema({ database: database }),
        });
        const fields = Array.isArray(directusState.fields)
          ? directusState.fields
          : [directusState.fields];
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
            await fieldsService.createField(field.collection, field);
            fieldsCreated++;
            logger.debug(
              `[DB Configuration] Field '${field.field}' created successfully`,
            );
          }
        }

        if (fieldsCreated > 0) {
          logger.info(`[DB Configuration] Created ${fieldsCreated} field(s)`);
        }
      }

      if (directusState.relations) {

        const relationsService = new RelationsService({
          knex: database,
          schema: await getSchema({ database: database }),
        });
        const relations = (
          Array.isArray(directusState.relations)
            ? directusState.relations
            : [directusState.relations]
        ) as Array<{ collection: string; field: string }>;
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
      const totalChanges = collectionsCreated + fieldsCreated + relationsCreated;
      
      if (totalChanges > 0) {
        logger.info(
          `[DB Configuration] Completed: ${collectionsCreated} collections, ${fieldsCreated} fields, ${relationsCreated} relations (${elapsed}s)`,
        );
      } else {
        logger.debug("[DB Configuration] No changes needed - schema up to date");
      }
    });
  },
);
