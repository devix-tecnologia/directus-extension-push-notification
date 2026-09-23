import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { DirectusE2EHelper } from "./helpers/DirectusE2EHelper.js";

/**
 * Testes de contrato do endpoint público de ícone.
 *
 *     GET /push-notification/icon/:notification_id
 *
 * Até aqui o endpoint não tinha cobertura nenhuma: os testes de ícone eram
 * unitários e só conferiam a string devolvida por `resolveIconUrl`, sem nunca
 * chamar o endpoint. Estes testes verificam os quatro ramos que ele
 * implementa — arquivo do Directus, URL externa, sem ícone e notificação
 * inexistente — conferindo o status 302 e o `Location`.
 *
 * O último teste verifica a premissa do desenho, registrada no RDT-001 como
 * NÃO VERIFICADA: a de que o ícone funciona sem que nenhum arquivo do Directus
 * precise ser público. O browser busca o ícone da notificação sem as
 * credenciais da sessão, então a cadeia de redirects precisa terminar numa
 * imagem acessível anonimamente.
 *
 * @see docs/RDT/rdt-001-icone-externo-url-direta-no-payload.md
 */

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-not-a-leak";

const EXTERNAL_ICON_URL = "https://example.com/icone-externo.png";
const FALLBACK_ICON = "/admin/favicon.ico";
const ICON_TRANSFORM_PARAMS = "width=192&height=192&fit=cover&quality=80";

/**
 * PNG RGB 8×8 válido — evita depender de arquivo de fixture.
 *
 * Não use um PNG 1×1 aqui: o libvips do Directus rejeita alguns desses PNGs
 * mínimos com `pngload_buffer: libspng read error`, e o /assets responde 500
 * na transformação — falha do fixture que se disfarça de falha do produto.
 */
const ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR42mNgaPiPHQ0tCQAqM1/BgkfPGQAAAABJRU5ErkJggg==",
  "base64",
);

let sharedContext: BrowserContext;
let sharedPage: Page;
let directusHelper: DirectusE2EHelper;
let userId: string;

test.describe.configure({ mode: "serial" });

