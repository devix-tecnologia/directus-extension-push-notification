# Directus Extension Push Notification

A simple and straightforward push notification management extension for Directus with multi-device support and granular delivery tracking.

## Features

- ✅ **Multi-device support** - One user can have multiple active subscriptions (Desktop, Mobile, Tablet)
- ✅ **Native Directus architecture** - Uses native collections and fields (no custom UI needed)
- ✅ **Granular delivery tracking** - Track status per device (queued → sending → sent → delivered → read)
- ✅ **Multi-channel notifications** - Support for push, email, SMS, and in-app notifications
- ✅ **Automatic subscription management** - Auto-subscribe on login, soft delete on unregister
- ✅ **Service Worker integration** - Browser notifications with delivery confirmation
- ✅ **VAPID support** - Full Voluntary Application Server Identification support
- ✅ **TypeScript support** - Fully typed codebase

## Architecture

### Collections

This extension creates three main collections:

#### 1. `push_subscription` (Devices)

Stores user device subscriptions for push notifications.

**Fields:**

- `id` (uuid) - Primary key
- `user_id` (m2o → directus_users) - Owner of the subscription
- `endpoint` (text, unique) - Push subscription endpoint
- `keys` (json) - Push subscription keys (p256dh, auth)
- `user_agent` (string) - Browser user agent for device identification
- `device_name` (string, nullable) - Optional friendly device name
- `is_active` (boolean, default: true) - Whether the subscription is active
- `created_at` (timestamp) - When the subscription was created
- `last_used_at` (timestamp) - Last time the subscription was used
- `expires_at` (timestamp) - When the subscription expired

#### 2. `user_notification` (Messages)

Stores notification messages for users across all channels.

**Fields:**

- `id` (uuid) - Primary key
- `title` (string, required) - Notification title
- `body` (text, required) - Notification content
- `user_id` (m2o → directus_users) - Recipient
- `channel` (enum: push/email/sms/in_app) - Delivery channel
- `priority` (enum: low/normal/high/urgent, default: normal) - Priority level
- `action_url` (string) - URL to open when clicked
- `icon_url` (string) - Custom icon URL
- `data` (json) - Additional data for the app
- `created_by` (m2o → directus_users) - Creator
- `created_at` (timestamp) - Creation timestamp
- `expires_at` (timestamp) - Expiration timestamp

#### 3. `push_delivery` (Join Table)

Tracks delivery status for each notification-device pair.

**Fields:**

- `id` (uuid) - Primary key
- `user_notification_id` (m2o → user_notification) - Which notification
- `push_subscription_id` (m2o → push_subscription) - Which device
- `status` (enum) - queued/sending/sent/delivered/read/failed/expired
- `attempt_count` (integer, default: 0) - Number of send attempts
- `max_attempts` (integer, default: 3) - Maximum retry attempts
- `queued_at` (timestamp) - When queued
- `sent_at` (timestamp) - When sent to push service
- `delivered_at` (timestamp) - When delivered to device (Service Worker callback)
- `read_at` (timestamp) - When user clicked/read
- `failed_at` (timestamp) - When failed permanently
- `error_code` (string) - Error code (e.g., "410", "INVALID_SUBSCRIPTION")
- `error_message` (text) - Detailed error message
- `retry_after` (timestamp) - When to retry (for transient failures)
- `metadata` (json) - Additional metadata

### User Field

The extension also adds a field to `directus_users`:

- `push_enabled` (boolean, default: false) - Global toggle for push notifications

## How It Works

### 1. Enable Push Notifications

Users can enable push notifications via User Settings:

1. Login to Directus
2. Go to User Settings
3. Enable `push_enabled` field
4. On next page load, browser will request notification permission

### 2. Auto-Subscribe

When `push_enabled` is true, the app hook automatically:

- Registers a Service Worker
- Requests notification permission
- Creates a subscription in `push_subscription`

### 3. Send Notifications

Create a notification via API or Directus UI:

```bash
POST /items/user_notification
{
  "title": "Welcome!",
  "body": "Thanks for enabling notifications",
  "user_id": "<user_uuid>",
  "channel": "push",
  "priority": "normal"
}
```

### 4. Automatic Delivery

The backend hook (`notification-trigger`) automatically:

1. Detects `user_notification.items.create` event
2. Filters by `channel === 'push'`
3. Finds all active subscriptions for the user
4. Creates `push_delivery` records (status: queued)
5. Sends push to all devices
6. Updates delivery status (sent/failed)

### 5. Track Delivery

Service Worker callbacks update `push_delivery`:

- **delivered**: When notification arrives at device
- **read**: When user clicks the notification

## API Endpoints

### Register Subscription

```bash
POST /push-notification/register
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

### Unregister Subscription

```bash
POST /push-notification/unregister
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/..."
  }
}
```

**Note:** Unregister performs a soft delete (sets `is_active: false`) to preserve delivery history.

## Installation

Install the extension via npm:

```bash
npm install @devix-tecnologia/directus-extension-push-notification
```

Or using the Directus Marketplace directly from your Directus instance.

## Development

### Local Development Environment

Para desenvolvimento e testes locais, você pode usar o Docker Compose:

```bash
# Build the extension
pnpm build

