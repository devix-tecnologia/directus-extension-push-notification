# 🧩 Task 018 — m2o columns are created as varchar while the keys they reference are uuid, so no relation is ever registered and listing user_notification fails with 500

- Status: pending
- Type: fix
- Assignee: sidartaveloso

## Description
directus-state.json declares push_delivery.notification, push_delivery.subscription, push_subscription.user, user_notification.user, user_notification.user_created and user_notification_translations.user_notification_id as type string (character varying(36)), while user_notification.id, push_subscription.id and directus_users.id are uuid. Postgres refuses the foreign keys ('restrição de chave estrangeira ... não pode ser implementada'), db-configuration only logs WARN 'Could not create relation', and directus_relations ends with no row for any of them. The o2m alias user_notification.deliveries is then left without a relation and Directus selects it as a column: every GET /items/user_notification answers 500 'column user_notification.deliveries does not exist' — the notification list is unreadable for the app and for any client. Found 2026-10-05 in the geohub e2e (notifications are created, reading them fails) and confirmed on the PMDF production server. Fix: m2o fields typed uuid, a migration that converts existing varchar columns to uuid and then registers the relations on installations already affected, db-configuration failing loudly instead of WARN when a relation cannot be created, and a test against a real Postgres that lists user_notification after setup.

## Tasks
<!-- [x] feito · [ ] em aberto · [ ] ... — adiado: <razão> para o que se decidiu não fazer -->
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Notes
Add any relevant notes or links here.
