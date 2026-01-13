import { defineEndpoint } from '@directus/extensions-sdk';
import webPush from 'web-push'
// const webPush = require("web-push");

const collection = "PushNotification"

export default defineEndpoint(async (router, { services, database, getSchema, env, logger }) => {
	const { ItemsService } = services;

	webPush.setVapidDetails(
		env.PUBLIC_URL,
		env.VAPID_PUBLIC_KEY,
		env.VAPID_PRIVATE_KEY
	);

	router.post('/register', async (req, res) => {
		logger.info('[Push Notification] Registering subscription')
		const accountability = (req as any).accountability
		const itemsService = new ItemsService(collection, { knex: database, schema: (await getSchema()), accountability: accountability })
		const user = accountability?.user
		const subscription: PushSubscription | undefined = req.body.subscription;

		if (!(subscription && subscription.endpoint)) {
			logger.info('[Push Notification] Incorrect Subscription payload')
			res.status(400).send(`Incorrect Subscription payload`)
			return
		}
		const subscriptions = await itemsService.readByQuery({
			filter: {
				'endpoint': { _eq: subscription?.endpoint }
			}
		})
		if (subscriptions.length === 0) {
			const subscriptionId = await itemsService.createOne({
				endpoint: subscription.endpoint,
				subscription,
				user
			})
			logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} registered on id ${subscriptionId}`);
			res.status(201).send(`Subscription with endpoint ${subscription.endpoint} registered on id ${subscriptionId}`)
			return
		}
		const sub = subscriptions[0];
		if (!sub) {
			res.status(500).send('Unexpected error: subscription not found');
			return;
		}
		if (sub.user != user) {
			logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id} but updating user...`);
			await itemsService.updateOne(sub.id, { user })
			logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`);
			res.status(202).send(`Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`)
			return
		}
		logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id}`);
		res.status(208).send(`Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id}`)
	})

	router.post('/unregister', async (req, res) => {
		logger.info('[Push Notification] Unregistering subscription')
		const accountability = (req as any).accountability
		const itemsService = new ItemsService(collection, { knex: database, schema: (await getSchema()), accountability: accountability })
		const user = accountability?.user
		const subscription: PushSubscription | undefined = req.body.subscription;

		if (!(subscription && subscription.endpoint)) {
			logger.info('[Push Notification] Incorrect Subscription payload')
			res.status(400).send(`Incorrect Subscription payload`)
			return
		}
		const subscriptions = await itemsService.readByQuery({
			filter: {
				'endpoint': { _eq: subscription?.endpoint }
			}, fields: ['*']
		})
		if (subscriptions.length === 0) {
			logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} not registered`);
			res.status(404).send(`Subscription with endpoint ${subscription.endpoint} not registered`)
			return
		}
		const sub = subscriptions[0];
		if (!sub) {
			res.status(500).send('Unexpected error: subscription not found');
			return;
		}
		if (sub.user != user) {
			logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id} but updating user...`);
			logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`);
			res.status(202).send(`Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`)
			return
		}
		await itemsService.deleteOne(sub.id)
		logger.info(`[Push Notification] Subscription with endpoint ${subscription.endpoint} unregistered`);
		res.status(201).send(`Subscription with endpoint ${subscription.endpoint} unregistered`)
	})

	router.get("/send-notification", async (req, _res) => {
		logger.info('[Push Notification] Sending all notifications')
		const itemsService = new ItemsService(collection, { knex: database, schema: (await getSchema()), accountability: (req as any).accountability })
		const payload = null;
		const options = {
			TTL: req.body.ttl,
		};
		const subcriptions = await itemsService.readByQuery({ fields: ['*'] });

		for (const index in subcriptions) {
			const subcription = subcriptions[index]
			if (!subcription) continue;
			try {
				if (subcription.subscription) {
					await webPush
						.sendNotification(subcription.subscription, payload, options)
				}
			} catch (e: any) {
				if (e.body === 'push subscription has unsubscribed or expired.\n') {
					logger.info(`[Push Notification] Subscription ${subcription.id} has unsubscribed or expired. Removing it...`)
					await itemsService.deleteOne(subcription.id)
					logger.info(`[Push Notification] Subscription ${subcription.id} removed`)
				}
			}
		}
		logger.info('[Push Notification] Notifications sent')
	});
	router.get("/send-notification/:userId", async (req, _res) => {
		const user = req.params.userId
		logger.info(`[Push Notification] Sending notifications to user ${user}`)
		const itemsService = new ItemsService(collection, { knex: database, schema: (await getSchema()), accountability: (req as any).accountability })
		const payload = null;
		const options = {
			TTL: req.body.ttl,
		};
		const subcriptions = await itemsService.readByQuery({ fields: ['*'], filter: { user: { _eq: user } } });

		for (const index in subcriptions) {
			const subcription = subcriptions[index]
			if (!subcription) continue;
			try {
				if (subcription.subscription) {
					await webPush
						.sendNotification(subcription.subscription, payload, options)
				}
			} catch (e: any) {
				if (e.body === 'push subscription has unsubscribed or expired.\n') {
					logger.info(`[Push Notification] Subscription ${subcription.id} has unsubscribed or expired, removing it...`)
					await itemsService.deleteOne(subcription.id)
					logger.info(`[Push Notification] Subscription ${subcription.id} removed`)
				}
			}
		}
		logger.info('[Push Notification] Notifications sent')
	});
});
