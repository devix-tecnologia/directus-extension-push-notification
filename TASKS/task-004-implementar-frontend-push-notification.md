# Task 004: Implement Frontend Push Notification Flow

**Status:** `todo`  
**Priority:** `high`  
**Estimate:** `8h`

## Context

Currently, the extension has:
- ✅ Backend endpoints (`/push-notification/register`, `/unregister`, `/send`)
- ✅ `PushNotification` collection created via hook
- ✅ VAPID keys configured in environment
- ❌ No frontend component to handle browser subscription
- ❌ No Service Worker to receive push notifications
- ❌ No user interface for opt-in/opt-out

## Objective

Implement the complete push notification flow:
1. Service Worker registration
2. Browser permission request
3. Push subscription creation using VAPID public key
4. Automatic subscription storage via API endpoint
5. User interface for managing notification preferences

## Technical Requirements

### 1. Service Worker (`service-worker.js`)

Create a Service Worker to handle push notifications:

**Location:** `src/push-notification/service-worker.js`

**Features:**
- Listen for `push` events
- Display notifications with custom data (title, body, icon, data)
- Handle notification clicks (open URL, focus existing tab)
- Handle notification close events

**Example structure:**
```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: data.badge || '/badge.png',
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Handle click logic
});
```

### 2. Push Notification Manager Module

Create a JavaScript module to handle push subscription:

**Location:** `src/push-notification/push-manager.js`

**Features:**
- Check browser support for Push API
- Request notification permission
- Register Service Worker
- Subscribe to push notifications using VAPID public key
- Send subscription to backend endpoint
- Unsubscribe from push notifications
- Check current subscription status

**Key Functions:**
- `isPushSupported(): boolean` - Check if browser supports Push API
- `requestPermission(): Promise<NotificationPermission>` - Request notification permission
- `registerServiceWorker(): Promise<ServiceWorkerRegistration>` - Register Service Worker
- `subscribeToPush(vapidPublicKey: string): Promise<PushSubscription>` - Create push subscription
- `sendSubscriptionToServer(subscription: PushSubscription): Promise<void>` - Send to `/push-notification/register`
- `unsubscribeFromPush(): Promise<void>` - Remove subscription
- `getCurrentSubscription(): Promise<PushSubscription | null>` - Get current subscription

**Example:**
```javascript
export async function subscribeToPush(vapidPublicKey) {
  const registration = await navigator.serviceWorker.ready;
  
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
  
  await fetch('/push-notification/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription })
  });
  
  return subscription;
}
```

### 3. Vue Component for User Interface

Create a Vue component to manage push notifications:

**Location:** `src/push-notification/components/PushNotificationSettings.vue`

**Features:**
- Display current notification status (enabled/disabled/blocked)
- Button to enable/disable notifications
- Visual feedback (loading states, success/error messages)
- Check permission status on mount
- Handle permission denied scenario gracefully
- Show VAPID public key for debugging (optional)

**UI Elements:**
- Status indicator (icon + text)
- Enable/Disable toggle button
- Permission status message
- Browser compatibility warning (if not supported)

**Example structure:**
```vue
<template>
  <div class="push-notification-settings">
    <v-notice v-if="!isSupported" type="warning">
      Your browser does not support push notifications.
    </v-notice>
    
    <div v-else class="status">
      <v-icon :name="statusIcon" />
      <span>{{ statusText }}</span>
    </div>
    
    <v-button
      v-if="isSupported && permission !== 'denied'"
      @click="toggleNotifications"
      :loading="loading"
      :disabled="permission === 'denied'"
    >
      {{ isSubscribed ? 'Disable Notifications' : 'Enable Notifications' }}
    </v-button>
    
    <v-notice v-if="permission === 'denied'" type="danger">
      Notifications are blocked. Please enable them in your browser settings.
    </v-notice>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '../push-manager';

const api = useApi();
const isSupported = ref(true);
const permission = ref('default');
const isSubscribed = ref(false);
const loading = ref(false);

onMounted(async () => {
  // Check support and status
  isSupported.value = 'Notification' in window && 'serviceWorker' in navigator;
  if (isSupported.value) {
    permission.value = Notification.permission;
    const subscription = await getCurrentSubscription();
    isSubscribed.value = !!subscription;
  }
});

async function toggleNotifications() {
  loading.value = true;
  try {
    if (isSubscribed.value) {
      await unsubscribeFromPush();
      isSubscribed.value = false;
    } else {
      // Fetch VAPID public key from server
      const response = await api.get('/push-notification/vapid-key');
      const { publicKey } = response.data;
      
      await subscribeToPush(publicKey);
      isSubscribed.value = true;
      permission.value = Notification.permission;
    }
  } catch (error) {
    console.error('Error toggling notifications:', error);
    // Show error notification
  } finally {
    loading.value = false;
  }
}
</script>
```

