# Task 011 — Push send has no timeout, leaving deliveries stuck in sending

- Status: pending
- Type: fix
- Assignee: sidartaveloso

## Description

`webpush.sendNotification` is awaited without any timeout in
[`notification-trigger/index.ts:287`](../src/notification-trigger/index.ts#L287).
When a subscription endpoint accepts the connection but never answers, the
promise neither resolves nor rejects: the `catch` never runs, the
`push_delivery` record stays at `status: "sending"` forever, and no retry is
ever scheduled.

Observed on 2026-09-23 while investigating a failing e2e test:

```
[attempt 1]  Delivery status: sending, attempt_count: 1
...
[attempt 15] Delivery status: sending, attempt_count: 1
```

The delivery is created and then frozen. In production this means a slow or
unresponsive push endpoint leaks stuck records and holds the handler.

This is the root cause of the one red test in the suite,
`push-notification-mock-delivery`, which waits for a final status and gives up.

## Tasks

- [ ] Write a test that a hanging endpoint results in a terminal state, not `sending`
- [ ] Apply a timeout to the send (option on `webpush.sendNotification`, or `AbortSignal.timeout`)
- [ ] Decide whether a timeout counts as retryable, and record the choice
- [ ] Consider a sweeper for records already stuck in `sending`
- [ ] Confirm `push-notification-mock-delivery` goes green

## Notes

- Related: task 012, which is why the underlying error never showed up in the log.
