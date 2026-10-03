/**
 * Push Notification SDK
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * // Import everything
 * import { PushNotificationClient, resolveTranslation } from "@devix-tecnologia/push-notification-sdk";
 *
 * // Or import specific modules
 * import type { UserNotification } from "@devix-tecnologia/push-notification-sdk/types";
 * import { PushNotificationClient } from "@devix-tecnologia/push-notification-sdk/client";
 * import { subscribe } from "@devix-tecnologia/push-notification-sdk/subscribe";
 * ```
 */

// Types
export type {
  PushSubscriptionKeys,
  PushSubscriptionData,
  PushSubscription,
  NotificationChannel,
  NotificationPriority,
  NotificationTranslation,
  UserNotification,
  DeliveryStatus,
  DeliveryMetadata,
  PushDelivery,
  PushPayload,
  RegisterSubscriptionRequest,
  RegisterSubscriptionResponse,
  UnregisterSubscriptionRequest,
  UnregisterSubscriptionResponse,
  SendNotificationRequest,
  SendNotificationResponse,
  PushNotificationClientConfig,
  SubscribeOptions,
  SubscribeResult,
  TranslationSource,
  ResolvedTranslation,
} from "./types.js";

// Client
export { PushNotificationClient, PushNotificationSDKError } from "./client.js";

// Subscribe helpers
export {
  subscribe,
  unsubscribe,
  isPushSupported,
  detectDeviceName,
  vapidKeyToUint8Array,
} from "./subscribe.js";

// Translation
export {
  resolveTranslation,
  DEFAULT_FALLBACK_LANGUAGE,
} from "./translation.js";
