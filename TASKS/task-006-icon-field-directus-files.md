# Task 006 — Campo Icon como relação com directus_files

- Status: done
- Type: feature
- Assignee: Sidarta Veloso

## Description

Adicionar um campo `icon` (M2O → `directus_files`) na coleção `user_notification`, permitindo upload de imagens diretamente pelo Directus. O campo `icon_url` existente (string) será mantido como alternativa para URLs externas.

### Endpoint público para ícone

Em vez de expor `directus_files` publicamente, foi criado um endpoint dedicado:

```
GET /push-notification/icon/:notification_id
```

Comportamento:

1. Se a notificação tem `icon` (arquivo no Directus) → redirect para `/assets/{id}?width=192&height=192&fit=cover&quality=80` (transformação automática para 192×192px)
2. Senão, se tem `icon_url` (URL externa) → redirect 302 para a URL
3. Senão → redirect para `/admin/favicon.ico`

**Vantagens:**

- Nenhum arquivo do Directus precisa ficar público
- Transformação de imagem aplicada automaticamente
- Service worker acessa um único URL público sem autenticação
- Zero configuração de permissões pelo admin

## Abordagem TDD

Esta task **deve ser implementada usando TDD (Test-Driven Development)**. Os testes devem ser escritos **antes** da implementação.

### Caso 1: Ícone via arquivo do Directus (campo `icon`)

1. Escrever teste que verifica que, ao criar uma notificação com um `icon` (ID de arquivo), o payload enviado ao service worker contém a URL `/assets/{id}`
2. Escrever teste que verifica que a URL do asset é acessível sem autenticação (resposta HTTP 200 sem header Authorization)
3. Escrever teste que verifica que, quando `icon` e `icon_url` estão ambos preenchidos, `icon` tem prioridade
4. Implementar a funcionalidade até os testes passarem

### Caso 2: Ícone via URL externa (campo `icon_url`)

1. Escrever teste que verifica que, ao criar uma notificação apenas com `icon_url`, o payload enviado ao service worker contém a URL do endpoint `/push-notification/icon/:notification_id` — o endpoint é quem faz o redirect 302 para a URL externa. **Decidido em 17/09/2026:** a indireção vale também para o caso da URL externa, para que exista um único URL público de ícone e a URL externa não apareça no payload. O custo aceito é um round-trip HTTP e uma consulta ao banco por notificação exibida
2. Escrever teste que verifica o fallback para `/admin/favicon.ico` quando nem `icon` nem `icon_url` estão preenchidos
3. Implementar a funcionalidade até os testes passarem

## Tasks

- [x] Escrever testes para o caso 1 (icon via directus_files) — `tests/unit/resolve-icon.test.ts`, bloco "Caso 1"
- [x] Escrever testes para o caso 2 (icon via URL externa) — `tests/unit/resolve-icon.test.ts`, bloco "Caso 2"
- [x] Adicionar campo `icon` (uuid, M2O → `directus_files`) em `directus-state.json`
- [x] Adicionar relação M2O `icon` → `directus_files` em `directus-state.json`
- [x] Configurar interface `file-image` com opções de validação (apenas imagens)
- [x] Configurar display `image` para preview na listagem
- [x] Atualizar `_types.ts` — adicionar campo `icon?: string` em `UserNotification`
- [x] Atualizar `notification-trigger/index.ts` — resolver `icon` para a URL do ícone (via `resolveIconUrl`, em `resolve-icon.ts`). Resolve para o endpoint dedicado `/push-notification/icon/:notification_id`, que por sua vez redireciona para `/assets/{id}?width=192&height=192&...`, conforme descrito acima — e não para `/assets/{id}` direto
- [x] Atualizar `service-worker.ts` — lógica de prioridade (icon > icon_url > fallback). A prioridade entre `icon` e `icon_url` ficou no servidor, em `resolve-icon.ts`; o service worker recebe a URL já resolvida em `icon_url` e aplica só o fallback final (`data.icon_url || "/admin/favicon.ico"`)
- [ ] Atualizar `PushPayload` type para incluir `icon` — adiado: o item apontava para um tipo morto. O `PushPayload` de `src/push-notification/_types.ts` não era usado em lugar nenhum (o payload é montado como objeto literal em `notification-trigger/index.ts`) e já havia ficado para trás num rename, declarando `user_notification_id`/`push_delivery_id` enquanto o payload real carrega `notification_id`/`delivery_id`. Quem descreve o payload de fato é `PushNotificationData`, em `service-worker.types.ts`, e a cópia publicada pelo SDK — ambas já corretas e nenhuma precisa de `icon`, porque o servidor resolve `icon` e `icon_url` numa única URL antes de montar o payload. O tipo morto foi removido em 17/09/2026
- [x] Adicionar traduções i18n para o campo `icon` (en-US, pt-BR)
- [x] Verificar que todos os testes passam — 41 testes unitários e 42 e2e verdes em 17/09/2026
- [x] Rodar `pnpm validate` sem erros — "Extension is valid"

## Referências

- [Directus Files API](https://docs.directus.io/reference/files.html)
- [Directus Assets endpoint](https://docs.directus.io/reference/files.html#accessing-a-file)
- [Web Push Notification icon spec](https://developer.mozilla.org/en-US/docs/Web/API/Notification/icon)
