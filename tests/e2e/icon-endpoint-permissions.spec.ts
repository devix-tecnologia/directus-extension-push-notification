import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * O endpoint de ícone serve o asset com a credencial do serviço
 * (`accountability: null`), que é o ponto do proxy — o browser busca o ícone sem
 * credenciais. O efeito colateral é que a autorização saiu do Directus e passou
 * a ser responsabilidade deste código.
 *
 * @see docs/RDT/rdt-001-icone-externo-url-direta-no-payload.md
 */

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-not-a-leak";
const DEFAULT_BASE_URL = "http://localhost:8055";

const RESTRICTED_EMAIL = "icone-restrito@example.com";
const RESTRICTED_PASSWORD = "restrito-pass-123";

const ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR42mNgaPiPHQ0tCQAqM1/BgkfPGQAAAABJRU5ErkJggg==",
  "base64",
);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

let adminApi: APIRequestContext;
let anonymousApi: APIRequestContext;
let adminAuth: Record<string, string>;
let restrictedAuth: Record<string, string>;
let restrictedUserId: string;
let fileId: string;

const createdIds: { policy?: string; role?: string; user?: string } = {};

test.describe.configure({ mode: "serial" });

test.describe("Endpoint de ícone — permissões", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    test.setTimeout(180000);

    const options = { baseURL: baseURL ?? DEFAULT_BASE_URL };
    adminApi = await playwright.request.newContext(options);
    anonymousApi = await playwright.request.newContext(options);

    const login = await adminApi.post("/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.ok(), "login do admin falhou").toBe(true);
    adminAuth = bearer((await login.json()).data.access_token);

    const policy = await adminApi.post("/policies", {
      headers: adminAuth,
      data: {
        name: "somente-notificacao",
        app_access: true,
        admin_access: false,
        enforce_tfa: false,
      },
    });
    createdIds.policy = (await policy.json()).data.id;

    for (const action of ["create", "read"]) {
      await adminApi.post("/permissions", {
        headers: adminAuth,
        data: {
          policy: createdIds.policy,
          collection: "user_notification",
          action,
          fields: ["*"],
          permissions: {},
          validation: {},
        },
      });
    }

    const role = await adminApi.post("/roles", {
      headers: adminAuth,
      data: { name: "somente-notificacao" },
    });
    createdIds.role = (await role.json()).data.id;

    await adminApi.post("/access", {
      headers: adminAuth,
      data: { role: createdIds.role, policy: createdIds.policy },
    });

    const user = await adminApi.post("/users", {
      headers: adminAuth,
      data: {
        email: RESTRICTED_EMAIL,
        password: RESTRICTED_PASSWORD,
        role: createdIds.role,
        status: "active",
      },
    });
    createdIds.user = (await user.json()).data.id;

    const upload = await adminApi.post("/files", {
      headers: adminAuth,
      multipart: {
        file: {
          name: "confidencial.png",
          mimeType: "image/png",
          buffer: ICON_PNG,
        },
      },
    });
    fileId = (await upload.json()).data.id;

    const restrictedLogin = await anonymousApi.post("/auth/login", {
      data: { email: RESTRICTED_EMAIL, password: RESTRICTED_PASSWORD },
    });
    expect(restrictedLogin.ok(), "login do usuário limitado falhou").toBe(true);
    restrictedAuth = bearer((await restrictedLogin.json()).data.access_token);

    const me = await anonymousApi.get("/users/me", { headers: restrictedAuth });
    restrictedUserId = (await me.json()).data.id;
  });

  test.afterAll(async () => {
    if (adminAuth) {
      if (fileId)
        await adminApi.delete(`/files/${fileId}`, { headers: adminAuth });

      if (createdIds.user) {
        await adminApi.delete(`/users/${createdIds.user}`, {
          headers: adminAuth,
        });
      }

      if (createdIds.role) {
        await adminApi.delete(`/roles/${createdIds.role}`, {
          headers: adminAuth,
        });
      }

      if (createdIds.policy) {
        await adminApi.delete(`/policies/${createdIds.policy}`, {
          headers: adminAuth,
        });
      }
    }

    await adminApi?.dispose();
    await anonymousApi?.dispose();
  });

  test("o usuário limitado não consegue ler o arquivo", async () => {
    const response = await anonymousApi.get(`/files/${fileId}`, {
      headers: restrictedAuth,
    });

    expect(response.status()).toBe(403);
  });

  test("o asset é negado a quem não está autenticado", async () => {
    const response = await anonymousApi.get(`/assets/${fileId}`);

    expect(response.status()).toBe(403);
  });

  test("o Directus aceita apontar o M2O para um arquivo sem permissão de leitura", async () => {
    const response = await anonymousApi.post("/items/user_notification", {
      headers: restrictedAuth,
      data: {
        user: restrictedUserId,
        title: "referência a arquivo alheio",
        body: "o M2O é gravado sem validar leitura no alvo",
        channel: "in_app",
        icon: fileId,
      },
    });

    expect(response.ok()).toBe(true);
    expect((await response.json()).data.icon).toBe(fileId);
  });

  test("um arquivo que o criador não pode ler não deve vazar pelo endpoint", async () => {
    // VULNERABILIDADE CONFIRMADA em 23/09/2026: como o M2O é aceito sem validar
    // leitura no alvo e o endpoint serve o asset com a credencial do serviço,
    // quem pode criar notificação lê qualquer arquivo. Ao corrigir, remova o
    // `test.fail()` — o Playwright acusa quando um teste assim volta a passar.
    test.fail();

    const notification = await anonymousApi.post("/items/user_notification", {
      headers: restrictedAuth,
      data: {
        user: restrictedUserId,
        title: "exfiltração",
        body: "aponta para arquivo que este usuário não pode ler",
        channel: "in_app",
        icon: fileId,
      },
    });

    const notificationId = (await notification.json()).data.id;
    const leak = await anonymousApi.get(
      `/push-notification/icon/${notificationId}`,
    );

    expect(
      leak.status(),
      "o endpoint entregou os bytes de um arquivo que o criador da notificação não podia ler",
    ).not.toBe(200);
  });
});
