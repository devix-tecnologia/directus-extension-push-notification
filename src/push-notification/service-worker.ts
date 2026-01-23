/// <reference lib="webworker" />

// Service Worker para receber e exibir push notifications
declare const self: ServiceWorkerGlobalScope;

interface PushNotificationData {
  title?: string;
  body?: string;
  icon_url?: string;
  action_url?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  user_notification_id?: string;
  push_delivery_id?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  const data: PushNotificationData = event.data ? event.data.json() : {};

  const options: NotificationOptions = {
    body: data.body || "Nova notificação do Directus",
    icon: data.icon_url || "/admin/favicon.ico",
    badge: "/admin/favicon.ico",
    tag: data.user_notification_id || "directus-notification",
    data: {
      url: data.action_url || "/admin/notifications",
      user_notification_id: data.user_notification_id,
      push_delivery_id: data.push_delivery_id,
    },
    requireInteraction: data.priority === "urgent" || data.priority === "high",
  };

  event.waitUntil(
    Promise.all([
      // Exibe a notificação
      self.registration.showNotification(data.title || "Directus", options),

      // Confirma entrega (delivered) ao backend na push_delivery
      data.push_delivery_id
        ? fetch(`/items/push_delivery/${data.push_delivery_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "delivered",
              delivered_at: new Date().toISOString(),
            }),
          }).catch((err: Error) =>
            console.error("Erro ao confirmar entrega:", err),
          )
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  // Marca como LIDA (read) na push_delivery
  if (event.notification.data?.push_delivery_id) {
    fetch(`/items/push_delivery/${event.notification.data.push_delivery_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "read",
        read_at: new Date().toISOString(),
      }),
    }).catch((err: Error) =>
      console.error("Erro ao marcar notificação como lida:", err),
    );
  }

  // Abre o painel de notificações do Directus
  event.waitUntil(
    self.clients.openWindow(
      event.notification.data?.url || "/admin/notifications",
    ),
  );
});
