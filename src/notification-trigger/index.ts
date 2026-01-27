/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { defineHook } from "@directus/extensions-sdk";
import webpush from "web-push";

export default defineHook(({ action }, { services }) => {
  const { ItemsService } = services;

  action(
    "user_notification.items.create",
    async ({ payload }, { schema, database }) => {
      console.log("🔔 [HOOK] user_notification.items.create triggered", {
        payload,
      });
      const notification = payload;

      // Apenas processar se channel === 'push'
      if (notification.channel !== "push") {
        console.log(
          `user_notification ${notification.id} não é push, ignorando`,
        );
        return;
      }

      console.log("✅ [HOOK] Channel is push, continuing...");

      // Configurar VAPID keys (precisa ser feito aqui pois env não está disponível no escopo externo)
      const env = process.env;
      webpush.setVapidDetails(
        env.PUBLIC_URL || "mailto:admin@example.com",
        env.VAPID_PUBLIC_KEY!,
        env.VAPID_PRIVATE_KEY!,
      );

      // Buscar usuário destinatário com configurações de push
      const usersService = new ItemsService("directus_users", {
        schema: schema!,
        knex: database,
      });
      const subscriptionsService = new ItemsService("push_subscription", {
        schema: schema!,
        knex: database,
      });
      const deliveryService = new ItemsService("push_delivery", {
        schema: schema!,
        knex: database,
      });

      try {
        const user = await usersService.readOne(notification.user_id, {
          fields: ["id", "push_enabled"],
        });
        console.log("👤 [HOOK] User loaded:", {
          id: user.id,
          push_enabled: user.push_enabled,
          type: typeof user.push_enabled,
        });

        if (!user.push_enabled) {
          console.log(`Usuário ${user.id} não tem push habilitado`);
          return;
        }

        console.log("✅ [HOOK] User has push enabled, continuing...");

        // Buscar TODAS as subscriptions ATIVAS do usuário (múltiplos dispositivos)
        const subscriptions = await subscriptionsService.readByQuery({
          filter: {
            user_id: { _eq: notification.user_id },
            is_active: { _eq: true },
          },
          limit: -1,
        });
        console.log(
          `📱 [HOOK] Found ${subscriptions.length} active subscriptions`,
        );

        if (subscriptions.length === 0) {
          console.log(`Usuário ${user.id} não possui subscriptions ativas`);
          return;
        }

        console.log(
          "✅ [HOOK] Has active subscriptions, creating deliveries...",
        );

        // Criar registros na push_delivery para cada dispositivo (status: queued)
        const deliveryRecords: Array<any> = [];

        for (const sub of subscriptions) {
          console.log(
            `📦 [HOOK] Creating delivery for subscription ${sub.id}...`,
          );
          const deliveryRecord = await deliveryService.createOne({
            user_notification_id: notification.id,
            push_subscription_id: sub.id,
            status: "queued",
            queued_at: new Date().toISOString(),
            attempt_count: 0,
            max_attempts: 3,
          });
          console.log(`✅ [HOOK] Delivery created: ${deliveryRecord}`);
          deliveryRecords.push({
            id: deliveryRecord,
            attempt_count: 0,
            subscription: sub,
          });
        }

        // Enviar push para TODOS os dispositivos
        let sentCount = 0;
        let failedCount = 0;

        for (const delivery of deliveryRecords) {
          const sub = delivery.subscription;

          try {
            // Atualizar para 'sending'
            await deliveryService.updateOne(delivery.id, {
              status: "sending",
              attempt_count: delivery.attempt_count + 1,
            });

            // Reconstruir objeto subscription
            const subscription = {
              endpoint: sub.endpoint,
              keys: sub.keys,
            };

            // Payload inclui ID da push_delivery para callback do Service Worker
            const pushPayload = JSON.stringify({
              title: notification.title,
              body: notification.body,
              icon_url: notification.icon_url,
              action_url: notification.action_url,
              priority: notification.priority,
              user_notification_id: notification.id,
              push_delivery_id: delivery.id, // ⭐ Service Worker usa isso
            });

            await webpush.sendNotification(subscription, pushPayload);
            sentCount++;

            // Atualizar status para 'sent'
            await deliveryService.updateOne(delivery.id, {
              status: "sent",
              sent_at: new Date().toISOString(),
            });

            // Atualizar last_used_at da subscription
            await subscriptionsService.updateOne(sub.id, {
              last_used_at: new Date().toISOString(),
            });

            console.log(
              `✓ Push enviado para dispositivo ${sub.id} (${sub.device_name || sub.user_agent})`,
            );
          } catch (error: any) {
            failedCount++;
            console.error(
              `Erro ao enviar push para dispositivo ${sub.id}:`,
              error,
            );

            const shouldRetry =
              delivery.attempt_count < delivery.max_attempts &&
              error.statusCode !== 410;

            // Atualizar status para 'failed'
            await deliveryService.updateOne(delivery.id, {
              status: shouldRetry ? "queued" : "failed",
              failed_at: shouldRetry ? null : new Date().toISOString(),
              error_code: String(error.statusCode || "UNKNOWN"),
              error_message: error.message,
              retry_after: shouldRetry
                ? new Date(Date.now() + 60000).toISOString()
                : null, // 1min
              metadata: {
                device: sub.device_name || sub.user_agent,
                endpoint_domain: new URL(sub.endpoint).hostname,
              },
            });

            // Se subscription expirou (410 Gone), marcar como inativa
            if (error.statusCode === 410) {
              console.log(
                `Subscription ${sub.id} expirada, marcando como inativa`,
              );
              await subscriptionsService.updateOne(sub.id, {
                is_active: false,
                expires_at: new Date().toISOString(),
              });
            }
          }
        }

        console.log(
          `✓ Push notification: ${sentCount}/${subscriptions.length} dispositivos alcançados`,
        );
      } catch (error: any) {
        console.error("Erro ao enviar push:", error);
      }
    },
  );
});
