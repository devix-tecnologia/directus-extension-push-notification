/* eslint-disable */
/**
 * Script para abrir navegador normal (não incognito) para testar push notification
 */
import { chromium } from "@playwright/test";

async function main() {
  // Abrir navegador em modo normal (não incognito)
  const browser = await chromium.launchPersistentContext(
    "./test-user-data-dir",
    {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
    },
  );

  const page = await browser.newPage();

  // Capturar logs
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
  });

  // Acessar Directus
  await page.goto("http://localhost:8055/admin/login");
  await page.waitForLoadState("networkidle");

  // Fazer login
  await page.fill('input[type="email"]', "admin@example.com");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');

  // Aguardar navegação
  await page.waitForURL("**/admin/content/**", { timeout: 30000 });

  console.log("\n========================================");

  console.log("Login realizado! Aguardando você conceder permissão...");

  console.log("Quando o popup de permissão aparecer, clique em PERMITIR");

  console.log("========================================\n");

  // Aguardar até o usuário pressionar Enter no terminal para fechar o navegador
  // Isso evita que o teste feche automaticamente antes de você interagir

  console.log(
    "\nPressione ENTER neste terminal quando terminar para fechar o navegador...",
  );

  await new Promise<void>((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });

  await browser.close();
}

main().catch(console.error);
