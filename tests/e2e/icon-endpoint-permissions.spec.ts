import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

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

/** Sufixo por execução: nomes fixos colidem com resíduos e entre workers. */
const RUN_ID = randomUUID().slice(0, 8);
const RESTRICTED_EMAIL = `icone-restrito-${RUN_ID}@example.com`;
const RESTRICTED_PASSWORD = "restrito-pass-123";
const RESTRICTED_NAME = `somente-notificacao-${RUN_ID}`;

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
        name: RESTRICTED_NAME,
        app_access: true,
        admin_access: false,
        enforce_tfa: false,
      },
    });
    expect(
      policy.ok(),
      `criação da policy falhou: ${await policy.text()}`,
    ).toBe(true);
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
      data: { name: RESTRICTED_NAME },
    });
    expect(role.ok(), `criação da role falhou: ${await role.text()}`).toBe(
      true,
    );
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
    expect(user.ok(), `criação do usuário falhou: ${await user.text()}`).toBe(
      true,
    );
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
    expect(upload.ok(), `upload falhou: ${await upload.text()}`).toBe(true);
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

  test("criar notificação apontando para arquivo sem permissão é rejeitado", async () => {
    const response = await anonymousApi.post("/items/user_notification", {
      headers: restrictedAuth,
      data: {
        user: restrictedUserId,
        title: "referência a arquivo alheio",
        body: "o Directus grava o M2O sem validar leitura no alvo; a extensão barra",
        channel: "in_app",
        icon: fileId,
      },
    });

    expect(response.ok()).toBe(false);
    expect(response.status()).toBe(403);
  });

  test("a notificação rejeitada não fica disponível para vazar pelo endpoint", async () => {
    const notifications = await adminApi.get(
      `/items/user_notification?filter[icon][_eq]=${fileId}&fields=id`,
      { headers: adminAuth },
    );

    expect((await notifications.json()).data).toEqual([]);
  });

  test("sem ícone, a criação segue livre", async () => {
    const response = await anonymousApi.post("/items/user_notification", {
      headers: restrictedAuth,
      data: {
        user: restrictedUserId,
        title: "sem ícone",
        body: "a checagem não deve atrapalhar o caso comum",
        channel: "in_app",
      },
    });

    expect(response.ok()).toBe(true);
  });
});