### 4. Add VAPID Public Key Endpoint

The component needs to fetch the VAPID public key from the server.

**Location:** `src/push-notification/index.ts`

**Add new endpoint:**
```typescript
router.get('/vapid-key', (req, res) => {
  res.json({ 
    publicKey: process.env.VAPID_PUBLIC_KEY 
  });
});
```

### 5. Integrate Component into Directus

Add the component to the Directus interface:

**Options:**
1. **Module Route**: Create a dedicated settings page
2. **Panel**: Add as a dashboard panel
3. **Account Menu**: Add to user settings

**Recommended: Account Menu Integration**

Update `src/push-notification/index.ts` to register a module:

```typescript
import { defineInterface } from '@directus/extensions-sdk';

export default defineInterface({
  id: 'push-notification-settings',
  name: 'Push Notification Settings',
  icon: 'notifications',
  description: 'Manage push notification preferences',
  component: PushNotificationSettings,
  options: null,
  types: ['alias'],
});
```

### 6. Bundle Configuration

Update extension build config to include Service Worker:

**Update `package.json` or build script:**
- Ensure Service Worker is copied to `dist/` or served correctly
- Configure proper Service Worker scope

### 7. Test Scenarios

**Unit Tests (Optional):**
- Test `push-manager.js` functions with mocked APIs
- Test URL base64 conversion utilities

**E2E Tests (Playwright):**
1. **Test: Enable notifications**
   - Navigate to push notification settings
   - Click enable button
   - Grant permission in browser dialog
   - Verify subscription created
   - Verify subscription stored in database

2. **Test: Disable notifications**
   - Start with active subscription
   - Click disable button
   - Verify subscription removed from database

3. **Test: Send test notification**
   - Enable notifications
   - Trigger test notification from backend
   - Verify notification appears in browser

4. **Test: Permission denied scenario**
   - Start with denied permission
   - Verify disable state and message shown
   - Verify button is disabled

5. **Test: Browser not supported**
   - Mock unsupported browser
   - Verify warning message shown

## Implementation Steps

1. [ ] Create Service Worker (`service-worker.js`)
2. [ ] Create Push Manager module (`push-manager.js`)
3. [ ] Add VAPID public key endpoint
4. [ ] Create Vue component (`PushNotificationSettings.vue`)
5. [ ] Register component as Directus interface/module
6. [ ] Configure build to include Service Worker
7. [ ] Update documentation (README.md)
8. [ ] Add E2E tests for push notification flow
9. [ ] Test in multiple browsers (Chrome, Firefox, Edge)
10. [ ] Handle edge cases (permission denied, unsupported browsers)

## Acceptance Criteria

- [ ] Service Worker successfully registers and handles push events
- [ ] User can enable push notifications with one click
- [ ] Subscription is automatically sent to backend and stored in database
- [ ] User can disable push notifications
- [ ] Component shows clear status messages (enabled/disabled/blocked)
- [ ] Works on Chrome, Firefox, and Edge (latest versions)
- [ ] Graceful degradation for unsupported browsers
- [ ] Permission denied scenario handled properly
- [ ] Test notifications can be sent from backend and appear in browser
- [ ] Automatic subscription on login (optional: could be opt-in on first visit)
- [ ] E2E tests cover main scenarios

## Technical Considerations

### VAPID Public Key Format
The public key needs to be converted from Base64 to Uint8Array:

```javascript
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

### Service Worker Scope
Service Worker must be served from the root or extension path to have proper scope:
- Development: `/extensions/directus-extension-push-notification/service-worker.js`
- Production: Ensure proper path resolution

### Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Limited support (iOS 16.4+, macOS 13+)
- Consider adding compatibility detection and warnings

### Security Considerations
- HTTPS required for Service Workers and Push API
- VAPID keys must be kept secure (public key is safe to expose)
- Validate subscriptions on backend before storing
- Consider rate limiting on register/unregister endpoints

## References

- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [Web Push Protocol (RFC 8030)](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID Protocol (RFC 8292)](https://datatracker.ietf.org/doc/html/rfc8292)
- [Directus Extensions SDK - Interfaces](https://docs.directus.io/extensions/interfaces.html)

## Notes

- Consider adding a test notification button in the UI for immediate feedback
- May want to add notification history/log in the database
- Consider adding notification categories/topics for selective subscriptions
- Could add rich notification features (actions, images, progress indicators)
- Consider handling subscription expiration and automatic renewal

---

**Related Issues:** Task 003 (E2E Tests)  
**Depends On:** Task 002 (Updated Dependencies)
