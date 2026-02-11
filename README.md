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

## How It Works

The extension automatically creates three collections when installed:

- **`push_subscription`** - Stores device subscriptions (one user can have multiple devices)
- **`user_notification`** - Stores notification messages with support for multiple channels (push, email, SMS, in-app)
- **`push_delivery`** - Tracks delivery status for each notification-device pair

It also adds a `push_enabled` field to `directus_users` to allow users to toggle notifications on/off.

> 📖 For detailed collection schemas and field specifications, see the [Architecture Documentation](CONTRIBUTING.md#-architecture-reference) in the Contributing Guide.

### Quick Start

**1. Enable notifications (enabled by default)**

- Users can toggle `push_enabled` in User Settings
- Browser automatically requests permission on first login

**2. Send a notification**

- Create a record in `user_notification` collection via API or Directus UI
- Specify `channel: "push"` and target `user_id`

**3. Track delivery**

- Check `push_delivery` collection for status of each device
- Status flow: queued → sending → sent → delivered → read

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

Install the extension via pnpm:

```bash
pnpm add @devix-tecnologia/directus-extension-push-notification
```

Or using the Directus Marketplace directly from your Directus instance.

## Configuration

### VAPID Keys

Add the following environment variables to your `.env` file:

```bash
VAPID_PUBLIC_KEY=your_public_vapid_key
VAPID_PRIVATE_KEY=your_private_vapid_key
```

**Important:** The VAPID keys must be a valid pair, and the public key must match the one used in your client application.

**Generating VAPID Keys:**

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

## Client Integration Example

Here's a basic example of how to integrate push notifications in your web application:

```javascript
// Request notification permission
const permission = await Notification.requestPermission();

if (permission === "granted") {
  // Register service worker from extension endpoint
  const registration = await navigator.serviceWorker.register(
    "/extensions/push-notification-sw/sw.js",
  );

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

## Development

Interested in contributing? Check out our [Contributing Guide](CONTRIBUTING.md) for:

- Local development setup
- Testing instructions
- Code standards
- Release process

## License

MIT

## Support

For issues, questions, or contributions, please visit:

- **Issues**: [GitHub Issues](https://github.com/devix-tecnologia/directus-extension-push-notification/issues)
- **Discussions**: [GitHub Discussions](https://github.com/devix-tecnologia/directus-extension-push-notification/discussions)
