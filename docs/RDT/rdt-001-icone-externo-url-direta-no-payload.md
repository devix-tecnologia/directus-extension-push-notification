# RDT-001: Ícone de URL Externa Vai Direto no Payload, sem Desvio pelo Directus

**Data:** 2026-09-17
**Status:** Proposto
**Contexto:** Push Notification — resolução do ícone (`notification-trigger`, endpoint `push-notification`)
**Decisores:** @sidartaveloso

## Contexto

Uma `user_notification` pode ter ícone de duas origens, mutuamente exclusivas na prática:

- `icon` — arquivo no Directus (M2O para `directus_files`);
- `icon_url` — URL externa, informada por quem cria a notificação.

Hoje `resolveIconUrl` ([`src/notification-trigger/resolve-icon.ts`](../../src/notification-trigger/resolve-icon.ts)) devolve **a mesma URL nos dois casos**: o endpoint `/push-notification/icon/:notification_id`. O endpoint então lê a notificação no banco e decide:

| Origem     | O que o endpoint faz                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `icon`     | `302` para `/assets/{id}?width=192&height=192&fit=cover&quality=80` — caminho **relativo**, mesma origem |
| `icon_url` | `302` para a URL externa                                                                                 |
| nenhuma    | `302` para `/admin/favicon.ico`                                                                          |

O payload enviado ao service worker carrega essa URL resolvida no campo `icon_url`, e o service worker apenas a aplica (`data.icon_url || "/admin/favicon.ico"`).

O desvio pelo endpoint foi sustentado por duas justificativas. **Ao serem examinadas, nenhuma se confirmou para o caso da URL externa:**

1. **"O cliente não precisa acessar outra URL, o que evita problemas com proxy."**
   Não procede. Quem baixa o ícone é o browser do cliente, não o Directus. Um `302` apenas instrui o browser a buscar em outro lugar — ele ainda abre conexão com o host externo. Se o proxy ou firewall do cliente bloqueia aquele domínio, o ícone falha do mesmo jeito, agora depois de um hop e uma consulta ao banco a mais. Só um **proxy de verdade** — o servidor baixando os bytes e devolvendo — cumpriria esse objetivo, e o endpoint hoje é `res.redirect` puro, sem `fetch` nem stream.

2. **"O desvio ajuda a contabilizar entregas."**
   Seria estritamente pior do que o mecanismo já existente. O service worker confirma entrega com `PATCH /items/push_delivery/{delivery_id}` (`status: delivered`, `date_delivered`) no evento `push`, e marca `read` no clique — **por dispositivo**. O endpoint de ícone recebe só `notification_id`, então não distingue qual dos N dispositivos do usuário exibiu a notificação, e multi-dispositivo é o ponto central desta extensão. Além disso o ícone é cacheado pelo browser/SO (a segunda notificação com o mesmo ícone não gera requisição), e notificação sem ícone não gera sinal algum.

Resta como benefício real do desvio apenas a URL externa não aparecer no JSON do payload. Como o browser recebe essa mesma URL no `Location` do redirect e precisa resolvê-la, é ofuscação que não sobrevive a um passo de inspeção.

Há ainda uma divergência interna na [task-006](../../TASKS/task-006-icon-field-directus-files.md): sua seção de abordagem TDD especificava, para o caso da URL externa, que _"o payload enviado ao service worker contém a URL fornecida diretamente"_. A implementação fez o oposto, e o teste unitário foi escrito para casar com a implementação, não com a especificação.

## Decisão

**Para `icon_url` (URL externa), o payload passa a carregar a URL direta. Para `icon` (arquivo do Directus), o desvio pelo endpoint é mantido.**

`resolveIconUrl` passa a ter três saídas em vez de duas:

| Entrada           | Saída                                                 |
| ----------------- | ----------------------------------------------------- |
| `icon` preenchido | `/push-notification/icon/{notification_id}` (mantido) |
| só `icon_url`     | a própria `icon_url`                                  |
| nenhum            | `/admin/favicon.ico`                                  |

O endpoint continua existindo e continua sendo a via para o caso do arquivo, onde suas razões se sustentam: o redirect é relativo, permanece na mesma origem, e aplica a transformação 192×192 sem exigir que `directus_files` seja público.

## Alternativas Consideradas

### Opção 1: Manter o redirect para os dois casos (estado atual)

