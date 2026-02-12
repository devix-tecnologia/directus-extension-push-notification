const webpush = require("web-push");
require("dotenv").config();

const subscription = {
  endpoint:
    "https://fcm.googleapis.com/fcm/send/d4XJYfCsWT4:APA91bH5Z7L2hzEkJ-oTVsxhCYi7hfMEahONMvQF3GWLJe7tFDRXRSscNDl1AjIcl0Y0QSnJuN45Q3quAucej_gIQ-eModQw1oAutItExZQWR-xSyZKAiR6Gj8-k6FB-7PgGRPPw60sJ",
  keys: {
    p256dh:
      "BNG6xLthGAFJ2D3m4aWHckKdPLXHCFjBnEz_nAZCIa5_BeZsbcsDy1mfLubi3Y9j3i7Gj0FUu-_6zZ5XtAPZDuA",
    auth: "L46-jYj4kB6F5sb54s8cgw",
  },
};

const payload = JSON.stringify({
  title: "🧪 Teste Push Notification",
  body: "Esta é uma mensagem de teste enviada manualmente",
  icon_url: "https://directus.io/favicon.ico",
  priority: "high",
});

// Configurar VAPID
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error("❌ VAPID keys não encontradas no .env");
  console.error("Execute: npx web-push generate-vapid-keys");
  process.exit(1);
}

webpush.setVapidDetails(
  "https://geohub.devix.co",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

console.log("📤 Enviando notificação push...");
console.log(`📍 Endpoint: ${subscription.endpoint.substring(0, 60)}...`);
console.log(`📦 Payload: ${payload}`);

webpush
  .sendNotification(subscription, payload)
  .then(() => {
    console.log("✅ Notificação enviada com sucesso!");
    console.log("🔔 Verifique seu navegador/dispositivo");
  })
  .catch((error) => {
    console.error("❌ Erro ao enviar notificação:");
    console.error(`   Status: ${error.statusCode}`);
    console.error(`   Mensagem: ${error.message}`);
    if (error.body) {
      console.error(`   Detalhes: ${error.body}`);
    }
    process.exit(1);
  });
