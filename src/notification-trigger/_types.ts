/**
 * Tipos TypeScript para Notification Trigger Hook
 * Baseado nas melhores práticas do Firebase Messaging
 */

import type {
  DeliveryStatus,
  NotificationPriority,
} from "../push-notification/_types.js";

// === Hook Context Types ===

export interface NotificationPayload {
  id: string;
  title: string;
  body: string;
  user_id: string;
  channel: "push" | "email" | "sms" | "in_app";
  priority?: NotificationPriority;
  action_url?: string;
  icon_url?: string;
  data?: Record<string, unknown>;
}

export interface SubscriptionRecord {
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
}

export interface DeliveryRecord {
  id: string;
  attempt_count: number;
  max_attempts: number;
  subscription: SubscriptionRecord;
}

export interface UserRecord {
  id: string;
  push_enabled: boolean;
}

// === Push Send Options (inspirado no Firebase Messaging) ===

export interface PushSendOptions {
  /**
   * Simula o envio sem realmente enviar (para testes)
   * Inspirado no Firebase Messaging dry_run
   */
  dry_run?: boolean;

  /**
   * Time-to-live em segundos
   * Quanto tempo a mensagem pode ficar no push service antes de expirar
   */
  ttl?: number;

  /**
   * Urgência da mensagem
   * Afeta como o push service trata a entrega
   */
  urgency?: "very-low" | "low" | "normal" | "high";
}

// === Send Result Types ===

export interface SendResult {
  subscription_id: string;
  success: boolean;
  status: DeliveryStatus;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
  };
}

export interface BatchSendResult {
  total: number;
  sent: number;
  failed: number;
  results: SendResult[];
}

// === Error Codes ===

export const PushErrorCodes = {
  SUBSCRIPTION_EXPIRED: "410",
  INVALID_SUBSCRIPTION: "400",
  PAYLOAD_TOO_LARGE: "413",
  TOO_MANY_REQUESTS: "429",
  SERVER_ERROR: "500",
  UNKNOWN: "UNKNOWN",
} as const;

export type PushErrorCode =
  (typeof PushErrorCodes)[keyof typeof PushErrorCodes];
