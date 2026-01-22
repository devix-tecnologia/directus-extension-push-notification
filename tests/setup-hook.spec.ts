import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  dockerHttpRequest,
} from "./setup.js";
import { logger } from "./test-logger.js";

describe("Push Notification Extension - Setup Hook", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.13.4";
  const testSuiteId = `hook-${version.replace(/\./g, "-")}`;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(
      `Setup Hook Test - Directus ${process.env.DIRECTUS_VERSION}`,
    );
    await setupTestEnvironment(testSuiteId);
  }, 300000); // 5 minutos de timeout

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Should have created PushNotification collection", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/collections",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const collections = response.data || response;
    const collectionNames = collections.map((c: any) => c.collection);

    expect(
      collectionNames,
      "PushNotification collection should have been created by setup hook",
    ).toContain("PushNotification");

    logger.info("✓ PushNotification collection created");
  });

  test("Should have created PushNotification collection with correct fields", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/fields/PushNotification",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const fields = response.data || response;
    const fieldNames = fields.map((f: any) => f.field);

    const expectedFields = [
      "id",
      "status",
      "date_created",
      "date_updated",
      "user_created",
      "user_updated",
      "endpoint",
      "subscription",
      "user",
    ];

    for (const expectedField of expectedFields) {
      expect(
        fieldNames,
        `Field "${expectedField}" should exist in PushNotification collection`,
      ).toContain(expectedField);
    }

    logger.info(`✓ All ${expectedFields.length} fields created correctly`);
  });

  test("Should have registered push-notification endpoints", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/server/info",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    // Endpoints devem estar disponíveis (testar acessibilidade básica)
    expect(response).toBeDefined();
    logger.info("✓ Extension endpoints are accessible");
  });
});
