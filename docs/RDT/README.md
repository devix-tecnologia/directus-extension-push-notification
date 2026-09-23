# RDT - Registros de Decisão Técnica

Este diretório contém os Registros de Decisão Técnica (RDT) do projeto. Cada RDT documenta uma decisão arquitetural ou técnica importante, incluindo o contexto, alternativas consideradas e consequências.

## Índice de Decisões

| ID                                                    | Título                                                               | Status   | Data       |
| ----------------------------------------------------- | -------------------------------------------------------------------- | -------- | ---------- |
| [001](rdt-001-icone-externo-url-direta-no-payload.md) | Ícone de URL Externa Vai Direto no Payload, sem Desvio pelo Directus | Proposto | 2026-09-17 |

## Status Possíveis

- **Proposto** - Decisão em discussão, ainda não implementada
- **Aceito** - Decisão aprovada e em implementação/implementada
- **Rejeitado** - Decisão considerada mas não aprovada
- **Substituído** - Decisão que foi substituída por outra (indicar qual)
- **Depreciado** - Decisão que não é mais válida/relevante

## Como Criar um Novo RDT

1. Copie o arquivo [`template.md`](template.md)
2. Renomeie para `rdt-XXX-titulo-descritivo.md` (número sequencial com 3 dígitos)
3. Preencha todas as seções do template
4. Adicione uma linha na tabela acima
5. Crie um Pull Request para revisão da equipe

## Estrutura de um RDT

Cada RDT contém:

- **Contexto**: Por que precisamos tomar essa decisão?
- **Decisão**: O que foi decidido?
- **Alternativas Consideradas**: Quais outras opções foram avaliadas?
- **Tradeoffs**: O que ganhamos, perdemos e aceitamos como compromisso?
- **Consequências**: Quais os impactos positivos e negativos?

## Princípios

- **Documentar decisões importantes**: Nem toda escolha técnica precisa de um RDT. Foque em decisões que impactam arquitetura, equipe ou múltiplos módulos.
- **Ser objetivo**: Decisões devem ser claras e justificadas tecnicamente.
- **Manter histórico**: Nunca apague RDTs antigos. Marque como "Substituído" ou "Depreciado".
- **Revisar em equipe**: RDTs devem passar por revisão antes de serem aceitos.

## Quando Criar um RDT?

Crie um RDT quando você precisar decidir sobre:

- Escolha de tecnologias principais (banco de dados, frameworks, linguagens)
- Padrões arquiteturais (monolito vs microserviços, event-driven, etc)
- Integrações críticas (serviços de push, sistemas externos)
- Mudanças que afetam múltiplos módulos
- Decisões que têm alto custo de reversão
- Padrões de código que devem ser seguidos por toda equipe

## Quando NÃO Criar um RDT?

Não crie RDTs para:

- Decisões rotineiras de implementação
- Escolhas facilmente reversíveis
- Decisões já cobertas por RDTs existentes
- Preferências pessoais sem impacto arquitetural

---

**Dúvidas?** Consulte o [template.md](template.md) ou pergunte ao time.
