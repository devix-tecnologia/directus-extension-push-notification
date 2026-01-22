# Task 003 — Testes E2E com Playwright

Status: in-progress
Type: feat  
Assignee: Sidarta Veloso

## Description

Implementar testes end-to-end com Playwright para validar a interface e funcionalidade completa da extensão de push notification no Directus.

## Objectives

1. **Teste de UI da Collection**
   - Verificar que a coleção PushNotification aparece no menu lateral do Directus
   - Validar que os campos estão sendo exibidos corretamente na interface
   - Confirmar que é possível navegar e visualizar items da coleção

2. **Teste de Envio de Notificação**
   - Criar um item de push notification via UI
   - Enviar notificação para o próprio usuário usando o endpoint da API
   - Validar que o registro de PushNotification foi criado no banco
   - Confirmar que a notificação aparece na lista de items

3. **Teste de Subscription**
   - Verificar endpoint de registro de subscription
   - Validar que subscription é salva com dados corretos (endpoint, keys, user)
   - Confirmar que campos obrigatórios estão funcionando

## Technical Requirements

- Usar Playwright (já configurado no projeto)
- Seguir padrão do directus-extension-inframe (tests/e2e/)
- Testes devem:
  - Fazer login no Directus
  - Navegar pela interface
  - Interagir com collections e endpoints
  - Validar dados criados

## References

- Ver implementação similar em: `/Users/sidarta/repositorios/directus-extension-inframe/tests/e2e/directus-login-collections.spec.ts`
- Playwright config: `playwright.config.cjs`
- Docker test environment já configurado

## Acceptance Criteria

- [ ] Testes E2E criados em `tests/e2e/`
- [ ] Collection PushNotification validada na UI
- [ ] Fluxo de envio de notificação testado
- [ ] Todos os testes passando com `pnpm test:e2e`
- [ ] Documentação atualizada com instruções de testes E2E
