/**
 * Mock Web Push Server
 * Simula um servidor Web Push (FCM/Autopush) para testes
 * Aceita requisições HTTP POST e retorna 201 (Created)
 */

const http = require("http");
const crypto = require("crypto");

const PORT = 8080;
const subscriptions = new Map();

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, TTL, Urgency, Topic",
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === "/__heartbeat__" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
    return;
  }

  // Register new subscription (simula pushManager.subscribe())
  if (req.method === "POST" && req.url === "/subscribe") {
    const subscriptionId = crypto.randomUUID();
    const endpoint = `http://autopush:${PORT}/push/${subscriptionId}`;

    subscriptions.set(subscriptionId, {
      endpoint,
      createdAt: new Date().toISOString(),
    });

    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        endpoint,
        subscriptionId,
      }),
    );
    return;
  }

  // Receive push notification
  if (req.method === "POST" && req.url.startsWith("/push/")) {
    const subscriptionId = req.url.split("/push/")[1];

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      const headers = {
        ttl: req.headers["ttl"] || req.headers["TTL"],
        urgency: req.headers["urgency"] || req.headers["Urgency"],
        topic: req.headers["topic"] || req.headers["Topic"],
        authorization:
          req.headers["authorization"] || req.headers["Authorization"],
        "crypto-key": req.headers["crypto-key"],
        encryption: req.headers["encryption"],
        "content-encoding": req.headers["content-encoding"],
      };

      console.log(`[MOCK-PUSH] Received notification for ${subscriptionId}`);
      console.log(`[MOCK-PUSH] Headers:`, JSON.stringify(headers, null, 2));
      console.log(`[MOCK-PUSH] Body length: ${body.length} bytes`);

      // Simular diferentes respostas baseado no subscriptionId
      if (subscriptionId.includes("error-410")) {
        // Simular subscription expirada
        res.writeHead(410, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Gone",
            message: "Subscription has expired or is no longer valid",
          }),
        );
        return;
      }

      if (subscriptionId.includes("error-429")) {
        // Simular rate limit
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "30",
        });
        res.end(
          JSON.stringify({
            error: "Too Many Requests",
            message: "Rate limit exceeded",
          }),
        );
        return;
      }

      if (subscriptionId.includes("error-500")) {
        // Simular erro do servidor
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Internal Server Error",
            message: "Server error occurred",
          }),
        );
        return;
      }

      // Sucesso - retornar 201 Created (padrão Web Push)
      res.writeHead(201, {
        "Content-Type": "application/json",
        Location: `http://autopush:${PORT}/push/${subscriptionId}`,
      });
      res.end(
        JSON.stringify({
          success: true,
          subscriptionId,
          receivedAt: new Date().toISOString(),
        }),
      );
    });
    return;
  }

  // Not found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[MOCK-PUSH] Server listening on port ${PORT}`);
  console.log(
    `[MOCK-PUSH] Health check: http://localhost:${PORT}/__heartbeat__`,
  );
  console.log(
    `[MOCK-PUSH] Push endpoint: http://localhost:${PORT}/push/{subscriptionId}`,
  );
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[MOCK-PUSH] Received SIGTERM, shutting down gracefully");
  server.close(() => {
    console.log("[MOCK-PUSH] Server closed");
    process.exit(0);
  });
});
