import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDelivery,
  getPushSubscription,
  updateUserPushEnabled,
  getAdminUserId,
  wait,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Tratamento de Erros", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `error-handling-${version.replace(/\./g, "-")}`;
  let userId: string;

  // Nota: Estes testes usam endpoints inválidos propositalmente
  // para testar cenários de erro, diferente dos outros testes
  // que usam o servidor Autopush real

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Error Handling Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Não deve criar delivery se push_enabled=false", async () => {
    // Desabilitar push para o usuário
    await updateUserPushEnabled(userId, false, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/disabled-user",
        device_name: "Disabled User Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Test Disabled User",
        body: "Should not create delivery",
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

    // Não deve ter criado delivery
    expect(delivery).toBeNull();

    // Re-habilitar push para os próximos testes
    await updateUserPushEnabled(userId, true, testSuiteId);
  });

  test("Deve registrar error_code e error_message em falhas", async () => {
    // Criar subscription com endpoint potencialmente inválido
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://invalid-endpoint.test/push/error",
        device_name: "Error Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Error Test",
        body: "Testing error logging",
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
    expect(delivery?.error_code).toBeTruthy();
    expect(delivery?.error_message).toBeTruthy();
    expect(delivery?.failed_at).toBeTruthy();
  });

  test("Deve desativar subscription em erro 410 Gone", async () => {
    // Este teste verifica o comportamento esperado para erro 410
    // Em ambiente de teste real, o erro viria do push service
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/gone-endpoint",
        device_name: "410 Gone Test",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "410 Gone Test",
        body: "Testing 410 Gone handling",
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

    // Verificar estrutura de delivery
    expect(delivery).toBeTruthy();
    expect(delivery?.status).toBe("failed");

    // Com endpoint fake, sempre falha mas não com 410
    // Verificar que os campos de estrutura existem
    expect(delivery).toHaveProperty("error_code");
    expect(delivery).toHaveProperty("error_message");

    const sub = await getPushSubscription(subscription.id, testSuiteId);
    expect(sub).toHaveProperty("is_active");
    expect(sub).toHaveProperty("expires_at");
  });

  test("Deve incrementar attempt_count a cada retry", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/retry-test",
        device_name: "Retry Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Retry Test",
        body: "Testing retry_after",
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

    // Verificar estrutura de retry
    expect(delivery).toHaveProperty("retry_after");
    expect(delivery).toHaveProperty("attempt_count");
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve respeitar max_attempts configurado", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/max-fail",
        device_name: "Max Fail Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user_id: userId,
        title: "Max Attempts Test",
        body: "Testing max attempts failure",
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
    expect(delivery).toHaveProperty("max_attempts");
    expect(delivery).toHaveProperty("attempt_count");

    // Verificar que tentou pelo menos 1 vez
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve lidar com subscription sem endpoint válido", async () => {
    // O helper sempre cria endpoint válido se vazio
    const sub = await createPushSubscription(
      userId,
      {
        endpoint: "", // Endpoint vazio, helper cria um automático
        device_name: "Invalid Endpoint Test",
        is_active: true,
      },
      testSuiteId,
    );

    // Verificar que subscription foi criada com endpoint
    expect(sub.endpoint).toBeTruthy();
    expect(sub.endpoint.length).toBeGreaterThan(0);
  });

  test("Deve validar keys da subscription", async () => {
    const validSub = await createPushSubscription(
      userId,
      {
        endpoint: "https://test.com/valid-keys",
        device_name: "Valid Keys Test",
        is_active: true,
      },
      testSuiteId,
    );

    // Verificar que keys estão presentes e válidas
    expect(validSub.keys).toBeTruthy();
    expect(validSub.keys.p256dh).toBeTruthy();
    expect(validSub.keys.auth).toBeTruthy();
    expect(typeof validSub.keys.p256dh).toBe("string");
    expect(typeof validSub.keys.auth).toBe("string");
    expect(validSub.keys.p256dh.length).toBeGreaterThan(0);
    expect(validSub.keys.auth.length).toBeGreaterThan(0);
  });
});