- **Prós:**
  - Nada muda no código
  - Uma única forma de URL de ícone no payload, qualquer que seja a origem
  - A URL externa não aparece no JSON do payload
- **Contras:**
  - Não entrega a proteção contra proxy/firewall que motivou o desenho — o cliente resolve o host externo assim mesmo
  - Um round-trip HTTP e uma consulta ao banco a mais por notificação exibida
  - Mantém o endpoint público `/push-notification/icon/:id` sendo exercitado por notificações que não precisam dele
  - Contradiz a especificação TDD da própria task-006

### Opção 2: Proxy real no endpoint

- **Prós:**
  - **Único caminho que de fato cumpre o objetivo**: o cliente só fala com a origem do Directus, e nunca resolve o host externo
  - Permitiria cache e normalização de tamanho também para ícones externos
- **Contras:**
  - Banda e latência do servidor Directus em toda notificação exibida
  - Exige cache, timeout e limite de tamanho para não virar vetor de exaustão
  - **Superfície de SSRF**: a URL é fornecida por quem cria a notificação, e um `fetch` server-side de URL arbitrária alcança rede interna e endpoints de metadata de nuvem
  - Complexidade desproporcional a um problema que, até aqui, é hipotético — nenhum cliente concreto com proxy restritivo foi identificado

### Opção 3: URL direta para `icon_url`, endpoint para `icon` (escolhida)

- **Prós:**
  - Elimina um hop HTTP e uma leitura no banco por notificação exibida
  - Volta a bater com a especificação TDD original da task-006
  - Preserva o endpoint onde ele tem razão de ser — o arquivo do Directus, mesma origem, com transformação
  - Mudança pequena e de baixo custo de reversão
- **Contras:**
  - A URL externa passa a ser visível no payload
  - O payload deixa de ter forma única: `icon_url` ora carrega um caminho relativo, ora uma URL absoluta

## Tradeoffs

### O que ganhamos

- Um round-trip HTTP e uma consulta ao banco a menos por notificação com ícone externo exibida
- Coerência entre o que a task-006 especificou e o que o código faz
- Menos tráfego no endpoint público de ícone

### O que perdemos

- A URL externa fica legível no payload entregue ao dispositivo

### O que aceitamos como compromisso

- O campo `icon_url` do payload passa a comportar duas formas — caminho relativo (caso arquivo) e URL absoluta (caso externo). O service worker trata as duas igual, porque só repassa o valor para `Notification.icon`
- Assumimos que o dispositivo do usuário alcança o host externo. Isso já é verdade hoje, via redirect; a decisão não muda o requisito de rede, apenas remove a ilusão de que ele não existia

## Consequências

### Positivas

- Menos latência até o ícone aparecer, por eliminar um salto
- Menos carga no Directus por notificação exibida
- O desenho passa a declarar honestamente o requisito de rede em vez de mascará-lo

### Negativas

- Quem inspecionar o payload vê o domínio de onde o ícone vem

### Neutras

- O endpoint `/push-notification/icon/:notification_id` continua existindo e mantém sua assinatura; só deixa de ser acionado quando a notificação tem apenas `icon_url`
- Se um cliente concreto com proxy restritivo aparecer, esta decisão deve ser revisitada — e a resposta certa naquele momento será a Opção 2 (proxy real), não o retorno ao redirect

## Detalhes de Implementação

- `resolveIconUrl` ([`resolve-icon.ts`](../../src/notification-trigger/resolve-icon.ts)) passa a devolver `source.icon_url` quando não há `icon`. A precedência `icon > icon_url > fallback` é preservada
- O fallback quando não há `notification_id` continua valendo para o caso `icon`, que depende do ID para montar a URL do endpoint. Para `icon_url` o `notification_id` deixa de ser necessário
- Atualizar `tests/unit/resolve-icon.test.ts`, bloco "Caso 2", que hoje afirma _"deve retornar URL do endpoint quando apenas icon_url está preenchido"_
- Atualizar a seção de abordagem TDD da task-006, que voltará a descrever o comportamento implementado
- Nenhuma mudança no service worker, no schema ou no payload além do valor de `icon_url`

## Riscos e Mitigações

