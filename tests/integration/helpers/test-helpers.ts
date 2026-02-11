import { dockerHttpRequest } from "../../setup.js";

/**
 * Chaves ECDH P-256 válidas geradas com crypto.createECDH('prime256v1')
 * p256dh: 87 chars base64url (65 bytes), auth: 22 chars base64url (16 bytes)
 */
/**
 * Endpoint base do mock push server no Directus
 */
export const MOCK_PUSH_SERVER = "http://directus:8055/mock-push-server";

export const VALID_TEST_KEYS = {
  p256dh:
    "BCXZvHuwJej4huSYgvSx1F2S3DNCAeGHkByzT9qI4IqZ2zDj6wh-DZCia2SmyqgZPB7QgJ3rmAjjqKAR721doLo",
  auth: "HfueLUKHqJ1L7hpL6itXSw",
};

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
  device_name?: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
}

export interface UserNotification {
  id: string;
  title: string;
  body: string;
  user_id: string;
  channel: "push" | "email" | "sms" | "in_app";
  priority: "low" | "normal" | "high" | "urgent";
  action_url?: string;
  icon_url?: string;
  data?: Record<string, unknown>;
  created_at: string;
}

export interface PushDelivery {
  id: string;
  user_notification_id: string;
  push_subscription_id: string;
  status:
    | "queued"
    | "sending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "expired";
  attempt_count: number;
  max_attempts: number;
  queued_at: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  error_code?: string;
  error_message?: string;
  retry_after?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cria uma push subscription para testes
 */
export async function createPushSubscription(
  userId: string,
  options: Partial<PushSubscription> = {},
  testSuiteId?: string,
): Promise<PushSubscription> {
  const response = await dockerHttpRequest(
    "POST",
    "/items/push_subscription",
    {
      user_id: userId,
      endpoint:
        options.endpoint ||
        `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`,
      keys: options.keys || VALID_TEST_KEYS,
      user_agent: options.user_agent || "Test User Agent",
      device_name: options.device_name || null,
      is_active: options.is_active !== undefined ? options.is_active : true,
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as PushSubscription;
}

/**
 * Cria uma user notification para testes
 */
export async function createUserNotification(
  data: Partial<UserNotification> & { user_id: string },
  testSuiteId?: string,
): Promise<UserNotification> {
  const response = await dockerHttpRequest(
    "POST",
    "/items/user_notification",
    {
      title: data.title || "Test Notification",
      body: data.body || "Test notification body",
      user_id: data.user_id,
      channel: data.channel || "push",
      priority: data.priority || "normal",
      action_url: data.action_url || null,
      icon_url: data.icon_url || null,
      data: data.data || null,
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as UserNotification;
}

/**
 * Busca push deliveries por notification ID
 */
export async function getPushDeliveries(
  notificationId: string,
  testSuiteId?: string,
): Promise<PushDelivery[]> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_delivery?filter[user_notification_id][_eq]=${notificationId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return (response.data as PushDelivery[]) || [];
}

/**
 * Busca um push delivery específico
 */
export async function getPushDelivery(
  notificationId: string,
  subscriptionId: string,
  testSuiteId?: string,
): Promise<PushDelivery | null> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_delivery?filter[user_notification_id][_eq]=${notificationId}&filter[push_subscription_id][_eq]=${subscriptionId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  const data = response.data as PushDelivery[] | undefined;
  return data?.[0] || null;
}

/**
 * Atualiza um push delivery
 */
export async function updatePushDelivery(
  deliveryId: string,
  data: Partial<PushDelivery>,
  testSuiteId?: string,
): Promise<PushDelivery> {
  const response = await dockerHttpRequest(
    "PATCH",
    `/items/push_delivery/${deliveryId}`,
    data,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as PushDelivery;
}

/**
 * Busca uma subscription por ID
 */
export async function getPushSubscription(
  subscriptionId: string,
  testSuiteId?: string,
): Promise<PushSubscription> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_subscription/${subscriptionId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as PushSubscription;
}

/**
 * Atualiza campo push_enabled do usuário
 */
export async function updateUserPushEnabled(
  userId: string,
  enabled: boolean,
  testSuiteId?: string,
): Promise<void> {
  await dockerHttpRequest(
    "PATCH",
    `/users/${userId}`,
    {
      push_enabled: enabled,
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );
}

/**
 * Aguarda um período de tempo (para hooks processarem)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca o user ID do admin
 */
export async function getAdminUserId(testSuiteId?: string): Promise<string> {
  const response = await dockerHttpRequest(
    "GET",
    "/users/me",
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  const data = response.data as { id: string };
  return data.id;
}
