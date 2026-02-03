/**
 * Endpoint para servir o Service Worker de Push Notifications
 *
 * O Service Worker precisa ser servido de uma URL acessível pelo navegador.
 * Este endpoint serve o arquivo sw.js em /extensions/push-notification/sw.js
 */
import { defineEndpoint } from "@directus/extensions-sdk";

const SERVICE_WORKER_CODE = `
// Service Worker para Push Notifications - Directus Extension
// Este arquivo é gerado automaticamente pela extensão push-notification

self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  console.log('[SW] Push event received');
  
  let data = {};
  
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    data = {
      title: 'Nova notificação',
      body: event.data ? event.data.text() : 'Você tem uma nova notificação'
    };
  }

  const options = {
    body: data.body || 'Nova notificação do Directus',
    icon: data.icon_url || '/admin/favicon.ico',
    badge: '/admin/favicon.ico',
    tag: data.user_notification_id || 'directus-notification-' + Date.now(),
    data: {
      url: data.action_url || '/admin',
      user_notification_id: data.user_notification_id,
      push_delivery_id: data.push_delivery_id
    },
    requireInteraction: data.priority === 'urgent' || data.priority === 'high',
    vibrate: [200, 100, 200]
  };

  const promiseChain = Promise.all([
    // Exibe a notificação
    self.registration.showNotification(data.title || 'Directus', options),
    
    // Confirma entrega (delivered) ao backend
    data.push_delivery_id ? confirmDelivery(data.push_delivery_id) : Promise.resolve()
  ]);

  event.waitUntil(promiseChain);
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const notificationData = event.notification.data || {};

  // Marca como lida no backend
  if (notificationData.push_delivery_id) {
    markAsRead(notificationData.push_delivery_id);
  }

  // Abre a URL ou foca na janela existente
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        const url = notificationData.url || '/admin';
        
        // Procura janela existente
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes('/admin') && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        
        // Se não encontrou, abre nova janela
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

self.addEventListener('notificationclose', function(event) {
  console.log('[SW] Notification closed without interaction');
  // Poderia registrar que a notificação foi descartada
});

// Confirma entrega da notificação
async function confirmDelivery(deliveryId) {
  try {
    const response = await fetch('/items/push_delivery/' + deliveryId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'delivered',
        delivered_at: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.warn('[SW] Erro ao confirmar entrega:', response.status);
    }
  } catch (e) {
    console.error('[SW] Erro ao confirmar entrega:', e);
  }
}

// Marca notificação como lida
async function markAsRead(deliveryId) {
  try {
    const response = await fetch('/items/push_delivery/' + deliveryId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'read',
        read_at: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.warn('[SW] Erro ao marcar como lida:', response.status);
    }
  } catch (e) {
    console.error('[SW] Erro ao marcar como lida:', e);
  }
}
`;

export default defineEndpoint((router) => {
  // Serve o Service Worker
  router.get("/sw.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    res.send(SERVICE_WORKER_CODE);
  });

  // Endpoint de health check
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "push-notification",
      timestamp: new Date().toISOString(),
    });
  });
});
