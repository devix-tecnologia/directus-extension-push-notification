/**
 * Debug test para verificar como o Directus armazena tokens
 */
/* eslint-disable */
import { test, expect } from "@playwright/test";

test("verifica armazenamento de auth do Directus", async ({ page }) => {
  // Capturar logs
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
  });

  // Acessar a página de login
  await page.goto("http://localhost:8055/admin/login");
  await page.waitForLoadState("networkidle");

  // Fazer login
  await page.fill('input[type="email"]', "admin@example.com");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');

  // Aguardar navegação após login
  await page.waitForURL("**/admin/content/**", { timeout: 30000 });

  // Aguardar para tokens serem salvos
  await page.waitForTimeout(2000);

  // Verificar todas as chaves do localStorage
  const storageInfo = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const data: Record<string, string> = {};
    for (const key of keys) {
      const value = localStorage.getItem(key);
      data[key] = value ? value.substring(0, 200) + "..." : "null";
    }

    return { keys, data };
  });

  console.log("\n=== Chaves no localStorage ===");
  console.log("Keys:", storageInfo.keys);
  console.log("\n=== Valores ===");
  for (const [key, value] of Object.entries(storageInfo.data)) {
    console.log(`${key}:`, value);
  }

  // Verificar sessionStorage também
  const sessionInfo = await page.evaluate(() => {
    const keys = Object.keys(sessionStorage);
    const data: Record<string, string> = {};
    for (const key of keys) {
      const value = sessionStorage.getItem(key);
      data[key] = value ? value.substring(0, 200) + "..." : "null";
    }

    return { keys, data };
  });

  console.log("\n=== Chaves no sessionStorage ===");
  console.log("Keys:", sessionInfo.keys);

  // Verificar cookies
  const cookies = await page.context().cookies();
  console.log("\n=== Cookies ===");
  cookies.forEach((c) =>
    console.log(`${c.name}: ${c.value.substring(0, 50)}...`),
  );

  expect(true).toBe(true);
});
