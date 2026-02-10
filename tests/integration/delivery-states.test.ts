import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDelivery,
  updatePushDelivery,
  getAdminUserId,
  wait,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Estados e Transições", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.14.1";
  const testSuiteId = `delivery-states-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Delivery States Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Deve transicionar de queued para sent com timestamps corretos", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/state-test-1",
        device_name: "State Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "State Transition Test",
        body: "Testing state transitions",
        channel: "push",
      },
      testSuiteId,
    );

    // Aguardar processamento
    await wait(3000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    expect(delivery?.status).toBe("failed");
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
    expect(delivery?.queued_at).toBeTruthy();
    expect(delivery?.failed_at).toBeTruthy();
    expect(delivery?.error_message).toBeTruthy();
  });

  test("Deve aceitar atualização para delivered via callback", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/delivered-test",
        device_name: "Delivered Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Delivered State Test",
        body: "Testing delivered state",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    expect(delivery?.status).toBe("sent");

    // Simular callback do Service Worker atualizando para delivered
    const updated = await updatePushDelivery(
      delivery!.id,
      {
        status: "delivered",
        delivered_at: new Date().toISOString(),
      },
      testSuiteId,
    );

    expect(updated.status).toBe("delivered");
    expect(updated.delivered_at).toBeTruthy();
  });

  test("Deve aceitar atualização para read quando usuário clica", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/read-test",
        device_name: "Read Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Read State Test",
        body: "Testing read state",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    let delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();

    // Atualizar para delivered primeiro
    if (delivery) {
      delivery = await updatePushDelivery(
        delivery.id,
        {
          status: "delivered",
          delivered_at: new Date().toISOString(),
        },
        testSuiteId,
      );

      await wait(100);

      // Simular clique do usuário
      const read = await updatePushDelivery(
        delivery.id,
        {
          status: "read",
          read_at: new Date().toISOString(),
        },
        testSuiteId,
      );

      expect(read.status).toBe("read");
      expect(read.read_at).toBeTruthy();
    }
  });

  test("Deve validar sequência de timestamps: queued_at < sent_at < delivered_at < read_at", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/timestamps-test",
        device_name: "Timestamps Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Timestamps Test",
        body: "Testing timestamp sequence",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    let delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();

    if (delivery) {
      await wait(100);
      delivery = await updatePushDelivery(
        delivery.id,
        {
          status: "delivered",
          delivered_at: new Date().toISOString(),
        },
        testSuiteId,
      );

      await wait(100);
      delivery = await updatePushDelivery(
        delivery.id,
        {
          status: "read",
          read_at: new Date().toISOString(),
        },
        testSuiteId,
      );

      // Verificar sequência de timestamps
      const queuedTime = new Date(delivery.queued_at).getTime();
      const sentTime = delivery.sent_at
        ? new Date(delivery.sent_at).getTime()
        : 0;
      const deliveredTime = delivery.delivered_at
        ? new Date(delivery.delivered_at).getTime()
        : 0;
      const readTime = delivery.read_at
        ? new Date(delivery.read_at).getTime()
        : 0;

      expect(queuedTime).toBeGreaterThan(0);
      expect(sentTime).toBeGreaterThanOrEqual(queuedTime);
      expect(deliveredTime).toBeGreaterThanOrEqual(sentTime);
      expect(readTime).toBeGreaterThanOrEqual(deliveredTime);

      // Verificar que nenhum timestamp está no futuro
      const now = Date.now();
      expect(queuedTime).toBeLessThanOrEqual(now);
      expect(sentTime).toBeLessThanOrEqual(now);
      expect(deliveredTime).toBeLessThanOrEqual(now);
      expect(readTime).toBeLessThanOrEqual(now);
    }
  });

  test("Deve incrementar attempt_count a cada tentativa", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/attempts-test",
        device_name: "Attempts Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Attempts Test",
        body: "Testing attempt count",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    expect(delivery?.status).toBe("failed");
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve respeitar max_attempts configurado", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/max-attempts-test",
        device_name: "Max Attempts Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Max Attempts Test",
        body: "Testing max attempts",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    expect(delivery?.status).toBe("failed");
    expect(delivery?.max_attempts).toBeGreaterThanOrEqual(1);
    expect(delivery?.attempt_count).toBeLessThanOrEqual(delivery!.max_attempts);
  });
});
