import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  dockerHttpRequest,
} from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createUserNotification,
  getAdminUserId,
} from "./helpers/test-helpers.js";

/**
 * Prova contra um Postgres real o defeito das colunas m2o em char(36): o
 * Postgres recusa a foreign key para uuid, a relação não é registrada, o
 * Directus seleciona o alias o2m `deliveries` como coluna e a listagem de
 * user_notification responde 500. No SQLite dos demais testes isso não
 * aparece.
 */
describe("user_notification — listagem depois do setup", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `listing-pg-${version.replace(/\./g, "-")}`;
  const auth = () => ({
    Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
  });

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`user_notification listing - Directus ${version}`);
    await setupTestEnvironment(testSuiteId, { database: "pg" });
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("as relações m2o de user_notification estão registradas", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/relations/user_notification",
      undefined,
      auth(),
      testSuiteId,
    );
    const fields = (response.data as Array<{ field: string }>).map(
      (relation) => relation.field,
    );

    expect(fields).toEqual(
      expect.arrayContaining(["user", "user_created", "icon"]),
    );
  });

  test("GET /items/user_notification (todos os campos) responde a lista, não 500", async () => {
    const userId = await getAdminUserId(testSuiteId);
    await createUserNotification(
      { user: userId, title: "Listagem", body: "prova da relação" },
      testSuiteId,
    );

    const response = await dockerHttpRequest(
      "GET",
      // Sem `fields`, o Directus expande `*` e inclui o alias o2m `deliveries`:
      // era aqui que a PMDF respondia 500 "column deliveries does not exist".
      "/items/user_notification?limit=5",
      undefined,
      auth(),
      testSuiteId,
    );

    expect(response.errors).toBeUndefined();
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as unknown[]).length).toBeGreaterThan(0);
  });
});
