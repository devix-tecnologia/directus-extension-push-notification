import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { DirectusE2EHelper } from "./helpers/DirectusE2EHelper.js";
import fs from "fs";

/**
 * Credenciais de admin padrão do ambiente de teste
 */
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin123";

// Use path relativo ao workspace (funciona em CJS e ESM)
const storageFile = `${process.cwd()}/tests/e2e/auth-storage.json`;

// Variáveis compartilhadas entre os testes
let sharedContext: BrowserContext;
let sharedPage: Page;
let directusHelper: DirectusE2EHelper;

// Rodar os testes em série para evitar conflitos de sessão
test.describe.configure({ mode: "serial" });

test.describe("Directus Admin Panel - Push Notification Collections", () => {
  test.beforeAll(
    async ({
      browser,
      baseURL,
    }: {
      browser: Browser;
      baseURL: string | undefined;
    }) => {
      // Aumentar timeout do beforeAll para dar tempo de login + navegação completa (3 minutos)
      test.setTimeout(180000);

      // Criar contexto e página compartilhados com baseURL explícito
      sharedContext = await browser.newContext({ baseURL });
      sharedPage = await sharedContext.newPage();

      // Criar helper
      directusHelper = new DirectusE2EHelper(
        sharedPage,
        baseURL || "http://localhost:8055",
      );

      // Fazer login
      await directusHelper.login(ADMIN_EMAIL, ADMIN_PASSWORD);

      // Esperar elementos de navegação visíveis (com timeout maior)
      await sharedPage.waitForSelector(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
        {
          // Aumentado timeout para acomodar ambientes lentos/CI
          timeout: 120000,
        },
      );
    },
  );

  test.afterAll(async () => {
    // Fechar contexto compartilhado
    if (sharedContext) {
      await sharedContext.close();
    }

    // Remover storage file (se existir)
    if (fs.existsSync(storageFile)) {
      try {
        fs.unlinkSync(storageFile);
      } catch {
        // ignore
      }
    }
  });

  test("deve fazer login com sucesso e estabilizar o dashboard", async () => {
    // A página compartilhada já está autenticada e no dashboard
    // Apenas verificar que os elementos estão presentes

    // Verificar URL e elementos do dashboard
    expect(sharedPage.url()).toContain("/admin");

    // Aguardar navegação estar visível (já deve estar do beforeAll)
    const nav = await sharedPage
      .locator(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
      )
      .first();
    await expect(nav).toBeVisible({ timeout: 5000 });

    // Tirar screenshot para debug
    await directusHelper.screenshot("dashboard");
  });

  test('deve verificar que a coleção "user_notification" existe e está acessível', async () => {
    const exists = await directusHelper.collectionExists("user_notification");
    expect(exists).toBe(true);

    // Tirar screenshot
    await directusHelper.screenshot("user-notification-collection");
  });

  test('deve verificar que a coleção "push_subscription" existe e está acessível', async () => {
    const exists = await directusHelper.collectionExists("push_subscription");
    expect(exists).toBe(true);

    // Tirar screenshot
    await directusHelper.screenshot("push-subscription-collection");
  });

  test('deve verificar que a coleção "push_delivery" existe e está acessível', async () => {
    const exists = await directusHelper.collectionExists("push_delivery");
    expect(exists).toBe(true);

    // Tirar screenshot
    await directusHelper.screenshot("push-delivery-collection");
  });

  test("deve listar as coleções customizadas criadas pelo hook", async () => {
    // Navegar para qualquer coleção para verificar que elas estão disponíveis
    await directusHelper.navigateToCollection("user_notification");

    // Verificar se não há erros na página
    const bodyText = (await sharedPage.textContent("body")) || "";
    expect(bodyText.toLowerCase()).not.toContain("forbidden");
    expect(bodyText.toLowerCase()).not.toContain("no permission");
    expect(bodyText.toLowerCase()).not.toContain("not found");

    // Screenshot final
    await directusHelper.screenshot("collections-list");
  });
});
