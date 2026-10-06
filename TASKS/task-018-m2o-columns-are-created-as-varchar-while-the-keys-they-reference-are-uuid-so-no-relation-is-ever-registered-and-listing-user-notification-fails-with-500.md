# 🧩 Task 018 — m2o columns are created as varchar while the keys they reference are uuid, so no relation is ever registered and listing user_notification fails with 500

- Status: done
- Type: fix
- Assignee: sidartaveloso

## Description
directus-state.json declares push_delivery.notification, push_delivery.subscription, push_subscription.user, user_notification.user, user_notification.user_created and user_notification_translations.user_notification_id as type string (character varying(36)), while user_notification.id, push_subscription.id and directus_users.id are uuid. Postgres refuses the foreign keys ('restrição de chave estrangeira ... não pode ser implementada'), db-configuration only logs WARN 'Could not create relation', and directus_relations ends with no row for any of them. The o2m alias user_notification.deliveries is then left without a relation and Directus selects it as a column: every GET /items/user_notification answers 500 'column user_notification.deliveries does not exist' — the notification list is unreadable for the app and for any client. Found 2026-10-05 in the geohub e2e (notifications are created, reading them fails) and confirmed on the PMDF production server. Fix: m2o fields typed uuid, a migration that converts existing varchar columns to uuid and then registers the relations on installations already affected, db-configuration failing loudly instead of WARN when a relation cannot be created, and a test against a real Postgres that lists user_notification after setup.

## Tasks
<!-- [x] feito · [ ] em aberto · [ ] ... — adiado: <razão> para o que se decidiu não fazer -->
- [x] TDD: `tests/unit/migrate-m2o-uuid.test.ts` vermelho antes — contrato do `directus-state.json` (todo m2o que aponta para uma chave `id` é `uuid`; `languages_code` aponta para `language.code` e continua `string`), migração idempotente com knex falso, mensagem das relações não criadas
- [x] `directus-state.json`: os sete m2o (`push_delivery.notification`, `push_delivery.subscription`, `push_subscription.user`, `user_notification.user`, `user_notification.icon`, `user_notification.user_created`, `user_notification_translations.user_notification_id`) com `type: uuid`, `data_type: uuid`, `max_length: null`
- [x] `src/db-configuration/migrate-m2o-uuid.ts`: no boot, antes das relações, converte para `uuid` (`ALTER COLUMN … DROP DEFAULT, ALTER COLUMN … TYPE uuid USING NULLIF(col, '')::uuid`) toda coluna dessas que ainda esteja em char/varchar; pula o que já é uuid ou não existe; falha de ALTER é logada e as demais seguem. O `DROP DEFAULT` veio da depuração: o Directus cria a coluna string com `DEFAULT NULL::character varying` e o Postgres recusa a conversão ("default for column cannot be cast automatically to type uuid")
- [x] `db-configuration` falha alto: relação que não pôde ser criada entra numa lista e, ao fim do passo, derruba o boot com `relationFailuresMessage` em vez do WARN que deixava a coleção ilegível
- [x] Ambiente de integração ganhou Postgres real: `docker-compose.test.yml` lê o banco de `tests/db/<sqlite|pg>.env` (`env_file` por `TEST_DB_ENV_FILE`) e tem o serviço `postgres` no perfil `pg`; `setupTestEnvironment(id, { database: "pg" })` sobe o Postgres antes do Directus. Todos os testes existentes continuam no SQLite, onde o defeito não aparece
- [x] `tests/integration/user-notification-listing.test.ts` (Postgres): `/relations/user_notification` tem `user`, `user_created` e `icon`, e `GET /items/user_notification?limit=5` (todos os campos, como a PMDF) responde a lista. Provado vermelho com o código do develop (só `icon` registrada; a listagem devolve `errors`) e verde com o fix (2026-10-05)
- [x] Caminho da migração provado à mão no Postgres: estado antigo no `dist` + hook novo → as seis colunas viram `uuid`, as oito relações entram em `directus_relations`, listagem 200 e nenhum erro de `[DB Configuration]` no log
- [ ] Publicar (merge na `main` → semantic-release) e subir o pin em `docker/directus/Dockerfile.base` do geohub (hoje 0.4.6; a `latest` do npm é 1.0.0, com a renomeação `languages` → `language`); a instalação da PMDF se corrige sozinha no boot seguinte pela migração

## Notes
- Achado em 2026-10-05 na PMDF: `GET /items/user_notification` → 500 `column user_notification.deliveries does not exist`; `directus_relations` sem nenhuma linha dos m2o da extensão.
- O `languages_code` de `user_notification_translations` é m2o para `language.code` (texto) e não entra na migração; a regra é `foreign_key_column === "id"`.
