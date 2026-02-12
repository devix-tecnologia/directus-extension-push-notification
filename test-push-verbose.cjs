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

// Payload no formato CORRETO que o Service Worker espera
const payload = JSON.stringify({
  title: "🔔 Notificação de Teste",
  body: "Enviado em " + new Date().toLocaleTimeString("pt-BR"),
  icon_url: "https://directus.io/favicon.ico",
  action_url: "/admin/notifications",
  priority: "high",
  user_notification_id: "test-" + Date.now(),
  // push_delivery_id: 'não usado em teste manual'
});

console.log("🔍 Diagnóstico completo:");
console.log("");
console.log("📋 Variáveis de ambiente:");
console.log(
  `   VAPID_PUBLIC_KEY: ${process.env.VAPID_PUBLIC_KEY ? "✅ Configurada" : "❌ Não encontrada"}`,
);
console.log(
  `   VAPID_PRIVATE_KEY: ${process.env.VAPID_PRIVATE_KEY ? "✅ Configurada" : "❌ Não encontrada"}`,
);
console.log("");
console.log("🔑 Subscription:");
console.log(`   Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
console.log(`   Domain: ${new URL(subscription.endpoint).hostname}`);
console.log(`   Keys p256dh: ${subscription.keys.p256dh.substring(0, 30)}...`);
console.log(`   Keys auth: ${subscription.keys.auth}`);
console.log("");

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error("❌ VAPID keys não encontradas no .env");
  process.exit(1);
}

webpush.setVapidDetails(
  "https://geohub.devix.co",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

console.log("📤 Enviando notificação...");
console.log(`📦 Payload (${payload.length} bytes):`);
console.log(payload);
console.log("");

const startTime = Date.now();

webpush
  .sendNotification(subscription, payload)
  .then((response) => {
    const duration = Date.now() - startTime;
    console.log(`✅ Resposta recebida em ${duration}ms:`);
    console.log(`   Status: ${response.statusCode}`);
    console.log(`   Headers:`, response.headers);
    console.log("");

    if (response.statusCode === 201) {
      console.log("🎉 Notificação ENVIADA com sucesso!");
      console.log("");
      console.log("🔍 Se não apareceu no navegador, verifique:");
      console.log("   1. Abra DevTools (F12) → Console");
      console.log("   2. Veja se há erros do Service Worker");
      console.log("   3. Vá em Application → Service Workers");
      console.log('   4. Confirme que o SW está "activated and running"');
      console.log("   5. Verifique Application → Notifications (permissões)");
      console.log("");
      console.log("🧪 Teste rápido:");
      console.log("   Execute no console do navegador:");
      console.log(
        '   navigator.serviceWorker.ready.then(reg => reg.showNotification("Teste", {body: "Se isso aparecer, o SW está OK"}))',
      );
    } else if (response.statusCode === 200) {
      console.log("✅ Push aceito pelo servidor FCM");
      console.log("⚠️  Mas verifique se chegou no dispositivo");
    } else {
      console.log("⚠️  Status code inesperado:", response.statusCode);
    }

    if (response.body) {
      console.log("   Body:", response.body);
    }
  })
  .catch((error) => {
    const duration = Date.now() - startTime;
    console.error("");
    console.error(`❌ ERRO após ${duration}ms:`);
    console.error("");
    console.error(`   Status: ${error.statusCode}`);
    console.error(`   Mensagem: ${error.message}`);

    if (error.body) {
      console.error(`   Body: ${error.body}`);
    }

    if (error.statusCode === 410) {
      console.error("");
      console.error("⚠️  410 Gone = Subscription EXPIRADA");
      console.error("   O usuário precisa se inscrever novamente");
      console.error("   Isso acontece quando:");
      console.error("   - Service Worker foi desinstalado");
      console.error("   - Usuário limpou dados do site");
      console.error("   - Subscription expirou naturalmente");
    } else if (error.statusCode === 400) {
      console.error("");
      console.error(
        "⚠️  400 Bad Request = Problema na subscription ou payload",
      );
      console.error("   Verifique se as keys estão corretas");
    } else if (error.statusCode === 401 || error.statusCode === 403) {
      console.error("");
      console.error("⚠️  Erro de autenticação VAPID");
      console.error("   As chaves VAPID podem estar incorretas");
      console.error("   Ou não correspondem à subscription");
    }

    process.exit(1);
  });
