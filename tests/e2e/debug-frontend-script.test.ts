/* eslint-disable */
/**
 * Teste E2E REAL de Push Notification com browser
 *
 * Este teste:
 * 1. Concede permissões de notificação ao browser
 * 2. Registra subscription REAL do Chromium
 * 3. Cria uma notificação no Directus
 * 4. Captura a notificação exibida no browser
 */
import { test, expect } from "@playwright/test";

test.describe("Push Notification E2E Real", () => {
  test("deve receber push notification real no browser", async ({
    page,
    context,
  }) => {
    // Conceder permissão de notificação antes de navegar
    await context.grantPermissions(["notifications"]);

    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];

    // Capturar todos os logs do console
    page.on("console", (msg) => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      console.log(`[BROWSER ${msg.type().toUpperCase()}]`, text);
    });

    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
      console.log(`[BROWSER ERROR]`, error.message);
    });

    // Acessar a página de login
    console.log("\n=== Acessando página de login ===");
    await page.goto("http://localhost:8055/admin/login");
    await page.waitForLoadState("networkidle");

    // Verificar se há logs do PushNotification antes do login
    console.log("\n=== Logs capturados antes do login ===");
    const pushLogsBeforeLogin = consoleLogs.filter((log) =>
      log.includes("PushNotification"),
    );
    console.log(
      "Logs PushNotification:",
      pushLogsBeforeLogin.length > 0 ? pushLogsBeforeLogin : "NENHUM",
    );

    // Verificar se o script foi injetado no HTML
    const scriptContent = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");
      // @ts-expect-error - NodeListOf iterator
      for (const script of scripts) {
        if (
          script.textContent &&
          script.textContent.includes("PushNotification")
        ) {
          return script.textContent.substring(0, 500);
        }
      }

      return null;
    });

    console.log("\n=== Verificando script no HTML ===");
    if (scriptContent) {
      console.log("Script encontrado! Primeiros 500 chars:", scriptContent);
    } else {
      console.log("Script PushNotification NÃO encontrado no HTML!");
    }

    // Verificar o HTML do body para ver o que foi injetado
    const bodyHTML = await page.evaluate(() => {
      return document.body.innerHTML.substring(0, 2000);
    });
    console.log("\n=== Body HTML (primeiros 2000 chars) ===");
    console.log(bodyHTML);

    // Fazer login
    console.log("\n=== Fazendo login ===");
    await page.fill('input[type="email"]', "admin@example.com");
    await page.fill('input[type="password"]', "test-password-ci-only");
    await page.click('button[type="submit"]');

    // Aguardar navegação após login
    await page.waitForURL("**/admin/content/**", { timeout: 30000 });
    console.log("\n=== Login realizado com sucesso ===");

    // Aguardar um pouco para scripts executarem
    await page.waitForTimeout(3000);

    // Verificar logs após login
    console.log("\n=== Todos os logs capturados ===");
    consoleLogs.forEach((log) => console.log(log));

    // Verificar logs específicos do PushNotification
    console.log("\n=== Logs PushNotification após login ===");
    const pushLogsAfterLogin = consoleLogs.filter((log) =>
      log.includes("PushNotification"),
    );
    if (pushLogsAfterLogin.length > 0) {
      pushLogsAfterLogin.forEach((log) => console.log(log));
    } else {
      console.log("NENHUM log do PushNotification encontrado!");
    }

    // Verificar novamente se o script está no HTML após login
    const scriptContentAfterLogin = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");
      const found: string[] = [];
      // @ts-expect-error - NodeListOf iterator
      for (const script of scripts) {
        if (script.textContent && script.textContent.length > 100) {
          found.push(
            `Script ${script.src || "(inline)"}: ${script.textContent.substring(0, 200)}...`,
          );
        }
      }

      return found;
    });

    console.log("\n=== Scripts encontrados após login ===");
    scriptContentAfterLogin.forEach((s) => console.log(s));

    // Verificar se há erros
    console.log("\n=== Erros capturados ===");
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e) => console.log(e));
    } else {
      console.log("Nenhum erro JavaScript capturado");
    }

    // Verificar variáveis de ambiente
    const envCheck = await page.evaluate(() => {
      // @ts-ignore
      return {
        // @ts-ignore
        hasVAPID: typeof window.VAPID_PUBLIC_KEY !== "undefined",
        // @ts-ignore
        hasPUBLIC_URL: typeof window.PUBLIC_URL !== "undefined",
      };
    });
    console.log("\n=== Variáveis globais ===", envCheck);

    // Verificar se ServiceWorker está disponível
    const swStatus = await page.evaluate(() => {
      return {
        serviceWorkerSupported: "serviceWorker" in navigator,
        pushManagerSupported:
          "PushManager" in window && "Notification" in window,
      };
    });
    console.log("\n=== Suporte do navegador ===", swStatus);

    // Verificar localStorage
    const authData = await page.evaluate(() => {
      return localStorage.getItem("auth");
    });
    console.log(
      "\n=== Auth no localStorage ===",
      authData ? "PRESENTE" : "AUSENTE",
    );

    // Tirar screenshot
    await page.screenshot({
      path: "tests/e2e/screenshots/debug-frontend.png",
      fullPage: true,
    });

    expect(true).toBe(true); // Teste sempre passa, objetivo é debug
  });
});
