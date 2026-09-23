# RDT-002: A Referência do Ícone é Validada na Escrita, não na Leitura

**Data:** 2026-09-23
**Status:** Aceito
**Contexto:** Push Notification — autorização do ícone (`notification-trigger`, endpoint `push-notification`)
**Decisores:** @sidartaveloso

## Contexto

O [RDT-001](rdt-001-icone-externo-url-direta-no-payload.md) trocou o redirect pelo
proxy no caso do ícone vindo de `directus_files`. A troca era necessária — o
browser busca o ícone da notificação sem as credenciais da sessão, e
`/assets/{id}` respondia `403`, então o ícone nunca aparecia no dispositivo.

Ela teve, porém, uma consequência que não estava registrada: **a autorização saiu
do Directus e passou a ser responsabilidade deste código**. O endpoint lê o asset
com `accountability: null`, ou seja, com a credencial do serviço. O `403` que
fomos corrigir era a proteção do Directus funcionando; ao removê-la do caminho,
nada foi colocado no lugar.

### A vulnerabilidade, medida

O Directus **não valida permissão de leitura no alvo de um M2O ao gravar a chave
estrangeira**. Isso foi verificado contra o Directus 11.14.1, com um usuário cuja
policy concede apenas `create` e `read` em `user_notification`:

| Requisição                                                | Antes da correção             |
| --------------------------------------------------------- | ----------------------------- |
| `GET /files/{id}` com o token do usuário limitado         | `403`                         |
| `GET /assets/{id}` anônimo                                | `403`                         |
| `POST /items/user_notification` com `icon` = esse arquivo | **`200`, aceito**             |
| `GET /push-notification/icon/{id}` anônimo                | **`200`, `image/png`, bytes** |

Ou seja: qualquer usuário que pudesse criar uma notificação lia qualquer arquivo
do Directus. O vetor não dependia de adivinhar UUID — o atacante criava a própria
notificação e já conhecia o identificador.

A prova está em `tests/e2e/icon-endpoint-permissions.spec.ts`.

## Decisão

**A referência é validada no momento da escrita, com a accountability de quem
escreve.**

Um filter hook em `user_notification.items.create` e `.items.update` tenta ler o
arquivo indicado em `icon` usando a accountability do próprio requisitante. Sem
permissão, o erro vem do Directus e sobe como `403`.

O princípio: **não deveria ser possível criar uma referência para um arquivo que
quem cria não pode ler.** O problema é o dado inválido entrar, não o servidor
entregá-lo depois.

O endpoint continua público e anônimo. Nada muda para o browser, que segue sem
enviar token.

## Alternativas Consideradas

### Opção 1: Validar na leitura, com a accountability de `user_created`

Ao servir o ícone, ler o asset com a accountability do criador da notificação em
vez de `null`.

- **Prós:**
  - Fecha também o caso em que a permissão é revogada depois da criação
  - Não depende de o hook ter sido executado na escrita
- **Contras:**
  - Exige sintetizar uma accountability a partir de um `user_id`, o que no
    Directus 11 significa resolver role e policies à mão — plumbing frágil e
    sensível a versão
  - Custa uma verificação por exibição de notificação, não por escrita
  - Degrada silenciosamente para o favicon: quem criou a notificação nunca
    descobre que o ícone não vai aparecer
  - Compensa o sintoma e deixa o dado inválido gravado

### Opção 2: Restringir o ícone a uma pasta dedicada

Servir apenas arquivos que estejam numa pasta de ícones criada pela extensão.

- **Prós:**
  - Simples, sem plumbing de accountability
  - Limita o estrago ao que já é, por definição, material de ícone
- **Contras:**
  - Não resolve o problema, só reduz o raio: arquivos sensíveis colocados na
    pasta por engano continuam expostos
  - Impõe organização de arquivos ao usuário da extensão
  - Não impede a referência inválida de ser gravada

### Opção 3: Tornar `directus_files` legível publicamente

- **Prós:**
  - Permitiria voltar ao redirect, sem proxy
- **Contras:**
  - Expõe todos os arquivos da instância, não só ícones
  - Contraria frontalmente o objetivo declarado da task-006

### Opção 4: Validar na escrita, com a accountability do requisitante (escolhida)

- **Prós:**
  - Corrige o dado, não o sintoma
  - A accountability necessária **já está disponível** no filter hook — nada a
    sintetizar
  - O erro de permissão é produzido pelo próprio Directus e sobe como `403`, sem
    exceção construída à mão
  - Falha na cara de quem está criando, em vez de degradar depois
  - Uma verificação por escrita, não por exibição
