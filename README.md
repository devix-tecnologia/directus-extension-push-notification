# Directus Extension Push Notification

A simple and straightforward push notification management extension for Directus.

## Features

- ✅ Automatic collection creation for push notification subscriptions
- ✅ Register/unregister device subscriptions via REST endpoints
- ✅ Send push notifications to specific users or all subscribers
- ✅ Full VAPID (Voluntary Application Server Identification) support
- ✅ Web Push Protocol compliant
- ✅ TypeScript support

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