test.describe("Endpoint de ícone — contrato e acesso anônimo", () => {
  test.beforeAll(
    async ({
      browser,
      baseURL,
    }: {
      browser: Browser;
      baseURL: string | undefined;
    }) => {
      test.setTimeout(180000);

      sharedContext = await browser.newContext({ baseURL });
      sharedPage = await sharedContext.newPage();

      directusHelper = new DirectusE2EHelper(
        sharedPage,
        baseURL || "http://localhost:8055",
      );

      await directusHelper.login(ADMIN_EMAIL, ADMIN_PASSWORD);

      const me = await sharedPage.request.get("/users/me");
      expect(me.ok(), "GET /users/me falhou").toBe(true);
      userId = (await me.json()).data.id;
    },
  );

  test.afterAll(async () => {
    if (sharedContext) {
      await sharedContext.close();
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────

  /**
   * Cria uma user_notification. Usa channel `in_app` de propósito: o objetivo
   * é exercitar o endpoint de ícone, não disparar envio de push.
   */
  async function createNotification(
    fields: Record<string, unknown>,
  ): Promise<string> {
    const response = await sharedPage.request.post("/items/user_notification", {
      data: {
        user: userId,
        title: "Notificação de teste do ícone",
        body: "Corpo irrelevante para este teste",
        channel: "in_app",
        ...fields,
      },
    });

    expect(
      response.ok(),
      `Falha ao criar user_notification: ${response.status()} ${await response.text()}`,
    ).toBe(true);

    return (await response.json()).data.id;
  }

  /** Faz upload de um PNG e devolve o ID em directus_files. */
  async function uploadIconFile(): Promise<string> {
    const response = await sharedPage.request.post("/files", {
      multipart: {
        file: {
          name: "icone-teste.png",
          mimeType: "image/png",
          buffer: ICON_PNG,
        },
      },
    });

    expect(
      response.ok(),
      `Falha no upload do arquivo: ${response.status()} ${await response.text()}`,
    ).toBe(true);

    return (await response.json()).data.id;
  }

  /** GET sem seguir redirect, para inspecionar status e Location. */
  async function getWithoutRedirect(path: string) {
    return sharedPage.request.get(path, { maxRedirects: 0 });
  }

  // ─── Contrato do endpoint ───────────────────────────────────────

  test("com arquivo do Directus, redireciona para /assets com a transformação 192×192", async () => {
    const fileId = await uploadIconFile();
    const notificationId = await createNotification({ icon: fileId });

    const response = await getWithoutRedirect(
      `/push-notification/icon/${notificationId}`,
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(
      `/assets/${fileId}?${ICON_TRANSFORM_PARAMS}`,
    );
  });

  test("com URL externa, redireciona para a URL informada", async () => {
    const notificationId = await createNotification({
      icon_url: EXTERNAL_ICON_URL,
    });

    const response = await getWithoutRedirect(
      `/push-notification/icon/${notificationId}`,
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(EXTERNAL_ICON_URL);
  });

  test("com arquivo e URL externa, o arquivo tem prioridade", async () => {
    const fileId = await uploadIconFile();
    const notificationId = await createNotification({
      icon: fileId,
      icon_url: EXTERNAL_ICON_URL,
    });

    const response = await getWithoutRedirect(
      `/push-notification/icon/${notificationId}`,
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(
      `/assets/${fileId}?${ICON_TRANSFORM_PARAMS}`,
    );
  });

  test("sem ícone algum, redireciona para o favicon", async () => {
    const notificationId = await createNotification({});

    const response = await getWithoutRedirect(
      `/push-notification/icon/${notificationId}`,
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(FALLBACK_ICON);
  });

  test("com notificação inexistente, redireciona para o favicon", async () => {
    const response = await getWithoutRedirect(
      "/push-notification/icon/00000000-0000-4000-8000-000000000000",
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(FALLBACK_ICON);
  });

  // ─── Premissa do desenho: funciona sem arquivo público? ─────────

  // DEFEITO CONFIRMADO em 23/09/2026 — marcado como falha esperada para não
  // bloquear a suíte. `GET /assets/{id}` responde 403 sem credenciais, com ou
  // sem os parâmetros de transformação, então o ícone vindo de `directus_files`
  // NÃO aparece no dispositivo. O endpoint se documenta como proxy ("Proxying
  // icon asset") mas faz um redirect: quem busca o asset é o browser anônimo,
  // não o servidor. Ao corrigir, remova o `test.fail()` — o Playwright acusa
  // quando um teste marcado assim volta a passar.
  test("o ícone de arquivo é acessível sem credenciais, como o browser o busca", async ({
    playwright,
    baseURL,
  }) => {
    // Precisa ficar DENTRO do teste: no escopo do describe, `test.fail()`
    // marcaria todos os testes do arquivo como falha esperada.
    test.fail();

    const fileId = await uploadIconFile();
    const notificationId = await createNotification({ icon: fileId });

    // Contexto anônimo: sem cookie de sessão, sem Authorization — é assim que
    // a camada de notificação do browser busca o ícone.
    const anonymous = await playwright.request.newContext({
      baseURL: baseURL || "http://localhost:8055",
    });

    try {
      const redirect = await anonymous.get(
        `/push-notification/icon/${notificationId}`,
        { maxRedirects: 0 },
      );

      expect(
        redirect.status(),
        "o endpoint de ícone não deve exigir autenticação",
      ).toBe(302);

      const assetPath = redirect.headers()["location"];
      expect(assetPath).toBe(`/assets/${fileId}?${ICON_TRANSFORM_PARAMS}`);

      // O passo decisivo: o asset em si, ainda sem credenciais.
      const asset = await anonymous.get(assetPath!);

      expect(
        asset.status(),
        `GET anônimo em ${assetPath} respondeu ${asset.status()}. ` +
          "Se for 403, a premissa de que nenhum arquivo precisa ficar público " +
          "não se sustenta e o ícone vindo do Directus não aparece no dispositivo.",
      ).toBe(200);

      expect(asset.headers()["content-type"]).toContain("image/");
    } finally {
      await anonymous.dispose();
    }
  });
});