# Start Directus with the extension loaded
pnpm docker:start

# Access Directus at http://localhost:8055
# Login: admin@example.com / admin123
```

**Workflow de Desenvolvimento Iterativo:**

```bash
# 1. Subir o ambiente (primeira vez)
pnpm docker:start

# 2. Fazer mudanças no código

# 3. Rebuild e testar
pnpm build && pnpm test:e2e:dev

# 4. Se necessário, inspecionar manualmente em http://localhost:8055

# 5. Repetir passos 2-4 conforme necessário

# 6. Derrubar o ambiente quando terminar
pnpm docker:stop
```

Este workflow permite executar os testes E2E contra o ambiente de desenvolvimento sem derrubar os containers após cada execução, facilitando o debug e inspeção manual.

**Ambiente Inclui:**

- Directus 11.13.4
- SQLite database (in-memory para desenvolvimento rápido)
- Auto-reload habilitado para a extensão
- VAPID keys pré-configuradas para testes

**Para rebuild após mudanças:**

```bash
pnpm build
docker-compose restart
```

### Testes de Integração (Docker)

Para reduzir tempo de feedback, o repositório inclui scripts npm que controlam o ciclo do ambiente de testes (start → run → stop).

- Subir apenas o ambiente (mantenha rodando entre execuções):

```bash
pnpm run test:integration:env-up
```

- Rodar os testes de integração:

```bash
pnpm run test:integration:run
```

- Trazer o ambiente abaixo (preserva o volume do DB):

```bash
pnpm run test:integration:env-down
```

- Fluxo único (up → run → down, preservando o código de saída dos testes):

```bash
pnpm run test:integration:ci
```

Observações:

- Não use `docker-compose ... down -v` se quiser preservar o banco entre execuções — `-v` apaga volumes e força re-run das migrations.
- Se você alterar a extensão, mantenha o container rodando e use `pnpm build` seguido de `docker-compose restart` para reduzir o tempo de ciclo.

### Environment Configuration

Add the following environment variables to your `.env` file:

```bash
VAPID_PUBLIC_KEY=your_public_vapid_key
VAPID_PRIVATE_KEY=your_private_vapid_key
```

**Important:** The VAPID keys must be a valid pair, and the public key must match the one used in your client application.

#### Generating VAPID Keys

You can generate VAPID keys using the `web-push` library:

```bash
npx web-push generate-vapid-keys
```

## Usage

After [installation](#installation), the extension will automatically:

1. Create the necessary `PushNotification` [collection](#pushnotification-collection) on first run
2. Register REST endpoints for subscription management
3. Enable push notification functionality across your Directus instance

⚠️ **Caution:** Make sure there are no existing collections with conflicting names.

## API Endpoints

All endpoints are available under the `/push-notification/` prefix.

### Register Device

**POST** `/push-notification/register`

Register a new device or update an existing subscription for push notifications.

**Request Body:**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/f9...1q",
    "expirationTime": null,
    "keys": {
      "p256dh": "BH...dLA",
      "auth": "nn...cw"
    }
  }
}
```

**Response:** 200 OK

### Unregister Device

**POST** `/push-notification/unregister`

Remove a device subscription from the push notification system.

**Request Body:** Same as Register Device

**Response:** 200 OK

### Send Notification to All Users

**GET** `/push-notification/send-notification`

⚠️ **Disabled by default** - This endpoint is intended for testing purposes only.

Sends a test notification to all registered devices.

**Permissions Required:** Admin/Custom role with explicit permission

### Send Notification to Specific User

**GET** `/push-notification/send-notification/:userId`

Sends a notification to all registered devices of a specific user.

**Parameters:**

- `userId` (UUID) - The Directus user ID

**Response:** 200 OK

## PushNotification Collection

The extension automatically creates a collection with the following schema:

| Field        | Type      | Description                            |
| ------------ | --------- | -------------------------------------- |
| id           | uuid      | Primary key                            |
| status       | string    | Subscription status                    |
| date_created | timestamp | Creation date                          |
| date_updated | timestamp | Last update date                       |
| user_created | uuid      | User who created the record            |
| user_updated | uuid      | User who last updated the record       |
| endpoint     | text      | Push notification service endpoint     |
| subscription | json      | Complete subscription object with keys |
| user         | uuid      | Related Directus user                  |

## Client Integration Example

Here's a basic example of how to integrate push notifications in your web application:

```javascript
// Request notification permission
const permission = await Notification.requestPermission();

if (permission === "granted") {
  // Register service worker
  const registration =
    await navigator.serviceWorker.register("/service-worker.js");

  // Subscribe to push notifications
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: "YOUR_VAPID_PUBLIC_KEY",
  });

  // Send subscription to Directus
  await fetch("https://your-directus-instance.com/push-notification/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer YOUR_ACCESS_TOKEN",
    },
    body: JSON.stringify({ subscription }),
  });
}
```

## Requirements

- Directus 10.1.7 or higher
- Node.js 18+ recommended
- Valid VAPID key pair

## License

MIT

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/your-org/directus-extension-push-notification).
