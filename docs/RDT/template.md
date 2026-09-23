# RDT-XXX: [Título Descritivo da Decisão]

**Data:** AAAA-MM-DD
**Status:** Proposto | Aceito | Rejeitado | Substituído | Depreciado
**Contexto:** [Módulo/Área do Sistema]
**Decisores:** @nome1, @nome2

## Contexto

[Descreva o problema ou situação que requer uma decisão técnica]

**Exemplo:**

> Uma notificação pode ter ícone vindo de um arquivo do Directus ou de uma URL externa. Hoje as duas origens são resolvidas pela mesma indireção, e precisamos decidir se isso se justifica nos dois casos.

## Decisão

[Descreva claramente a decisão tomada]

**Exemplo:**

> A URL externa passa a ir direto no payload; a indireção pelo endpoint fica restrita ao ícone vindo de `directus_files`.

## Alternativas Consideradas

### Opção 1: [Nome da Alternativa]

- **Prós:**
  - Pró 1
  - Pró 2
- **Contras:**
  - Contra 1
  - Contra 2

### Opção 2: [Nome da Alternativa]

- **Prós:**
  - Pró 1
  - Pró 2
- **Contras:**
  - Contra 1
  - Contra 2

### Opção 3: [Nome da Alternativa escolhida]

- **Prós:**
  - Pró 1
  - Pró 2
- **Contras:**
  - Contra 1
  - Contra 2

## Tradeoffs

### O que ganhamos

- Benefício 1
- Benefício 2
- Benefício 3

### O que perdemos

- Limitação 1
- Limitação 2
- Limitação 3

### O que aceitamos como compromisso

- Compromisso 1 (ex: maior complexidade operacional)
- Compromisso 2 (ex: curva de aprendizado)
- Compromisso 3

## Consequências

### Positivas

- Consequência positiva 1
- Consequência positiva 2

### Negativas

- Consequência negativa 1
- Consequência negativa 2

### Neutras

- Mudança que não é boa nem ruim, apenas diferente
- Impacto em área específica que requer atenção

## Detalhes de Implementação

[Opcional - informações técnicas relevantes para implementação]

**Exemplo:**

> - Ajustar `resolveIconUrl` para devolver `icon_url` quando não houver arquivo
> - Atualizar o teste de unidade correspondente
> - Refletir a mudança na task que especificou o comportamento

## Riscos e Mitigações

[Opcional - riscos identificados e como serão tratados]

| Risco                   | Probabilidade | Impacto | Mitigação                  |
| ----------------------- | ------------- | ------- | -------------------------- |
| Exemplo: Perda de dados | Baixa         | Alto    | Backup diário + replicação |

## Links Relacionados

- [RDT-XXX: Decisão relacionada](#)
- [Documentação externa](https://exemplo.com)
- [Issue/Task relacionada](#)

## Histórico de Revisões

| Data       | Autor | Mudança              |
| ---------- | ----- | -------------------- |
| AAAA-MM-DD | @nome | Criação do documento |

---

## Notas

[Espaço para observações adicionais, contexto específico do projeto, ou informações que não se encaixam nas seções acima]
