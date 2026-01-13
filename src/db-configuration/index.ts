import { defineHook } from '@directus/extensions-sdk';
import { readInnerFile } from '../utils/files.js';


export default defineHook(({ init }, { services, database, getSchema }) => {
	const { CollectionsService, RelationsService } = services;
	init('routes.custom.after', async () => {

		const directusState = JSON.parse(readInnerFile('directus-state.json').toString())
		if (directusState.collections) {
			const collectionsService = new CollectionsService({ knex: database, schema: await getSchema()})
			const collections = (Array.isArray(directusState.collections) ? directusState.collections : [directusState.collections]) as Array<{ collection: string }>
			for (const collection of collections) {
				try {
					await collectionsService.readOne(collection.collection)
				} catch (e: any) {
					if (e?.message !== "You don't have permission to access this.") throw e
					const fields = ((Array.isArray(directusState.fields) ?
						directusState.fields :
						[directusState.fields]) as Array<{ collection: string, field: string }>)
						.filter(field => field.collection == collection.collection)
					await collectionsService.createOne({ ...collection, fields }, { autoPurgeCache: true, autoPurgeSystemCache: true })
				}
			}
		}
		if (directusState.relations) {
			const relationsService = new RelationsService({ knex: database, schema: await getSchema({ database: database }) })
			const relations = (Array.isArray(directusState.relations) ? directusState.relations : [directusState.relations]) as Array<{ collection: string, field: string }>
			for (const relation of relations) {
				try {
					await relationsService.readOne(relation.collection, relation.field)
				} catch (e: any) {
					if (e?.message !== "You don't have permission to access this.") throw e
					await relationsService.createOne(relation, { autoPurgeCache: true, autoPurgeSystemCache: true })
				}
			}
		}
	})
})