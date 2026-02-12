/**
 * Teste E2E Real de Push Notification
 *
 * Este teste verifica o fluxo completo de envio de push notification:
 * 1. Registrar subscription para o usuário
 * 2. Criar uma notificação na collection user_notification
 * 3. Verificar que o hook disparou e criou registro em push_delivery
 * 4. Verificar o status da entrega
 */

import { test, expect, type BrowserContext } from "@playwright/test";

const BASE_URL = process.env.TEST_URL || "http://localhost:8055";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-ci-only";

// Configuração do contexto
test.use({
  baseURL: BASE_URL,
});

interface AuthData {
  accessToken: string;
  userId: string;
}

interface Subscription {
  id: string;
  endpoint: string;
}

interface Delivery {
  id: string;
  status: string;
  user_notification_id: string;
  push_subscription_id: string;
}

// Helper para autenticar e obter token + userId
async function authenticate(context: BrowserContext): Promise<AuthData> {
  const response = await context.request.post("/auth/login", {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  const data = await response.json();
  const accessToken = data.data.access_token;

  // Obter userId de /users/me (mais confiável)
  const meResponse = await context.request.get("/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const meData = await meResponse.json();

  return {
    accessToken: accessToken,
    userId: meData.data.id,
  };
}

// Helper para habilitar/desabilitar push para o usuário
async function setPushEnabled(
  context: BrowserContext,
  accessToken: string,
  enabled: boolean,
): Promise<void> {
  const response = await context.request.patch(`/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      push_enabled: enabled,
    },
  });

  expect(response.ok()).toBeTruthy();
}

// Helper para criar uma subscription fake (simula o browser)
async function createFakeSubscription(
  context: BrowserContext,
  accessToken: string,
): Promise<Subscription> {
  // Endpoint único para teste (em produção o browser gera automaticamente)
  const fakeEndpoint = `https://push-test.local/subscription/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const response = await context.request.post("/push-notification/register", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      subscription: {
        endpoint: fakeEndpoint,
        keys: {
          p256dh:
            "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
          auth: "tBHItJI5svbpez7KI4CCXg",
        },
      },
      device_name: "Test Device - E2E",
    },
  });

  expect(response.ok() || response.status() === 208).toBeTruthy();

  // Buscar a subscription criada
  const subsResponse = await context.request.get(
    `/items/push_subscription?filter[endpoint][_eq]=${encodeURIComponent(fakeEndpoint)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const subsData = await subsResponse.json();
  expect(subsData.data.length).toBeGreaterThan(0);

  return {
    id: subsData.data[0].id,
    endpoint: fakeEndpoint,
  };
}

// Helper para desativar uma subscription
async function deactivateSubscription(
  context: BrowserContext,
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  await context.request.patch(`/items/push_subscription/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      is_active: false,
    },
  });
}

// Helper para criar uma notificação
async function createNotification(
  context: BrowserContext,
  accessToken: string,
  userId: string,
  title: string,
  body: string,
  channel: string = "push",
): Promise<string> {
  const response = await context.request.post("/items/user_notification", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      user_id: userId,
      channel: channel,
      title: title,
      body: body,
      data: JSON.stringify({ test: true, timestamp: Date.now() }),
    },
  });

  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  return data.data.id;
}

