# Directus Extension Push Notification

A simple and straightforward push notification management extension for directus.

## Installation

For now the package is under the registry `https://verdaccio.paas.node07.de.vix.br/`.

```bash
npm install @devix/directus-extension-push-notification
```

Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in your .env file with valid vapid keys, for this to work they must be a valid pair and the public vapid must be the same of your app's.

## Usage

After [installation](#installation) this should be good to go. The extension will usa a hook to create the necessary [collection](#pushnotification-collection) (caution with collection incompatibility) and register the endpoints.

## Endpoints

This extension register four endpoints, two to make it work and two for tests, all of them under the `/push-notification/`.

### Register

The register endpoint under POST `/push-notification/register` receives a valid [subscription](#subscription-model) object and create a new or update an existing [collection](#pushnotification-collection) item.

### Unregister

The unregister endpoint under POST `/push-notification/unregister` receives a valid [subscription](#subscription-model) object and deletes an existing [collection](#pushnotification-collection) item.

### Send Notification

The endpoint under GET `/push-notification/send-notification` is disable by default permission configuration as it is intendet for testing. It sends a notification to all items on the [collection](#pushnotification-collection)

And the endpoint GET `/push-notification/send-notification/:userId` sends to all registered devices of an specific User.

## PushNotification Collection

The collection created by this extension in the folowing way:

```json
{
    "collection": "PushNotification",
    "fields": {
        "id": "uuid",
        "status": "string",
        "date_created": "timestamp",
        "date_updated": "timestamp",
        "user_created": "uuid",
        "user_updated": "uuid",
        "endpoint": "text",
        "subscription": "json",
        "user": "uuid",
    }
    
}
```

## Subscription Model

Example of a valid subscription post payload:

```json
{
    "subscription": {
        "endpoint":"https://fcm.googleapis.com/fcm/send/f9...1q",
        "expirationTime":null,
        "keys": {
            "p256dh":"BH...dLA",
            "auth":"nn...cw"
        }
    }
}
```
