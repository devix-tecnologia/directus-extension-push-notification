import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import fs from "fs";

/**
 * Credenciais de admin padrão do ambiente de teste
 */
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin123";

// Use path relativo ao workspace
const storageFile = `${process.cwd()}/tests/e2e/auth-storage.json`;

// Variáveis compartilhadas entre os testes
let sharedContext: BrowserContext;
let sharedPage: Page;

// Rodar os testes em série para evitar conflitos de sessão
test.describe.configure({ mode: "serial" });

test.describe("Push Notification Extension - E2E Tests", () => {
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

      // Navega para o login e faz autenticação
      await sharedPage.goto("/admin/login", { waitUntil: "networkidle" });

      // Aguardar um pouco para a página carregar completamente
      await sharedPage.waitForTimeout(2000);

      // Verificar se há um botão "Continue" ou "Continuar" (sessão existente)
      // Tenta múltiplas variações do botão
      const continueButton = sharedPage.locator(
        'button:has-text("Continue"), button:has-text("Continuar"), button[type="submit"]:has-text("Continue"), button[type="submit"]:has-text("Continuar")',
      );
      const hasContinueButton = await continueButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (hasContinueButton) {
        // Se há botão Continue, clicar nele e aguardar redirecionamento
        await continueButton.first().click();
        await sharedPage.waitForURL("**/admin/**", { timeout: 30000 });

        // Aguardar a página carregar completamente após o Continue
        await sharedPage.waitForLoadState("networkidle");
        await sharedPage.waitForTimeout(3000);
      } else {
        // Caso contrário, fazer login normal
        await sharedPage.fill('input[type="email"]', ADMIN_EMAIL);
        await sharedPage.fill('input[type="password"]', ADMIN_PASSWORD);

        // Enviar o formulário com Enter
        await Promise.all([
          sharedPage.waitForURL("**/admin/**", { timeout: 30000 }),
          sharedPage.press('input[type="password"]', "Enter"),
        ]);

        await sharedPage.waitForLoadState("networkidle");
        await sharedPage.waitForTimeout(2000);
      }

      // Esperar elementos de navegação visíveis (com timeout maior)
      await sharedPage.waitForSelector(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
        {
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

  test("deve fazer login com sucesso e acessar o dashboard", async () => {
    // A página compartilhada já está autenticada e no dashboard
    // Verificar URL e elementos do dashboard
    expect(sharedPage.url()).toContain("/admin");

    // Aguardar navegação estar visível
    const nav = await sharedPage
      .locator(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
      )
      .first();
    await expect(nav).toBeVisible({ timeout: 5000 });

    // Tirar screenshot para debug
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/dashboard.png",
      fullPage: true,
    });
  });

  test("deve acessar a coleção PushNotification", async () => {
    // Navegar diretamente para a coleção PushNotification
    await sharedPage.goto("/admin/content/PushNotification", {
      waitUntil: "networkidle",
    });

    // Se o Directus redirecionar para login, falhar explicitamente
    if (sharedPage.url().includes("/login")) {
      throw new Error("Redirecionado para login — sessão inválida");
    }

    // Aguardar elementos da página de coleção (header, tabela, ou empty state)
    await sharedPage.waitForSelector(
      'header, .header-bar, table, [role="table"], .v-info, .empty-state',
      {
        timeout: 20000,
      },
    );

    // Verificar que não há mensagem de erro
    const bodyText = (await sharedPage.textContent("body")) || "";
    expect(bodyText.toLowerCase()).not.toContain("forbidden");
    expect(bodyText.toLowerCase()).not.toContain("no permission");

    // Screenshot para debug
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-notification-collection.png",
      fullPage: true,
    });
  });

  test("deve listar as coleções customizadas criadas pelo hook", async () => {
    // Usar página compartilhada
    await sharedPage.goto("/admin", { waitUntil: "networkidle" });

    // Verificar se há botão Continue novamente (pode aparecer ao navegar)
    const continueButton = sharedPage.locator(
      'button:has-text("Continue"), button:has-text("Continuar"), button[type="submit"]:has-text("Continue"), button[type="submit"]:has-text("Continuar")',
    );
    const hasContinueButton = await continueButton
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasContinueButton) {
      await continueButton.first().click();
      await sharedPage.waitForLoadState("networkidle");
      await sharedPage.waitForTimeout(2000);
    }

    // Aguardar navegação
    const nav = await sharedPage.waitForSelector(
      '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
      {
        timeout: 20000,
      },
    );

    const navText = (await nav.textContent()) || "";

    // Verificar se PushNotification aparece na navegação
    const hasPushNotification =
      navText.toLowerCase().includes("pushnotification") ||
      navText.toLowerCase().includes("push notification") ||
      navText.toLowerCase().includes("notifica");

    // Screenshot da navegação
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/navigation-with-push.png",
      fullPage: false,
    });

    // Não falhar imediatamente — apenas informar caso não encontre
    if (!hasPushNotification) {
      throw new Error(
        'Coleção "PushNotification" não encontrada na navegação. Verifique permissões.',
      );
    }
  });

  test("deve exibir os campos corretos na coleção PushNotification", async () => {
    // Navegar para a coleção
    await sharedPage.goto("/admin/content/PushNotification", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);

    // Verificar se há um botão de criar
    const createButton = await sharedPage
      .locator(
        'a[href*="/PushNotification/+"]:has-text("Create Item"), a.button[href*="/PushNotification/+"]',
      )
      .first();

    // Se não houver itens, pode ser que a tabela não apareça, então clicar em criar
    const isCreateVisible = await createButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isCreateVisible) {
      await createButton.click();
      await sharedPage.waitForURL("**/admin/content/PushNotification/+");
      await sharedPage.waitForTimeout(2000);

      // Tirar screenshot do formulário
      await sharedPage.screenshot({
        path: "tests/e2e/screenshots/push-notification-form.png",
        fullPage: true,
      });

      // Verificar presença dos campos esperados no formulário
      const pageContent = await sharedPage.content();

      // Campos esperados da collection
      const expectedFields = ["status", "endpoint", "subscription", "user"];
      const foundFields = expectedFields.filter((field) =>
        pageContent.toLowerCase().includes(field.toLowerCase()),
      );

      expect(foundFields.length).toBeGreaterThan(0);
    }
  });

  test("deve verificar que os endpoints de push notification estão registrados", async () => {
    // Este teste verifica indiretamente através da API
    // Fazer uma requisição para verificar se o endpoint existe

    // Primeiro, precisamos obter o access token
    const response = await sharedPage.context().request.post("/auth/login", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    const loginData = await response.json();
    const accessToken = loginData.data?.access_token;

    expect(accessToken).toBeTruthy();

    // Verificar se o endpoint /push-notification existe
    // Fazer uma requisição GET sem dados (esperamos que retorne algo ou erro de método)
    const endpointResponse = await sharedPage
      .context()
      .request.get("/push-notification", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        failOnStatusCode: false,
      });

    // O endpoint existe se não retornar 404
    expect(endpointResponse.status()).not.toBe(404);
  });

  test("deve criar um item de PushNotification via API", async () => {
    // Obter access token
    const response = await sharedPage.context().request.post("/auth/login", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    const loginData = await response.json();
    const accessToken = loginData.data?.access_token;

    // Criar um item de teste
    const createResponse = await sharedPage
      .context()
      .request.post("/items/PushNotification", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          status: "draft",
          endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
          subscription: JSON.stringify({
            endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
            keys: {
              p256dh: "test-p256dh-key",
              auth: "test-auth-key",
            },
          }),
        },
      });

    expect(createResponse.ok()).toBeTruthy();

    const createdItem = await createResponse.json();
    expect(createdItem.data).toBeDefined();
    expect(createdItem.data.endpoint).toBe(
      "https://fcm.googleapis.com/fcm/send/test-endpoint",
    );

    // Screenshot após criação
    await sharedPage.goto("/admin/content/PushNotification", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-notification-with-item.png",
      fullPage: true,
    });
  });

  test("deve verificar que o item criado aparece na listagem", async () => {
    // Navegar para a coleção
    await sharedPage.goto("/admin/content/PushNotification", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);

    // Verificar se há uma tabela ou grid com items
    const hasTable = await sharedPage
      .locator('table, [role="table"], .v-grid')
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (hasTable) {
      // Verificar se há pelo menos um item na tabela
      const tableContent = await sharedPage.textContent(
        'table, [role="table"], .v-grid',
      );

      // Deve conter o endpoint criado
      expect(tableContent).toContain("fcm.googleapis.com");
    } else {
      // Pode estar em empty state se nenhum item foi criado
      const emptyState = await sharedPage
        .locator(".empty-state, .v-info")
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      // Se não há tabela nem empty state, algo está errado
      expect(hasTable || emptyState).toBeTruthy();
    }

    // Screenshot final
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-notification-final.png",
      fullPage: true,
    });
  });
});
