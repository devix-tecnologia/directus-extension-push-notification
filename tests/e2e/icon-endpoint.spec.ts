import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { DirectusE2EHelper } from "./helpers/DirectusE2EHelper.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-not-a-leak";

const EXTERNAL_ICON_URL = "https://example.com/icone-externo.png";
const FALLBACK_ICON = "/admin/favicon.ico";
const ICON_TRANSFORM = "width=192&height=192&fit=cover&quality=80";
const UNKNOWN_NOTIFICATION_ID = "00000000-0000-4000-8000-000000000000";
const DEFAULT_BASE_URL = "http://localhost:8055";

const iconEndpoint = (notificationId: string) =>
  `/push-notification/icon/${notificationId}`;

const transformedAsset = (fileId: string) =>
  `/assets/${fileId}?${ICON_TRANSFORM}`;

/**
 * Um PNG 1×1 faz o libvips do Directus responder 500 na transformação
 * (`pngload_buffer: libspng read error`) — falha de fixture disfarçada de falha
 * do produto. Este é um RGB 8×8 válido.
 */
const ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR42mNgaPiPHQ0tCQAqM1/BgkfPGQAAAABJRU5ErkJggg==",
  "base64",
);

interface NotificationIcon {
  icon?: string;
  icon_url?: string;
}

let browserContext: BrowserContext;
let page: Page;
let adminUserId: string;

test.describe.configure({ mode: "serial" });

test.describe("Endpoint de ícone", () => {
  test.beforeAll(
    async ({ browser, baseURL }: { browser: Browser; baseURL?: string }) => {
      test.setTimeout(180000);

      browserContext = await browser.newContext({ baseURL });
      page = await browserContext.newPage();

      await new DirectusE2EHelper(page, baseURL ?? DEFAULT_BASE_URL).login(
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
      );

      const me = await page.request.get("/users/me");
      expect(me.ok(), "GET /users/me falhou").toBe(true);
      adminUserId = (await me.json()).data.id;
    },
  );

  test.afterAll(async () => {
    await browserContext?.close();
  });

  async function uploadIcon(): Promise<string> {
    const response = await page.request.post("/files", {
      multipart: {
        file: { name: "icone.png", mimeType: "image/png", buffer: ICON_PNG },
      },
    });

    expect(
      response.ok(),
      `upload falhou: ${response.status()} ${await response.text()}`,
    ).toBe(true);

    return (await response.json()).data.id;
  }

  /** `in_app` de propósito: exercita o endpoint sem disparar envio de push. */
  async function createNotification(icon: NotificationIcon): Promise<string> {
    const response = await page.request.post("/items/user_notification", {
      data: {
        user: adminUserId,
        title: "Notificação de teste do ícone",
        body: "Corpo irrelevante para este teste",
        channel: "in_app",
        ...icon,
      },
    });

    expect(
      response.ok(),
      `criação falhou: ${response.status()} ${await response.text()}`,
    ).toBe(true);

    return (await response.json()).data.id;
  }

  async function expectRedirect(
    notificationId: string,
    destination: string,
    client: APIRequestContext = page.request,
  ) {
    const response = await client.get(iconEndpoint(notificationId), {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(destination);
  }

  test("com arquivo do Directus, redireciona para o asset transformado", async () => {
    const fileId = await uploadIcon();

    await expectRedirect(
      await createNotification({ icon: fileId }),
      transformedAsset(fileId),
    );
  });

  test("com URL externa, redireciona para a URL informada", async () => {
    await expectRedirect(
      await createNotification({ icon_url: EXTERNAL_ICON_URL }),
      EXTERNAL_ICON_URL,
    );
  });

  test("com arquivo e URL externa, o arquivo tem prioridade", async () => {
    const fileId = await uploadIcon();

    await expectRedirect(
      await createNotification({
        icon: fileId,
        icon_url: EXTERNAL_ICON_URL,
      }),
      transformedAsset(fileId),
    );
  });

  test("sem ícone algum, redireciona para o favicon", async () => {
    await expectRedirect(await createNotification({}), FALLBACK_ICON);
  });

  test("com notificação inexistente, redireciona para o favicon", async () => {
    await expectRedirect(UNKNOWN_NOTIFICATION_ID, FALLBACK_ICON);
  });

  test("o ícone de arquivo é acessível sem credenciais, como o browser o busca", async ({
    playwright,
    baseURL,
  }) => {
    // DEFEITO CONFIRMADO em 23/09/2026: `/assets/{id}` responde 403 sem
    // credenciais, com e sem transformação, então o ícone vindo de
    // `directus_files` não aparece no dispositivo. O endpoint se documenta como
    // proxy mas faz redirect — num proxy quem busca o asset é o servidor, que
    // tem credencial. Ao corrigir, remova esta linha: o Playwright acusa quando
    // um teste marcado assim volta a passar.
    test.fail();

    const fileId = await uploadIcon();
    const notificationId = await createNotification({ icon: fileId });

    const anonymous = await playwright.request.newContext({
      baseURL: baseURL ?? DEFAULT_BASE_URL,
    });

    try {
      await expectRedirect(notificationId, transformedAsset(fileId), anonymous);

      const asset = await anonymous.get(transformedAsset(fileId));

      expect(
        asset.status(),
        "403 aqui significa que a premissa de não tornar arquivo algum público não se sustenta",
      ).toBe(200);
      expect(asset.headers()["content-type"]).toContain("image/");
    } finally {
      await anonymous.dispose();
    }
  });
});
