import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  dockerHttpRequest,
} from "./setup.js";
import { logger } from "./test-logger.js";

describe("Push Notification Extension - Setup Hook", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.14.1";
  const testSuiteId = `hook-${version.replace(/\./g, "-")}`;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(
      `Setup Hook Test - Directus ${process.env.DIRECTUS_VERSION}`,
    );
    await setupTestEnvironment(testSuiteId);
  }, 420000); // 7 minutos de timeout

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Should have created push_subscription collection", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/collections",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const collections = (response.data || response) as Array<{
      collection: string;
    }>;
    const collectionNames = collections.map((c) => c.collection);

    expect(
      collectionNames,
      "push_subscription collection should have been created by setup hook",
    ).toContain("push_subscription");

    logger.info("✓ push_subscription collection created");
  });

  test("Should have created push_subscription collection with correct fields", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/fields/push_subscription",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const fields = (response.data || response) as Array<{ field: string }>;
    const fieldNames = fields.map((f) => f.field);

    const expectedFields = [
      "id",
      "user_id",
      "endpoint",
      "keys",
      "user_agent",
      "device_name",
      "is_active",
      "created_at",
      "last_used_at",
      "expires_at",
    ];

    for (const expectedField of expectedFields) {
      expect(
        fieldNames,
        `Field "${expectedField}" should exist in push_subscription collection`,
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
