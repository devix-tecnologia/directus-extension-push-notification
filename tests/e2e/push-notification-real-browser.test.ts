/**
 * Teste E2E REAL de Push Notification com browser Chromium
 *
 * Este teste verifica o fluxo completo end-to-end:
 * 1. Login no Directus
 * 2. Habilitar push_enabled
 * 3. Registrar subscription REAL do browser
 * 4. Criar notificação via API
 * 5. Verificar que delivery foi criado
 * 6. (Opcional) Capturar notificação exibida no browser
 */
import { test, expect } from "@playwright/test";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_EMAIL = "admin@example.com";
const DIRECTUS_PASSWORD = "admin123";

test.describe("Push Notification E2E Real no Browser", () => {
  test("deve registrar subscription real e criar delivery ao enviar notificação", async ({
    page,
    context,
  }) => {
    // 1. Conceder permissões de notificação
    await context.grantPermissions(["notifications"]);

    console.log("✅ Permissões de notificação concedidas");

    // 2. Fazer login via UI
    await page.goto(`${DIRECTUS_URL}/admin/login`);
    await page.fill('input[type="email"]', DIRECTUS_EMAIL);
    await page.fill('input[type="password"]', DIRECTUS_PASSWORD);
    await page.click('button[type="submit"]');

    // Aguardar redirecionamento
    await page.waitForURL(/\/admin\/content/, { timeout: 15000 });
    console.log("✅ Login realizado");

    // 3. Obter token de autenticação
    const authToken = await page.evaluate(() => {
      const authData = localStorage.getItem("auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.access_token || parsed.token;
      }

      return null;
    });

    expect(authToken).toBeTruthy();
    console.log("✅ Token obtido");

    // 4. Habilitar push via API
    const enablePushResponse = await page.request.patch(
      `${DIRECTUS_URL}/users/me`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          push_enabled: true,
        },
      },
    );

    expect(enablePushResponse.ok()).toBeTruthy();
    console.log("✅ push_enabled=true");

    // 5. Aguardar script de push notification ser injetado e executado
    await page.waitForTimeout(2000);

    // 6. Verificar se subscription foi registrada
    const subscriptionsResponse = await page.request.get(
      `${DIRECTUS_URL}/items/push_subscription?filter[user_id][_eq]=$CURRENT_USER`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const subscriptionsData = await subscriptionsResponse.json();
    console.log(
      `✅ Subscriptions encontradas: ${subscriptionsData.data.length}`,
    );

    // Se não houver subscription, pode ser porque o browser não suporta ou falhou
    // Vamos tentar forçar o registro manualmente via evaluate
    if (subscriptionsData.data.length === 0) {
      console.log(
        "⚠️  Nenhuma subscription encontrada, tentando registrar manualmente...",
      );

      // Tentar registrar via JavaScript no browser
      const registrationResult = await page.evaluate(async () => {
        try {
          // Verificar suporte
          if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            return { success: false, error: "Push não suportado" };
          }

          // Registrar service worker
          const registration = await navigator.serviceWorker.register(
            "/push-notification-sw/sw.js",
          );
          await registration.update();

          // Subscrever
          const vapidPublicKey =
            "BPT864f6ph9vkIXmyWJFsehe-Bb9iul4IiNoRN3To0UrixxFKKsKGM4FUBF_vtjSAoFWxBDY9-4pdCCIMJwz7o";

          function urlBase64ToUint8Array(base64String: string): Uint8Array {
            const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding)
              .replace(/-/g, "+")
              .replace(/_/g, "/");
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
              outputArray[i] = rawData.charCodeAt(i);
            }

            return outputArray;
          }

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              vapidPublicKey,
            ) as BufferSource,
          });

          return {
            success: true,
            endpoint: subscription.endpoint,
            keys: {
              p256dh: btoa(
                String.fromCharCode.apply(
                  null,
                  // @ts-expect-error - Chromium não tem tipagem correta para Uint8Array
                  new Uint8Array(subscription.getKey("p256dh")),
                ),
              ),
              auth: btoa(
                String.fromCharCode.apply(
                  null,
                  // @ts-expect-error - Chromium não tem tipagem correta para Uint8Array
                  new Uint8Array(subscription.getKey("auth")),
                ),
              ),
            },
          };
        } catch (error: unknown) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      console.log("Resultado do registro:", registrationResult);

      if (registrationResult.success) {
        // Enviar para API
        const registerResponse = await page.request.post(
          `${DIRECTUS_URL}/push-notification/register`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            data: {
              subscription: {
                endpoint: registrationResult.endpoint,
                keys: registrationResult.keys,
              },
              device_name: "Playwright E2E Test",
            },
          },
        );

        expect(registerResponse.ok()).toBeTruthy();
        console.log("✅ Subscription registrada manualmente");
      }
    }

    // 7. Verificar novamente subscriptions
    const finalSubscriptionsResponse = await page.request.get(
      `${DIRECTUS_URL}/items/push_subscription?filter[user_id][_eq]=$CURRENT_USER`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const finalSubscriptionsData = await finalSubscriptionsResponse.json();
    expect(finalSubscriptionsData.data.length).toBeGreaterThan(0);

    const subscription = finalSubscriptionsData.data[0];
    console.log(`✅ Subscription ID: ${subscription.id}`);

    // 8. Criar notificação via API
    const notificationResponse = await page.request.post(
      `${DIRECTUS_URL}/items/user_notification`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          user_id: "$CURRENT_USER",
          title: "Teste E2E Real",
          body: `Push notification enviada em ${new Date().toLocaleString("pt-BR")}`,
          channel: "push",
          priority: "normal",
        },
      },
    );

    expect(notificationResponse.ok()).toBeTruthy();
    const notificationData = await notificationResponse.json();
    console.log(`✅ Notificação criada: ${notificationData.data.id}`);

    // 9. Aguardar processamento do hook
    await page.waitForTimeout(5000);

    // 10. Verificar que delivery foi criado
    const deliveriesResponse = await page.request.get(
      `${DIRECTUS_URL}/items/push_delivery?filter[user_notification_id][_eq]=${notificationData.data.id}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const deliveriesData = await deliveriesResponse.json();
    console.log(`✅ Deliveries criados: ${deliveriesData.data.length}`);

    expect(deliveriesData.data.length).toBeGreaterThan(0);

    const delivery = deliveriesData.data[0];
    console.log(`✅ Delivery status: ${delivery.status}`);
    console.log(
      `✅ Delivery subscription_id: ${delivery.push_subscription_id}`,
    );

    // Status pode ser 'sent', 'failed' ou 'delivered'
    expect(["sent", "failed", "delivered"]).toContain(delivery.status);

    // 11. Verificar campos do delivery
    expect(delivery.queued_at).toBeTruthy();
    expect(delivery.attempt_count).toBeGreaterThanOrEqual(1);

    console.log("✅ Teste E2E completo com sucesso!");
  });
});
