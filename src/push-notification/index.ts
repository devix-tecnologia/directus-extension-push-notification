/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineEndpoint } from "@directus/extensions-sdk";
import webPush from "web-push";

const collection = "push_subscription";

export default defineEndpoint(
  async (router, { services, database, getSchema, env, logger }) => {
    const { ItemsService } = services;

    webPush.setVapidDetails(
      env.PUBLIC_URL?.startsWith("http://")
        ? "mailto:admin@example.com"
        : env.PUBLIC_URL || "mailto:admin@example.com",
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );

    router.post("/register", async (req, res) => {
      logger.info("[Push Notification] Registering subscription");
      const accountability = (req as any).accountability;
      const itemsService = new ItemsService(collection, {
        knex: database,
        schema: await getSchema(),
        accountability: accountability,
      });
      const user = accountability?.user;
      const subscription: any = req.body.subscription;
      const userAgent = req.headers["user-agent"] || "";

      if (!(subscription && subscription.endpoint)) {
        logger.info("[Push Notification] Incorrect Subscription payload");
        res.status(400).send(`Incorrect Subscription payload`);
        return;
      }

      const subscriptions = await itemsService.readByQuery({
        filter: {
          endpoint: { _eq: subscription?.endpoint },
        },
      });

      if (subscriptions.length === 0) {
        const subscriptionId = await itemsService.createOne({
          user_id: user,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          user_agent: userAgent,
          is_active: true,
        });
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} registered on id ${subscriptionId}`,
        );
        res
          .status(201)
          .send(
            `Subscription with endpoint ${subscription.endpoint} registered on id ${subscriptionId}`,
          );
        return;
      }

      const sub = subscriptions[0];
      if (!sub) {
        res.status(500).send("Unexpected error: subscription not found");
        return;
      }

      if (sub.user_id != user) {
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id} but updating user...`,
        );
        await itemsService.updateOne(sub.id, {
          user_id: user,
          is_active: true,
          user_agent: userAgent,
        });
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`,
        );
        res
          .status(202)
          .send(
            `Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`,
          );
        return;
      }

      logger.info(
        `[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id}`,
      );
      res
        .status(208)
        .send(
          `Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id}`,
        );
    });

    router.post("/unregister", async (req, res) => {
      logger.info("[Push Notification] Unregistering subscription");
      const accountability = (req as any).accountability;
      const itemsService = new ItemsService(collection, {
        knex: database,
        schema: await getSchema(),
        accountability: accountability,
      });
      const user = accountability?.user;
      const subscription: any = req.body.subscription;

      if (!(subscription && subscription.endpoint)) {
        logger.info("[Push Notification] Incorrect Subscription payload");
        res.status(400).send(`Incorrect Subscription payload`);
        return;
      }

      const subscriptions = await itemsService.readByQuery({
        filter: {
          endpoint: { _eq: subscription?.endpoint },
        },
        fields: ["*"],
      });

      if (subscriptions.length === 0) {
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} not registered`,
        );
        res
          .status(404)
          .send(
            `Subscription with endpoint ${subscription.endpoint} not registered`,
          );
        return;
      }

      const sub = subscriptions[0];
      if (!sub) {
        res.status(500).send("Unexpected error: subscription not found");
        return;
      }

      if (sub.user_id != user) {
        res.status(403).send("Subscription does not belong to current user");
        return;
      }

      // Soft delete: marcar como inativa ao invés de deletar
      await itemsService.updateOne(sub.id, {
        is_active: false,
        expires_at: new Date().toISOString(),
      });

      logger.info(
        `[Push Notification] Subscription with endpoint ${subscription.endpoint} unregistered`,
      );
      res
        .status(201)
        .send(
          `Subscription with endpoint ${subscription.endpoint} unregistered`,
        );
    });
  },
);