| Risco                                                                                      | Probabilidade  | Impacto | Mitigação                                                                                                                 |
| ------------------------------------------------------------------------------------------ | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cliente com proxy que bloqueia domínios externos fica sem ícone                            | Baixa          | Baixo   | O ícone degrada para ausente; a notificação continua sendo exibida. Se ocorrer de fato, adotar a Opção 2 (proxy real)     |
| `/assets/{id}` exigir credenciais e o ícone de arquivo não renderizar                      | **Confirmada** | Alto    | **Defeito confirmado em 23/09/2026, pré-existente e independente desta decisão.** Ver a seção "Defeito confirmado" abaixo |
| URL externa apontando para conteúdo impróprio ou que vaza IP do dispositivo ao ser buscada | Baixa          | Baixo   | Já é o caso hoje: o browser busca o host externo de qualquer forma, depois do redirect                                    |

## Defeito Confirmado — o ícone vindo de `directus_files` não renderiza

Verificado em 23/09/2026 com o teste `tests/e2e/icon-endpoint.spec.ts`, contra o
Directus 11.14.1 do ambiente de teste:

| Requisição                                                               | Resposta         |
| ------------------------------------------------------------------------ | ---------------- |
| `/assets/{id}?width=192&height=192&fit=cover&quality=80` **autenticado** | `200`, `image/*` |
| `/assets/{id}?width=192&...` **anônimo**                                 | **`403`**        |
| `/assets/{id}` **anônimo, sem transformação**                            | **`403`**        |

O `403` é da permissão de leitura do arquivo, não da transformação — ocorre com
e sem os parâmetros. Como a camada de notificação do browser busca o ícone **sem
as credenciais da sessão**, o ícone vindo de `directus_files` não aparece no
dispositivo hoje. Só o caminho da URL externa funciona.

A raiz é uma discrepância entre o que o endpoint diz e o que ele faz: o próprio
código se descreve como proxy (`Proxying icon asset for notification`), mas
executa `res.redirect`. Num proxy, quem busca o asset é o servidor, que tem
credencial; num redirect, quem busca é o browser anônimo, que não tem.

Isso **não altera a decisão proposta** para a URL externa — os dois caminhos são
independentes. Altera o caminho do arquivo, que precisa de correção própria. Duas
saídas:

1. **Tornar `directus_files` legível publicamente.** Contraria frontalmente o
   objetivo declarado da task-006 e expõe todos os arquivos, não só os ícones.
2. **Transformar o endpoint em proxy de fato para o arquivo interno** — ler o
   asset no servidor, com a credencial do próprio serviço, e devolver os bytes.
   Aqui não há a superfície de SSRF que pesou contra a Opção 2 na avaliação
   acima, porque a origem não é uma URL arbitrária: é um arquivo do Directus
   referenciado por ID.

A saída 2 é coerente com o que o endpoint já afirma ser, e vale notar que ela
**não** reabre o caso da URL externa: proxiar um ID interno é seguro, proxiar uma
URL fornecida pelo usuário não é.

## Links Relacionados

- [Task 006 — Campo Icon como relação com directus_files](../../TASKS/task-006-icon-field-directus-files.md)
- [`src/notification-trigger/resolve-icon.ts`](../../src/notification-trigger/resolve-icon.ts) — resolução da URL
- [`src/push-notification/index.ts`](../../src/push-notification/index.ts) — endpoint `/icon/:notification_id`
- [`src/push-notification/service-worker.ts`](../../src/push-notification/service-worker.ts) — consumo do payload e confirmação de entrega
- [MDN — Notification.icon](https://developer.mozilla.org/en-US/docs/Web/API/Notification/icon)

## Histórico de Revisões

| Data       | Autor          | Mudança                                                                                             |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------- |
| 2026-09-17 | @sidartaveloso | Criação do documento                                                                                |
| 2026-09-23 | @sidartaveloso | Risco do `/assets/{id}` verificado e confirmado como defeito; seção "Defeito Confirmado" adicionada |

---

## Notas

O desenho original não estava errado por descuido: a indireção **é** a solução certa para o caso do arquivo do Directus, e foi generalizada para a URL externa por simetria. O que não se sustentou foi a generalização — no caso externo ela paga o custo da indireção sem colher nenhum de seus benefícios.

Vale registrar a ordem em que isso apareceu, porque é instrutiva: a justificativa "o cliente não precisa acessar outra URL" só foi testada quando alguém perguntou se fazia sentido. Um `302` parece um desvio, e é fácil confundi-lo com um proxy; a diferença é que o desvio informa o destino ao cliente e o proxy o esconde.
