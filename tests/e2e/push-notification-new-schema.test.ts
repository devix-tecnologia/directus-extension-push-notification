import { test, expect } from "@playwright/test";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_EMAIL = process.env.DIRECTUS_EMAIL || "admin@example.com";
const DIRECTUS_PASSWORD = process.env.DIRECTUS_PASSWORD || "test-password-ci-only";

test.describe("Push Notification - New Schema", () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Login
    const response = await request.post(`${DIRECTUS_URL}/auth/login`, {
      data: {
        email: DIRECTUS_EMAIL,
        password: DIRECTUS_PASSWORD,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    authToken = data.data.access_token;
  });

  test("deve verificar que coleção push_subscription existe", async ({
    request,
  }) => {
    const response = await request.get(
      `${DIRECTUS_URL}/collections/push_subscription`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data.collection).toBe("push_subscription");
  });

  test("deve verificar que coleção user_notification existe", async ({
    request,
  }) => {
    const response = await request.get(
      `${DIRECTUS_URL}/collections/user_notification`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data.collection).toBe("user_notification");
  });

  test("deve verificar que coleção push_delivery existe", async ({
    request,
  }) => {
    const response = await request.get(
      `${DIRECTUS_URL}/collections/push_delivery`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data.collection).toBe("push_delivery");
  });

  test("deve verificar campo push_enabled em directus_users", async ({
    request,
  }) => {
    const response = await request.get(
      `${DIRECTUS_URL}/fields/directus_users/push_enabled`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data.field).toBe("push_enabled");
    expect(data.data.type).toBe("boolean");
  });

  test("deve verificar campos de push_subscription", async ({ request }) => {
    const fields = [
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

    for (const field of fields) {
      const response = await request.get(
        `${DIRECTUS_URL}/fields/push_subscription/${field}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.data.field).toBe(field);
    }
  });

  test("deve verificar campos de user_notification", async ({ request }) => {
    const fields = [
      "id",
      "title",
      "body",
      "user_id",
      "channel",
      "priority",
      "action_url",
      "icon_url",
      "data",
      "created_by",
      "created_at",
      "expires_at",
    ];

    for (const field of fields) {
      const response = await request.get(
        `${DIRECTUS_URL}/fields/user_notification/${field}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.data.field).toBe(field);
    }
  });

  test("deve verificar campos de push_delivery", async ({ request }) => {
    const fields = [
      "id",
      "user_notification_id",
      "push_subscription_id",
      "status",
      "attempt_count",
      "max_attempts",
      "queued_at",
      "sent_at",
      "delivered_at",
      "read_at",
      "failed_at",
      "error_code",
      "error_message",
      "retry_after",
      "metadata",
    ];

    for (const field of fields) {
      const response = await request.get(
        `${DIRECTUS_URL}/fields/push_delivery/${field}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.data.field).toBe(field);
    }
  });
});
