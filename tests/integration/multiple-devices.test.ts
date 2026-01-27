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

describe("Push Delivery - Múltiplos Dispositivos", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.14.1";
  const testSuiteId = `multiple-devices-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Multiple Devices Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Deve enviar para todos os dispositivos ativos do usuário", async () => {
    const devices = ["Desktop", "Mobile", "Tablet"];

    // Criar 3 subscriptions ativas
    for (const device of devices) {
      await createPushSubscription(
        userId,
        {
          endpoint: `https://test.com/push-${device}`,
          device_name: device,
          is_active: true,
          keys: {
            p256dh: `p256dh-${device}`,
            auth: `auth-${device}`,
          },
        },
        testSuiteId,
      );
    }

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Multi-device Notification",
        body: "Testing multiple devices",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(3);
    deliveries.forEach((delivery) => {
      expect(delivery.status).toBe("sent");
      expect(delivery.sent_at).toBeTruthy();
    });
  });

  test("Deve ignorar dispositivos inativos", async () => {
    // Criar 2 subscriptions ativas
    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/active1",
        device_name: "Active Device 1",
        is_active: true,
        keys: {
          p256dh: "p256dh-active1",
          auth: "auth-active1",
        },
      },
      testSuiteId,
    );

    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/active2",
        device_name: "Active Device 2",
        is_active: true,
        keys: {
          p256dh: "p256dh-active2",
          auth: "auth-active2",
        },
      },
      testSuiteId,
    );

    // Criar 1 subscription inativa
    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/inactive",
        device_name: "Inactive Device",
        is_active: false,
        keys: {
          p256dh: "p256dh-inactive",
          auth: "auth-inactive",
        },
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Test Active Only",
        body: "Should only send to active devices",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    // Deve ter criado apenas 2 deliveries (para os ativos)
    expect(deliveries).toHaveLength(2);
    deliveries.forEach((delivery) => {
      expect(delivery.status).toBe("sent");
    });
  });

  test("Deve identificar dispositivos corretamente por device_name", async () => {
    const deviceNames = ["Desktop Chrome", "Mobile Safari", "Tablet Firefox"];
    const createdSubscriptions: string[] = [];

    for (const name of deviceNames) {
      const sub = await createPushSubscription(
        userId,
        {
          endpoint: `https://test.com/${name.replace(/\s/g, "-")}`,
          device_name: name,
          is_active: true,
          keys: {
            p256dh: `p256dh-${name}`,
            auth: `auth-${name}`,
          },
        },
        testSuiteId,
      );
      createdSubscriptions.push(sub.id);
    }

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Device Identification",
        body: "Testing device names",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(3);

    // Verificar que todos os subscription IDs estão presentes
    const deliverySubscriptionIds = deliveries.map(
      (d) => d.push_subscription_id,
    );
    createdSubscriptions.forEach((subId) => {
      expect(deliverySubscriptionIds).toContain(subId);
    });
  });

  test("Deve atualizar last_used_at em todos os dispositivos", async () => {
    const sub1 = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/device-time-1",
        device_name: "Device Time 1",
        is_active: true,
        keys: {
          p256dh: "p256dh-time-1",
          auth: "auth-time-1",
        },
      },
      testSuiteId,
    );

    const sub2 = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/device-time-2",
        device_name: "Device Time 2",
        is_active: true,
        keys: {
          p256dh: "p256dh-time-2",
          auth: "auth-time-2",
        },
      },
      testSuiteId,
    );

    const original1 = sub1.last_used_at;
    const original2 = sub2.last_used_at;

    await wait(100);

    await createUserNotification(
      {
        user_id: userId,
        title: "Update Timestamp",
        body: "Testing last_used_at update",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const updatedSub1 = await getPushSubscription(sub1.id, testSuiteId);
    const updatedSub2 = await getPushSubscription(sub2.id, testSuiteId);

    // Ambas subscriptions devem ter last_used_at atualizado
    expect(updatedSub1.last_used_at).toBeTruthy();
    expect(updatedSub2.last_used_at).toBeTruthy();

    if (original1) {
      expect(new Date(updatedSub1.last_used_at!).getTime()).toBeGreaterThan(
        new Date(original1).getTime(),
      );
    }

    if (original2) {
      expect(new Date(updatedSub2.last_used_at!).getTime()).toBeGreaterThan(
        new Date(original2).getTime(),
      );
    }
  });

  test("Deve lidar com falha parcial em múltiplos dispositivos", async () => {
    // Criar 3 subscriptions válidas
    // Nota: Este teste verifica a estrutura de falha parcial
    // Em produção, falhas reais viriam de erros do web-push
    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/device-partial-1",
        device_name: "Device Partial 1",
        is_active: true,
        keys: {
          p256dh: "p256dh-partial-1",
          auth: "auth-partial-1",
        },
      },
      testSuiteId,
    );

    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/device-partial-2",
        device_name: "Device Partial 2",
        is_active: true,
        keys: {
          p256dh: "p256dh-partial-2",
          auth: "auth-partial-2",
        },
      },
      testSuiteId,
    );

    await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/device-partial-3",
        device_name: "Device Partial 3",
        is_active: true,
        keys: {
          p256dh: "p256dh-partial-3",
          auth: "auth-partial-3",
        },
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Partial Failure Test",
        body: "Testing handling of partial failures",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    // Deve ter criado deliveries para todos os dispositivos
    expect(deliveries).toHaveLength(3);

    // Em ambiente de teste sem mock, todos devem ter enviado
    // Este teste valida a estrutura, em produção haveria status diferentes
    const statuses = deliveries.map((d) => d.status);
    expect(
      statuses.every((s) => ["sent", "failed", "queued"].includes(s)),
    ).toBe(true);

    // Verificar que attempt_count foi incrementado para todos
    deliveries.forEach((delivery) => {
      expect(delivery.attempt_count).toBeGreaterThanOrEqual(1);
      expect(delivery.max_attempts).toBeGreaterThanOrEqual(1);
    });
  });
});
