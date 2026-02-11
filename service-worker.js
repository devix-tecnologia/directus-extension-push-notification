// Service Worker para Push Notifications - Directus Extension
// Baseado em src/push-notification/service-worker.ts

"use strict";

// Logger para Service Worker
class ServiceWorkerLogger {
  async notifyClients(level, message, error) {
    const clients = await self.clients.matchAll();
    const logData = {
      type: "SW_LOG",
      level,
      message,
      error: error ? { message: error.message, stack: error.stack } : undefined,
      timestamp: new Date().toISOString(),
    };

    clients.forEach((client) => {
      client.postMessage(logData);
    });
  }

  error(message, error) {
    this.notifyClients("error", message, error).catch(() => {});
  }

  info(message) {
    this.notifyClients("info", message).catch(() => {});
  }
}

// Serviço para atualizar status de entrega
class PushDeliveryStatusUpdater {
  constructor(logger) {
    this.logger = logger;
  }

  async updateDeliveryStatus(deliveryId, status) {
    try {
      const timestampField =
        status === "delivered" ? "delivered_at" : "read_at";

      await fetch(`/items/push_delivery/${deliveryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          [timestampField]: new Date().toISOString(),
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to update delivery status to ${status}`, error);
      throw error;
    }
  }
}

// Handler para eventos de push notification
class PushNotificationHandler {
  constructor(logger, deliveryUpdater) {
    this.logger = logger;
    this.deliveryUpdater = deliveryUpdater;
  }

  async handlePush(event) {
    const data = event.data ? event.data.json() : {};

    const options = {
      body: data.body || "Nova notificação do Directus",
      icon: data.icon_url || "/admin/favicon.ico",
      badge: "/admin/favicon.ico",
      tag: data.user_notification_id || "directus-notification",
      data: {
        url: data.action_url || "/admin/notifications",
        user_notification_id: data.user_notification_id,
        push_delivery_id: data.push_delivery_id,
      },
      requireInteraction:
        data.priority === "urgent" || data.priority === "high",
    };

    const tasks = [
      self.registration.showNotification(data.title || "Directus", options),
    ];

    // Confirma entrega ao backend
    if (data.push_delivery_id) {
      tasks.push(
        this.deliveryUpdater
          .updateDeliveryStatus(data.push_delivery_id, "delivered")
          .catch((error) => {
            this.logger.error("Failed to confirm delivery", error);
          }),
      );
    }

    await Promise.all(tasks);
  }

  async handleNotificationClick(event) {
    event.notification.close();

    // Marca como lida no backend
    if (event.notification.data?.push_delivery_id) {
      await this.deliveryUpdater
        .updateDeliveryStatus(event.notification.data.push_delivery_id, "read")
        .catch((error) => {
          this.logger.error("Failed to mark notification as read", error);
        });
    }

    // Abre o painel de notificações do Directus
    await self.clients.openWindow(
      event.notification.data?.url || "/admin/notifications",
    );
  }
}

// Inicialização
const logger = new ServiceWorkerLogger();
const deliveryUpdater = new PushDeliveryStatusUpdater(logger);
const notificationHandler = new PushNotificationHandler(
  logger,
  deliveryUpdater,
);

// Event listeners
self.addEventListener("push", (event) => {
  event.waitUntil(notificationHandler.handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.waitUntil(notificationHandler.handleNotificationClick(event));
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
