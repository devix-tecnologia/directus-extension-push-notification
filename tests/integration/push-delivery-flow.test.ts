import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDeliveries,
  getPushSubscription,
  getAdminUserId,
  wait,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Fluxo Completo", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.14.1";
  const testSuiteId = `delivery-flow-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Push Delivery Flow Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Deve criar push_delivery ao criar user_notification com channel=push", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/push1",
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Test Notification",
        body: "Testing delivery creation",
        channel: "push",
      },
      testSuiteId,
    );

    // Aguardar hook processar
    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.user_notification_id).toBe(notification.id);
    expect(deliveries[0]?.push_subscription_id).toBe(subscription.id);
    expect(deliveries[0]?.status).toBe("sent");
    expect(deliveries[0]?.sent_at).toBeTruthy();
  });

  test("Deve atualizar last_used_at da subscription após envio", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/push2",
      },
      testSuiteId,
    );

    const originalLastUsed = subscription.last_used_at;

    await wait(100);

    await createUserNotification(
      {
        user_id: userId,
        title: "Test Update",
        body: "Testing last_used_at update",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const updatedSubscription = await getPushSubscription(
      subscription.id,
      testSuiteId,
    );

    expect(updatedSubscription.last_used_at).toBeTruthy();
    expect(updatedSubscription.last_used_at).not.toBe(originalLastUsed);

    if (originalLastUsed) {
      expect(
        new Date(updatedSubscription.last_used_at!).getTime(),
      ).toBeGreaterThan(new Date(originalLastUsed).getTime());
    }
  });

  test("Não deve criar push_delivery para channel diferente de push", async () => {
    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/push3",
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Email Notification",
        body: "This should not create push delivery",
        channel: "email",
      },
      testSuiteId,
    );

    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(0);
  });

  test("Deve incluir todos os dados da notification no payload", async () => {
    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/push4",
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Notification with Metadata",
        body: "Testing payload data",
        channel: "push",
        action_url: "https://example.com/action",
        icon_url: "https://example.com/icon.png",
      },
      testSuiteId,
    );

    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(1);

    const delivery = deliveries[0];
    expect(delivery?.status).toBe("sent");
    expect(delivery?.metadata).toBeTruthy();

    // metadata deve conter informações da notification
    const metadata = delivery?.metadata as Record<string, unknown>;
    expect(metadata.title).toBe("Notification with Metadata");
    expect(metadata.body).toBe("Testing payload data");
    expect(metadata.action_url).toBe("https://example.com/action");
    expect(metadata.icon_url).toBe("https://example.com/icon.png");
  });
});