- **Contras:**
  - Não cobre revogação de permissão posterior à criação
  - Não cobre escritas que não passem pelo hook

## Tradeoffs

### O que ganhamos

- A escalada de privilégio deixa de existir: ninguém expõe um arquivo que não
  poderia ler
- O feedback é imediato e no lugar certo — quem referencia errado recebe `403`
- Custo proporcional ao volume de escrita, não ao de exibição

### O que perdemos

- A janela entre criação e revogação de permissão fica descoberta

### O que aceitamos como compromisso

- Escrita com accountability nula — outra extensão ou rotina de servidor criando
  notificação — passa sem verificação. É deliberado: código de servidor é
  confiável, e exigir permissão dele quebraria a criação programática
- Notificação criada por admin pode referenciar qualquer arquivo, porque o admin
  pode ler qualquer arquivo. A checagem limita a exposição ao que o criador já
  alcançava — não menos que isso
- O endpoint permanece público: quem tiver o UUID da notificação busca o ícone
  sem autenticação. Isso é requisito do dispositivo, e o UUID v4 torna
  enumeração inviável — mas é acesso por posse do identificador, não por
  permissão

## Consequências

### Positivas

- O caminho do ícone volta a ter autorização, agora explícita e testada
- A suíte passou a cobrir permissão do ícone, que antes não tinha teste algum

### Negativas

- Integrações que referenciavam arquivos sem permissão de leitura passam a
  receber `403` — é breaking change deliberado
- A extensão passa a compensar, no seu escopo, um comportamento da plataforma.
  Se o Directus um dia validar o M2O na escrita, esta checagem vira redundante

### Neutras

- O endpoint e o proxy do RDT-001 seguem inalterados
- A URL externa não é afetada: ela não referencia arquivo do Directus

## Detalhes de Implementação

- `src/notification-trigger/assert-icon-readable.ts` isola a regra: recebe o
  payload, uma fábrica de leitor de arquivo e a accountability, e só age quando
  `icon` vem preenchido
- `src/notification-trigger/index.ts` liga a regra aos dois filters, montando um
  `ItemsService("directus_files")` com a accountability do contexto do evento
- Nenhuma exceção é construída: o `readOne` do Directus é quem falha
- `tests/e2e/icon-endpoint-permissions.spec.ts` cria policy, role e usuário
  limitados por execução, com sufixo aleatório — nomes fixos colidiam com
  resíduos e entre workers

## Riscos e Mitigações

| Risco                                                                               | Probabilidade | Impacto | Mitigação                                                                            |
| ----------------------------------------------------------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------ |
| Permissão revogada depois da criação; o ícone continua sendo servido                | Baixa         | Médio   | Aceito. Se virar problema concreto, adotar também a Opção 1 como segunda camada      |
| Escrita direta no banco, contornando o hook                                         | Baixa         | Médio   | Fora do modelo de ameaça: quem escreve direto no banco já tem acesso total           |
| Notificação criada por integração com token de admin referenciando arquivo sensível | Média         | Baixo   | A exposição fica limitada ao que o token já podia ler; usar tokens com escopo mínimo |
| UUID de notificação vazado expõe o ícone daquela notificação                        | Baixa         | Baixo   | Aceito por desenho: o dispositivo precisa buscar o ícone sem credencial              |

## Links Relacionados

- [RDT-001: Ícone de URL Externa Vai Direto no Payload](rdt-001-icone-externo-url-direta-no-payload.md) — introduziu o proxy que criou a exposição
- [Task 006 — Campo Icon como relação com directus_files](../../TASKS/task-006-icon-field-directus-files.md)
- `src/notification-trigger/assert-icon-readable.ts` — a regra
- `tests/e2e/icon-endpoint-permissions.spec.ts` — a prova e a regressão

## Histórico de Revisões

| Data       | Autor          | Mudança                                                           |
| ---------- | -------------- | ----------------------------------------------------------------- |
| 2026-09-23 | @sidartaveloso | Criação do documento, já com a correção implementada e verificada |

---

## Notas

Vale registrar a sequência, porque ela é o argumento a favor de escrever teste
para premissa de segurança. A exposição não foi encontrada por revisão de
código: ela apareceu porque alguém perguntou se o endpoint podia ser usado para
alcançar arquivos fora do escopo, e a resposta inicial foi uma afirmação sem
prova. Só ao transformar a afirmação em teste é que a cadeia inteira ficou
visível — inclusive o passo que contrariava a expectativa de todos, o Directus
aceitando gravar o M2O sem validar leitura no alvo.
