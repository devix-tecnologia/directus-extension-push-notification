# 🧩 Task 016 — client script writes to the user's browser console on every page load

- Status: done
- Type: fix
- Assignee: sidartaveloso

## Description

The script injected into the Directus app (src/push-client-script/client-script.ts) hardcodes DEBUG = true and its log/warn/error helpers call console._ unconditionally — 68 calls. Every page load prints the public URL, the host and the first 20 characters of the VAPID public key to the end user's console. Requirement (Sidarta, 2026-10-05): no console output in the user's browser. Remove the console output from the client script and the service worker; keep diagnostics available only through an explicit opt-in that is off by default, and add a test that fails if console._ reaches the generated script.

## Tasks

<!-- [x] feito · [ ] em aberto · [ ] ... — adiado: <razão> para o que se decidiu não fazer -->

- [x] Script de cliente silencioso por padrão: `log`/`warn`/`error` são no-op, sem `DEBUG = true` fixo
- [x] Diagnóstico só por opt-in no servidor (`PUSH_CLIENT_DEBUG=true`, desligado por padrão), via `console.debug`
- [x] Removidos os logs de chave VAPID, dados do usuário e chaves da subscription, mesmo no modo debug
- [x] Service worker (`service-worker.js`) já não tinha `console.*`; agora há teste que o protege
- [x] Teste `tests/unit/no-browser-console.test.ts` reprova se `console.` chegar ao script gerado ou ao service worker publicado
- [x] README documenta `PUSH_CLIENT_DEBUG`

## Notes

- O logger do service worker continua enviando `SW_LOG` por `postMessage`; nenhum cliente escuta, então não chega ao console.
- Antes: 68 chamadas a `console.*` por carregamento de página. Depois: 0 no padrão (`dist/app.js` e `dist/service-worker.js` sem `console.`).
