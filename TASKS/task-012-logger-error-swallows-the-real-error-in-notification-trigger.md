# Task 012 — logger.error swallows the real error in notification-trigger

- Status: pending
- Type: fix
- Assignee: sidartaveloso

## Description

The failure path calls the logger as `(message, object)`:

```ts
logger.error(`[Notification Trigger] Failed to send push to device ${sub.id}`, {
  error: err.message,
  statusCode: err.statusCode,
});
```

Directus uses pino, whose signature is `(mergingObject, message)`. With the
arguments in this order the object is dropped, so the log carries only
`Failed to send push to device <id>` and never the reason.

This cost real debugging time on 2026-09-23: the actual messages
(`getaddrinfo ENOTFOUND fcm.test`, `The subscription p256dh value should be 65
bytes long.`) were only found by reading `error_message` straight from the
`push_delivery` rows.

## Tasks

- [ ] Swap the argument order on every `logger` call that passes an object
- [ ] Sweep the other hooks and endpoints for the same mistake
- [ ] Confirm the reason shows up in `docker logs`

## Notes

- Found while investigating task 011.