// Helper para aguardar e verificar delivery
async function waitForDelivery(
  context: BrowserContext,
  accessToken: string,
  notificationId: string,
  maxWaitMs: number = 10000,
): Promise<Delivery[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await context.request.get(
      `/items/push_delivery?filter[user_notification_id][_eq]=${notificationId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (response.ok()) {
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        return data.data;
      }
    }

    // Aguardar 500ms antes de tentar novamente
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return [];
}

test.describe.serial("Push Notification - Real Delivery Test", () => {
  test("deve criar notification e gerar delivery record", async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });

    try {
      // Setup
      const auth = await authenticate(context);
      await setPushEnabled(context, auth.accessToken, true);
      const subscription = await createFakeSubscription(
        context,
        auth.accessToken,
      );
      subscription.id = subscription.id.toString();

      console.log(`📱 Subscription criada: ${subscription.id}`);

      // Criar uma notificação
      const notificationTitle = `Test Notification ${Date.now()}`;
      const notificationBody = "Esta é uma notificação de teste E2E real";

      console.log("📤 Criando notificação...");
      const notificationId = await createNotification(
        context,
        auth.accessToken,
        auth.userId,
        notificationTitle,
        notificationBody,
      );
      const notificationIdStr = notificationId.toString();
      console.log(`✅ Notificação criada: ${notificationIdStr}`);

      // Aguardar o hook processar e criar o delivery
      console.log("⏳ Aguardando processamento do hook...");
      const deliveries = await waitForDelivery(
        context,
        auth.accessToken,
        notificationIdStr,
        15000,
      );

      // Verificar que pelo menos um delivery foi criado
      expect(deliveries.length).toBeGreaterThan(0);
      console.log(`✅ ${deliveries.length} delivery(ies) criado(s)`);

      // Verificar detalhes do delivery
      const delivery = deliveries[0]!;
      expect(delivery.user_notification_id).toBe(notificationIdStr);
      expect(delivery.push_subscription_id).toBe(subscription.id);

      // O status pode ser 'queued', 'sent', 'delivered' ou 'failed'
      // (failed é esperado porque usamos endpoint fake do FCM)
      expect([
        "queued",
        "sent",
        "delivered",
        "failed",
        "sending",
        "read",
        "expired",
      ]).toContain(delivery.status);
      console.log(`📊 Status do delivery: ${delivery.status}`);

      // Cleanup
      await deactivateSubscription(context, auth.accessToken, subscription.id);
    } finally {
      await context.close();
    }
  });

  test("deve processar múltiplas notificações em sequência", async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });

    try {
      // Setup
      const auth = await authenticate(context);
      await setPushEnabled(context, auth.accessToken, true);
      const subscription = await createFakeSubscription(
        context,
        auth.accessToken,
      );

      const notifications: string[] = [];

      // Criar 3 notificações em sequência
      for (let i = 1; i <= 3; i++) {
        const notificationId = await createNotification(
          context,
          auth.accessToken,
          auth.userId,
          `Sequential Test ${i}`,
          `Notificação sequencial número ${i}`,
        );
        notifications.push(notificationId);
        console.log(`📤 Notificação ${i} criada: ${notificationId}`);
      }

      // Aguardar processamento de todas
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verificar que todas geraram deliveries
      let totalDeliveries = 0;
      for (const notificationId of notifications) {
        const deliveries = await waitForDelivery(
          context,
          auth.accessToken,
          notificationId,
          5000,
        );
        totalDeliveries += deliveries.length;
      }

      expect(totalDeliveries).toBe(3);
      console.log(`✅ Todas as ${totalDeliveries} entregas foram processadas`);

      // Cleanup
      await deactivateSubscription(context, auth.accessToken, subscription.id);
    } finally {
      await context.close();
    }
  });

  test("não deve criar delivery se usuário tem push desabilitado", async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });

    try {
      // Setup - criar subscription mas desabilitar push
      const auth = await authenticate(context);
      await setPushEnabled(context, auth.accessToken, true);
      const subscription = await createFakeSubscription(
        context,
        auth.accessToken,
      );

      // Desabilitar push
      await setPushEnabled(context, auth.accessToken, false);

      // Criar notificação
      const notificationId = await createNotification(
        context,
        auth.accessToken,
        auth.userId,
        "Should Not Deliver",
        "Esta notificação não deve gerar delivery",
      );
      console.log(
        `📤 Notificação criada com push desabilitado: ${notificationId}`,
      );

      // Aguardar um pouco
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verificar que NÃO foi criado delivery
      const deliveries = await waitForDelivery(
        context,
        auth.accessToken,
        notificationId,
        3000,
      );
      expect(deliveries.length).toBe(0);
      console.log("✅ Nenhum delivery criado (comportamento correto)");

      // Cleanup - reabilitar push e desativar subscription
      await setPushEnabled(context, auth.accessToken, true);
      await deactivateSubscription(context, auth.accessToken, subscription.id);
    } finally {
      await context.close();
    }
  });

  test("não deve criar delivery para canal diferente de push", async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });

    try {
      // Setup
      const auth = await authenticate(context);
      await setPushEnabled(context, auth.accessToken, true);
      const subscription = await createFakeSubscription(
        context,
        auth.accessToken,
      );

      // Criar notificação com canal 'email' em vez de 'push'
      const notificationId = await createNotification(
        context,
        auth.accessToken,
        auth.userId,
        "Email Notification",
        "Esta é uma notificação de email, não push",
        "email", // Canal diferente
      );
      console.log(`📧 Notificação de email criada: ${notificationId}`);

      // Aguardar um pouco
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verificar que NÃO foi criado delivery
      const deliveries = await waitForDelivery(
        context,
        auth.accessToken,
        notificationId,
        3000,
      );
      expect(deliveries.length).toBe(0);
      console.log(
        "✅ Nenhum delivery criado para canal email (comportamento correto)",
      );

      // Cleanup
      await deactivateSubscription(context, auth.accessToken, subscription.id);
    } finally {
      await context.close();
    }
  });
});
